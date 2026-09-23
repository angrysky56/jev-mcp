import { readFile, readdir, mkdir, appendFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hash, root, readJson, writeJson } from './io.ts';
import { callProvider, studyModel } from './provider.ts';
import { baselineScores, buildContinuityRequest, continuityPolicy, eligible, makePacket, overlap, scoreSelection, selectCards, selectionFromResponse, wakeFromResponse } from './continuity.ts';
import type { ContinuityCase, ContinuityVariant, Selection } from './continuity.ts';
import type { Provider, Request } from './types.ts';
import type { CallResult } from './provider.ts';

export interface ContinuityManifest {
  createdAt: string; live: boolean; provider: Provider; model: string;
  split: ContinuityCase['split']; variants: ContinuityVariant[];
  policy: typeof continuityPolicy; protocol: unknown; cases: ContinuityCase[];
  hashes: Record<string, string>; plannedRequests: number;
}
export interface ContinuityEvent extends CallResult {
  caseId: string; kind: ContinuityCase['kind']; variant: ContinuityVariant;
  startedAt: string; elapsedMs: number; request: Request; fingerprint: string;
}
export function validateContinuityCases(cases: ContinuityCase[]): void {
  if (cases.length !== 36 || new Set(cases.map(c => c.id)).size !== 36) throw new Error('Expected 36 unique continuity cases.');
  for (const kind of ['wake','packet','method']) for (const split of ['development','evaluation']) {
    if (cases.filter(c => c.kind === kind && c.split === split).length !== 6) throw new Error('Each function needs six cases per split.');
  }
  for (const c of cases) {
    const ids = c.cards.map(card => card.id);
    if (!c.task || !c.context || !c.scope || !c.gold.reason || new Set(ids).size !== ids.length) throw new Error(`Invalid case ${c.id}`);
    if (c.gold.required.some(id => !ids.includes(id)) || c.gold.forbidden.some(id => !ids.includes(id))) throw new Error(`Unknown label ID in ${c.id}`);
    if (c.gold.required.some(id => c.gold.forbidden.includes(id))) throw new Error(`Conflicting label in ${c.id}`);
    if (c.kind === 'wake' && (!c.event || !c.trigger || !['wake','wait','review'].includes(c.gold.wake ?? ''))) throw new Error(`Missing wake fields in ${c.id}`);
    if (c.cards.some(card => !card.text || !card.source || !['active','superseded','cancelled'].includes(card.status))) throw new Error(`Invalid memory card in ${c.id}`);
  }
}
function budget(c: ContinuityCase): number { return c.kind === 'packet' ? continuityPolicy.packetCardLimit : continuityPolicy.methodCardLimit; }

