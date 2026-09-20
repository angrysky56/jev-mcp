import type { Answer, Json, Provider, Request, Response } from './types.ts';

export const endpoints: Record<Provider, string> = {
  typesafe: 'https://api.typesafe.ai/v1/systemone',
  openrouter: 'https://openrouter.ai/api/alpha/decisions',
};
export const defaultModels: Record<Provider, string> = {
  // OpenRouter's leading '~' marks a floating latest-resolution alias; responses report the
  // concrete slug that served the request. Pin a concrete slug for reproducible studies.
  typesafe: 'jev-latest', openrouter: '~typesafe/jev-latest',
};
/** A floating alias resolves to whatever version is newest at call time: OpenRouter's leading
 *  "~" latest-resolution form, or any "-latest" slug. Fine for everyday use, unusable for a
 *  frozen study, because two runs can silently measure two different models. */
export const isFloatingModel = (model: string): boolean => model.startsWith('~') || /(^|[-/])latest$/.test(model);

export class ProviderError extends Error {
  kind: string;
  status?: number;
  constructor(kind: string, message: string, status?: number) {
    super(message); this.kind = kind; this.status = status;
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProviderError('validation', 'Expected an object in provider response.');
  return value as Record<string, unknown>;
}
function number(value: unknown, low = 0, high = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) throw new ProviderError('validation', 'Invalid numeric provider value.');
  return value;
}
function sameKeys(actual: object, expected: object): boolean {
  return JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(Object.keys(expected).sort());
}

/** Validate the entire answer set before any answer is scored or consumed. */
export function validateResponse(raw: unknown, request: Request): Response {
  const response = object(raw), answers = object(response.answers), usage = object(response.usage);
  if (typeof response.model !== 'string' || !response.model) throw new ProviderError('validation', 'Missing response model.');
  if (!sameKeys(answers, request.questions)) throw new ProviderError('validation', 'Response question IDs do not match the request.');
  const normalized: Record<string, Answer> = {};
  for (const [id, question] of Object.entries(request.questions)) {
    const answer = object(answers[id]);
    if (answer.type !== question.type) throw new ProviderError('validation', `Answer type mismatch for ${id}.`);
    if (question.type === 'noul') {
      normalized[id] = { type: 'noul', noul: number(answer.noul, 0, 1) }; continue;
    }
    const expected = question.type === 'choice' ? question.criteria : Object.fromEntries(question.criteria.map((x, i) => [String(i), x]));
    const probabilities = object(answer.probabilities);
    if (!sameKeys(probabilities, expected)) throw new ProviderError('validation', `Invalid probability labels for ${id}.`);
    const distribution = Object.fromEntries(Object.entries(probabilities).map(([k, v]) => [k, number(v, 0, 1)]));
    // Documented examples round probabilities; allow small rounding error only.
    if (Math.abs(Object.values(distribution).reduce((a, b) => a + b, 0) - 1) > 0.025) throw new ProviderError('validation', `Unnormalized probabilities for ${id}.`);
    const confidence = number(answer.confidence, 0, 1);
    if (question.type === 'choice') {
      if (typeof answer.choice !== 'string' || !Object.hasOwn(expected, answer.choice)) throw new ProviderError('validation', `Unknown choice for ${id}.`);
      if (distribution[answer.choice] + 0.015 < Math.max(...Object.values(distribution))) throw new ProviderError('validation', `Choice is not a probability maximum for ${id}.`);
      normalized[id] = { type: 'choice', choice: answer.choice, probabilities: distribution, confidence };
    } else {
      const legend = object(answer.legend);
      if (!sameKeys(legend, expected) || Object.keys(expected).some(k => legend[k] !== expected[k])) throw new ProviderError('validation', `Score legend mismatch for ${id}.`);
      const score = number(answer.score, 0, question.criteria.length - 1);
      const expectation = Object.entries(distribution).reduce((sum, [k, p]) => sum + Number(k) * p, 0);
      if (Math.abs(score - expectation) > 0.05) throw new ProviderError('validation', `Score and distribution disagree for ${id}.`);
      normalized[id] = { type: 'score', score, legend: expected, probabilities: distribution, confidence };
    }
  }
  const input = number(usage.input_tokens), output = number(usage.output_tokens);
  if (!Number.isInteger(input) || !Number.isInteger(output)) throw new ProviderError('validation', 'Token usage must be integral.');
  return {
    model: response.model, answers: normalized,
    usage: { input_tokens: input, output_tokens: output, ...(usage.cost === undefined ? {} : { cost: number(usage.cost) }) },
    ...(typeof response.id === 'string' ? { id: response.id } : {}),
    ...(typeof response.provider === 'string' ? { provider: response.provider } : {}),
  };
}

export interface CallResult { response?: Response; rawResponse?: Json; error?: { kind: string; message: string; status?: number }; attempts: number }

/** Only fixed TypeSafe/OpenRouter endpoints receive keys; no generative model route. */
export async function callProvider(provider: Provider, request: Request, options: {
  apiKey: string; fetcher?: typeof fetch; timeoutMs?: number; signal?: AbortSignal;
}): Promise<CallResult> {
  if (!options.apiKey) return { attempts: 0, error: { kind: 'configuration', message: `Missing ${provider} API key.` } };
  if (!(provider === 'typesafe' ? /^jev-[a-zA-Z0-9.-]+$/ : /^~?typesafe\/jev-[a-zA-Z0-9.-]+$/).test(request.model)) {
    return { attempts: 0, error: { kind: 'configuration', message: 'This experiment harness only calls Jev models.' } };
  }
  const body = JSON.stringify(request);
  if (Buffer.byteLength(body) > 40_000) return { attempts: 0, error: { kind: 'configuration', message: 'Request exceeds the 40 KB experiment limit.' } };
  const fetcher = options.fetcher ?? fetch;
  let rawResponse: Json | undefined;
  let attempts = 0;
  try {
    // One retry for transient HTTP errors only; preserve the attempt count.
    for (attempts = 1; attempts <= 2; attempts++) {
      const res = await fetcher(endpoints[provider], {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body, signal: options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(options.timeoutMs ?? 20_000)]) : AbortSignal.timeout(options.timeoutMs ?? 20_000),
      });
      const text = await res.text();
      const safeText = text.replaceAll(options.apiKey, '[REDACTED]');
      try { rawResponse = JSON.parse(safeText) as Json; } catch { rawResponse = safeText.slice(0, 2000); }
      if (!res.ok) {
        const retryAfter = res.headers.get('retry-after');
        const delay = retryAfter ? (/^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 500;
        if ([429, 500, 502, 503, 529].includes(res.status) && attempts === 1 && Number.isFinite(delay) && delay >= 0 && delay <= 5_000) {
          await new Promise(resolve => setTimeout(resolve, delay)); continue;
        }
        throw new ProviderError('http', `Provider returned HTTP ${res.status}. See the redacted response record.`, res.status);
      }
      return { response: validateResponse(rawResponse, request), rawResponse, attempts };
    }
    throw new ProviderError('http', 'Retry limit reached.');
  } catch (error) {
    const known = error instanceof ProviderError;
    return {
      attempts, ...(rawResponse === undefined ? {} : { rawResponse }),
      error: { kind: known ? error.kind : 'network', message: known ? error.message : 'Request failed or timed out; no usable provider response.', ...(known && error.status ? { status: error.status } : {}) },
    };
  }
}