export function continuitySummary(manifest: ContinuityManifest, events: ContinuityEvent[]) {
  const rows = (['wake','packet','method'] as const).map(kind => {
    const cases = manifest.cases.filter(c => c.kind === kind);
    let lexical = 0, recent = 0, canonical = 0, allVariants = 0, valid = 0, forbidden = 0, required = 0, found = 0, characters = 0, packetCharacters = 0;
    for (const c of cases) {
      if (kind === 'wake') {
        lexical += (overlap(c.trigger!, c.event!) >= 2 ? 'wake' : 'wait') === c.gold.wake ? 1 : 0;
      } else {
        lexical += scoreSelection(c, selectCards(c, baselineScores(c, 'lexical'), 0, budget(c)).selected).success ? 1 : 0;
        recent += scoreSelection(c, selectCards(c, baselineScores(c, 'recent'), 0, budget(c)).selected).success ? 1 : 0;
      }
      for (const e of events.filter(e => e.caseId === c.id)) {
        if (!e.response) continue;
        valid++;
        let matched = false;
        if (kind === 'wake') matched = wakeFromResponse(c, e.response).judgment === c.gold.wake;
        else {
          const selected = selectionFromResponse(c, e.response), result = scoreSelection(c, selected.selected);
          matched = selected.status === 'ready' && result.success;
          forbidden += result.forbiddenIncluded; required += result.requiredTotal; found += result.requiredFound;
          if (e.variant === 'canonical') { characters += selected.sourceCharacters; packetCharacters += selected.packetCharacters; }
        }
        if (matched) { allVariants++; if (e.variant === 'canonical') canonical++; }
      }
    }
    return { kind, cases: cases.length, lexical, recent: kind === 'wake' ? null : recent, canonical, allVariants, planned: cases.length * manifest.variants.length, valid, forbidden, required, found, characters, packetCharacters };
  });
  const valid = events.filter(e => e.response);
  const times = valid.map(e => e.elapsedMs).sort((a, b) => a - b);
  return {
    rows, plannedRequests: manifest.plannedRequests, recordedRequests: events.length, validRequests: valid.length,
    errors: events.filter(e => e.error).length, unattempted: manifest.plannedRequests - events.length,
    httpAttempts: events.reduce((n, e) => n + e.attempts, 0),
    inputTokens: valid.reduce((n, e) => n + e.response!.usage.input_tokens, 0),
    reportedCostUsd: valid.some(e => e.response!.usage.cost !== undefined) ? valid.reduce((n, e) => n + (e.response!.usage.cost ?? 0), 0) : null,
    costCoverage: `${valid.filter(e => e.response!.usage.cost !== undefined).length}/${valid.length} validated responses; excludes any unknown error charges`,
    medianMs: times.length ? times[Math.floor(times.length / 2)] : null,
    models: [...new Set(valid.map(e => e.response!.model))],
  };
}
export function continuityReport(manifest: ContinuityManifest, events: ContinuityEvent[]): string {
  const summary = continuitySummary(manifest, events);
  const lines = [`# Continuity study: ${manifest.split} — ${manifest.live ? 'live' : 'DRY RUN, NO INFERENCE'}`, '',
    `Created ${manifest.createdAt}. Provider ${manifest.provider}; requested ${manifest.model}; returned ${summary.models.join(', ') || 'none'}.`,
    `Validated ${summary.validRequests}/${summary.plannedRequests} requests; errors ${summary.errors}; unattempted ${summary.unattempted}.`,
    `Reported cost: ${summary.reportedCostUsd === null ? 'unavailable' : '$' + summary.reportedCostUsd.toFixed(8)}. Median successful call: ${summary.medianMs?.toFixed(0) ?? 'n/a'} ms. Input tokens: ${summary.inputTokens}.`, '',
    '| Function | Cases | Lexical baseline | Recent baseline | Jev canonical | Jev all variants |',
    '| --- | ---: | ---: | ---: | ---: | ---: |'];
  for (const r of summary.rows) lines.push(`| ${r.kind} | ${r.cases} | ${r.lexical}/${r.cases} | ${r.recent === null ? 'n/a' : `${r.recent}/${r.cases}`} | ${manifest.live ? `${r.canonical}/${r.cases}` : 'not run'} | ${manifest.live ? `${r.allVariants}/${r.planned}` : 'not run'} |`);
  lines.push('', 'Success means matching the author-specified reminder category, or retrieving every designated required card while excluding designated forbidden cards. Other retrieved items are not necessarily irrelevant; card-level precision is not established. Variants are repeated presentations of the same six cases, not independent samples.', '',
    '## Individual results', '', '| Case | Variant | Expected | Returned | Match |', '| --- | --- | --- | --- | --- |');
  for (const e of events) {
    const c = manifest.cases.find(c => c.id === e.caseId)!;
    if (e.error) { lines.push(`| ${c.id} | ${e.variant} | — | ERROR ${e.error.kind} | no response |`); continue; }
    const result = c.kind === 'wake' ? wakeFromResponse(c, e.response).judgment : selectionFromResponse(c, e.response).selected.join(', ');
    const match = c.kind === 'wake' ? result === c.gold.wake : scoreSelection(c, selectionFromResponse(c, e.response).selected).success;
    lines.push(`| ${c.id} | ${e.variant} | ${c.kind === 'wake' ? c.gold.wake : c.gold.required.join(', ')} | ${result || 'empty'} | ${match ? 'yes' : 'MISMATCH'} |`);
  }
  lines.push('', '## Limits', '',
    'This is a same-author synthetic stress test, intentionally challenging recency and keyword matching. No independent reviewer, real conversation distribution, downstream agent continuation, belief update, self-awareness, or successful execution was measured. No claims about consciousness are inferred from an operational capability record.',
    '', 'Three-card packets and two-card method suggestions preserve source text, role, scope, and lifecycle. Character counts measure selected record text only, excluding references and metadata; they are not token savings. Eligibility, pins, and dependency closure are identical in all selection conditions. Incompatible scopes and superseded records are excluded by code, so those successes cannot be credited to Jev.',
    '', 'No memory archive was deleted, no action was executed, and no native host context was replaced. Same-source pointers can always recover omitted material. Policy and cases were frozen before inference; no threshold was tuned on these results.', '');
  return lines.join('\n');
}

export async function runContinuity(options: { live: boolean; provider: Provider; split: ContinuityCase['split']; model?: string; outputRoot?: string; apiKey?: string; fetcher?: typeof fetch }): Promise<string> {
  const model = studyModel(options.provider, options.split, options.model);
  const cases = await readJson<ContinuityCase[]>(`${root}/studies/continuity/cases.json`);
  const protocol = await readJson(`${root}/studies/continuity/protocol.json`);
  validateContinuityCases(cases);
  if (options.live && !options.apiKey) throw new Error('Selected provider key is not inherited by this process.');
  const selected = cases.filter(c => c.split === options.split);
  const variants: ContinuityVariant[] = ['canonical','paraphrase','reversed'];
  const sources = Object.fromEntries(await Promise.all((await readdir(`${root}/src`)).filter(f => f.endsWith('.ts')).map(async f => [`src/${f}`, await readFile(`${root}/src/${f}`, 'utf8')])));
  const manifest: ContinuityManifest = {
    createdAt: new Date().toISOString(), live: options.live, provider: options.provider, model, split: options.split, variants,
    policy: continuityPolicy, protocol, cases: selected, plannedRequests: selected.length * variants.length,
    hashes: { cases: hash(cases), protocol: hash(protocol), policy: hash(continuityPolicy), ...Object.fromEntries(Object.entries(sources).map(([f, s]) => [f, hash(s)])) },
  };
  const path = `${options.outputRoot ?? `${root}/studies/continuity/runs`}/${manifest.createdAt.replaceAll(':','-')}-${options.split}-${randomUUID().slice(0, 8)}`;
  await mkdir(path, { recursive: true });
  await writeJson(`${path}/manifest.json`, manifest); await writeJson(`${path}/source-snapshot.json`, sources);
  const requests = selected.flatMap(item => variants.map(variant => ({ item, variant, request: buildContinuityRequest(item, manifest.model, variant) })));
  await writeJson(`${path}/requests.json`, requests.map(({ item, variant, request }) => ({ caseId: item.id, variant, request })));
  await writeFile(`${path}/events.jsonl`, '', { flag: 'wx', mode: 0o600 });
  const events: ContinuityEvent[] = [];
  if (options.live) for (const { item, variant, request } of requests) {
    const startedAt = new Date().toISOString(), start = performance.now();
    const response = await callProvider(options.provider, request, { apiKey: options.apiKey!, fetcher: options.fetcher });
    const e: ContinuityEvent = { caseId: item.id, kind: item.kind, variant, request, fingerprint: hash(request), elapsedMs: performance.now() - start, startedAt, ...response };
    await appendFile(`${path}/events.jsonl`, JSON.stringify(e) + '\n'); events.push(e);
    console.log(`${events.length}/${manifest.plannedRequests} ${item.id}/${variant}: ${e.error ? `ERROR ${e.error.kind}` : 'recorded'}`);
    if (e.error?.kind === 'configuration' || [401,402,403,404].includes(e.error?.status ?? 0)) break;
  }
  const packets = events.filter(e => e.response && e.kind !== 'wake').map(e => {
    const item = selected.find(c => c.id === e.caseId)!;
    const selection = selectionFromResponse(item, e.response);
    return { caseId: e.caseId, variant: e.variant, selection, packet: makePacket(item, selection) };
  });
  await writeJson(`${path}/packets.json`, packets);
  await writeJson(`${path}/baselines.json`, selected.map(item => item.kind === 'wake'
    ? { caseId: item.id, lexical: overlap(item.trigger!, item.event!) >= 2 ? 'wake' : 'wait' }
    : { caseId: item.id, lexical: selectCards(item, baselineScores(item, 'lexical'), 0, budget(item)), recent: selectCards(item, baselineScores(item, 'recent'), 0, budget(item)) }));
  await writeJson(`${path}/summary.json`, continuitySummary(manifest, events));
  await writeFile(`${path}/report.md`, continuityReport(manifest, events), { flag: 'wx' });
  return path;
}
