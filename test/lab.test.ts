import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadDataset, validateDataset } from '../src/dataset.ts';
import { hash, readJson, root } from '../src/io.ts';
import { buildRequest, sourceChecks } from '../src/questions.ts';
import { defaultModels, callProvider, endpoints, isFloatingModel, validateResponse } from '../src/provider.ts';

/** Concrete slug used wherever a run must stay comparable across model releases. */
const PINNED = 'typesafe/jev-1.13';
import { runExperiment } from '../src/runner.ts';
import { renderReport, summarize } from '../src/report.ts';
import type { Event, Manifest, Request, Response as JevResponse, Rubric } from '../src/types.ts';

const rubric = await readJson<Rubric>(`${root}/experiments/rubrics/v1.json`);
const data = await loadDataset(rubric);

/** Deterministic fake provider: contract tests only, never a model-quality baseline. */
function answer(request: Request): JevResponse {
  return {
    model: 'typesafe/jev-test', usage: { input_tokens: 12, output_tokens: 3, cost: 0.000001 },
    answers: Object.fromEntries(Object.entries(request.questions).map(([id, q]) => {
      if (q.type === 'noul') return [id, { type: 'noul', noul: 0.5 }];
      if (q.type === 'score') return [id, { type: 'score', score: 0, legend: Object.fromEntries(q.criteria.map((v, i) => [String(i), v])), probabilities: Object.fromEntries(q.criteria.map((_, i) => [String(i), i === 0 ? 1 : 0])), confidence: 1 }];
      const keys = Object.keys(q.criteria);
      return [id, { type: 'choice', choice: keys[0], probabilities: Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 1 : 0])), confidence: 1 }];
    })),
  };
}
const fakeFetch: typeof fetch = async (_input, init) => new Response(JSON.stringify(answer(JSON.parse(init!.body as string) as Request)), { status: 200 });

test('fixture coverage, incomplete labels, duplicate IDs and candidate bounds', () => {
  validateDataset(data, rubric);
  const missing = structuredClone(data); delete missing.gold.b01;
  assert.throws(() => validateDataset(missing, rubric), /IDs/);
  const duplicate = structuredClone(data); duplicate.cases[1].id = duplicate.cases[0].id;
  assert.throws(() => validateDataset(duplicate, rubric), /duplicate/);
  const bad = structuredClone(data); bad.gold.q01.labels = ['not-a-candidate'];
  assert.throws(() => validateDataset(bad, rubric), /gold/);
});

test('model requests contain neither gold nor baselines; variants preserve fixture state', () => {
  for (const item of data.cases) {
    const before = JSON.stringify(item);
    const canonical = buildRequest(item, rubric, 'jev-latest', 'canonical');
    const paraphrase = buildRequest(item, rubric, 'jev-latest', 'paraphrase');
    const reversed = buildRequest(item, rubric, 'jev-latest', 'reversed');
    assert.deepEqual(Object.keys(canonical), ['model', 'state', 'questions']);
    assert.equal(JSON.stringify(canonical).includes(data.gold[item.id].reason), false);
    assert.deepEqual(canonical.state, paraphrase.state);
    assert.notEqual(canonical.questions.judgment.instructions, paraphrase.questions.judgment.instructions);
    assert.deepEqual(Object.keys(canonical.questions.judgment.criteria!).sort(), Object.keys(reversed.questions.judgment.criteria!).sort());
    assert.equal(JSON.stringify(item), before);
  }
});

test('circular source metadata and exact quotes are checked without inference', () => {
  assert.equal(sourceChecks(data.cases.find(c => c.id === 'b03')!).uniqueDeclaredRoots, 1);
  assert.equal(sourceChecks(data.cases.find(c => c.id === 'b06')!).quotePresent, true);
  const changed = structuredClone(data.cases.find(c => c.id === 'b06')!);
  changed.state.quote = 'every token is metal';
  assert.equal(sourceChecks(changed).quotePresent, false);
});

test('all three answer types validate against their actual request', () => {
  for (const item of data.cases) {
    const request = buildRequest(item, rubric, 'jev-latest', 'canonical');
    assert.deepEqual(validateResponse(answer(request), request), answer(request));
  }
});

test('reject malformed, omitted, wrong-type, out-of-range and inconsistent answers', () => {
  const request = buildRequest(data.cases[0], rubric, 'jev-latest', 'canonical');
  const raw = answer(request);
  assert.throws(() => validateResponse({}, request));
  assert.throws(() => validateResponse({ ...raw, answers: {} }, request), /IDs/);
  assert.throws(() => validateResponse({ ...raw, usage: { input_tokens: -1, output_tokens: 0 } }, request), /numeric/);
  const bad = structuredClone(raw); bad.answers.judgment = { type: 'noul', noul: 0.5 };
  assert.throws(() => validateResponse(bad, request), /type mismatch/);
  const badRange = structuredClone(raw); badRange.answers.new_evidence = { type: 'noul', noul: NaN };
  assert.throws(() => validateResponse(badRange, request), /numeric/);
  const badChoice = structuredClone(raw);
  if (badChoice.answers.judgment.type === 'choice') badChoice.answers.judgment.choice = 'invented';
  assert.throws(() => validateResponse(badChoice, request), /Unknown choice/);
  const badSum = structuredClone(raw);
  if (badSum.answers.judgment.type === 'choice') badSum.answers.judgment.probabilities.supports = 0.1;
  assert.throws(() => validateResponse(badSum, request), /Unnormalized/);
  const scoreRequest = buildRequest(data.cases.find(c => c.id === 'q01')!, rubric, 'jev-latest', 'canonical');
  const badScore = answer(scoreRequest);
  if (badScore.answers.discrimination_A.type === 'score') badScore.answers.discrimination_A.score = 2;
  assert.throws(() => validateResponse(badScore, scoreRequest), /disagree/);
});

test('both transports use dedicated endpoints with credentials only in headers', async () => {
  for (const provider of ['typesafe', 'openrouter'] as const) {
    const model = defaultModels[provider];
    const request = buildRequest(data.cases[0], rubric, model, 'canonical');
    const result = await callProvider(provider, request, { apiKey: 'test-secret', fetcher: async (url, init) => {
      assert.equal(url, endpoints[provider]);
      assert.equal(new Headers(init!.headers).get('authorization'), 'Bearer test-secret');
      assert.equal((init!.body as string).includes('test-secret'), false);
      assert.equal(init!.redirect, 'error');
      return fakeFetch(url, init);
    } });
    assert.ok(result.response); assert.equal(result.attempts, 1);
  }
});

test('errors are redacted, HTTP retries are bounded, and long backoff is respected', async () => {
  const request = buildRequest(data.cases[0], rubric, 'jev-latest', 'canonical');
  let count = 0;
  const retry = await callProvider('typesafe', request, { apiKey: 'hidden-token', fetcher: async (url, init) => {
    count++; return count === 1 ? new Response('temporary', { status: 429, headers: { 'retry-after': '0' } }) : fakeFetch(url, init);
  } });
  assert.equal(retry.attempts, 2); assert.ok(retry.response);
  const failed = await callProvider('typesafe', request, { apiKey: 'hidden-token', fetcher: async () => new Response('{"error":"hidden-token"}', { status: 401 }) });
  assert.equal(failed.attempts, 1); assert.equal(failed.error?.status, 401);
  assert.equal(JSON.stringify(failed).includes('hidden-token'), false);
  const limited = await callProvider('typesafe', request, { apiKey: 'hidden-token', fetcher: async () => new Response('busy', { status: 429, headers: { 'retry-after': '60' } }) });
  assert.equal(limited.attempts, 1); assert.equal(limited.error?.status, 429);
  const invalid = await callProvider('typesafe', request, { apiKey: 'hidden-token', fetcher: async () => new Response('<html>not JSON</html>') });
  assert.equal(invalid.error?.kind, 'validation');
});

test('missing credentials, forbidden models and timeouts produce no false judgments', async () => {
  const request = buildRequest(data.cases[0], rubric, 'jev-latest', 'canonical');
  const never: typeof fetch = async () => { throw new Error('must not call'); };
  const missing = await callProvider('typesafe', request, { apiKey: '', fetcher: never });
  assert.equal(missing.attempts, 0);
  const forbidden = await callProvider('typesafe', { ...request, model: 'gpt-anything' }, { apiKey: 'test', fetcher: never });
  assert.equal(forbidden.attempts, 0);
  const timedOut = await callProvider('typesafe', request, { apiKey: 'test', fetcher: async () => { throw new DOMException('timeout', 'TimeoutError'); } });
  assert.equal(timedOut.error?.kind, 'network'); assert.equal(timedOut.response, undefined);
  const actualTimeout = await callProvider('typesafe', request, { apiKey: 'test', timeoutMs: 10, fetcher: async (_url, init) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(JSON.stringify(answer(request)))), 200);
    init!.signal!.addEventListener('abort', () => { clearTimeout(timer); reject(init!.signal!.reason); });
  }) });
  assert.equal(actualTimeout.error?.kind, 'network');
});

test('run snapshots precede inference, preserve full events and replay reports without network', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'jev-lab-test-'));
  try {
    let calls = 0;
    const dir = await runExperiment({ provider: 'openrouter', split: 'development', rubricVersion: 'v1', variants: ['canonical'], live: true, apiKey: 'test-secret', outputRoot, fetcher: async (url, init) => {
      calls++;
      const [run] = await readdir(outputRoot);
      const manifest = await readJson<Manifest>(join(outputRoot, run, 'manifest.json'));
      assert.equal(manifest.hashes.baselines, hash(data.baselines));
      assert.equal(JSON.stringify(manifest).includes('test-secret'), false);
      return fakeFetch(url, init);
    } });
    assert.equal(calls, 18);
    const manifest = await readJson<Manifest>(join(dir, 'manifest.json'));
    const sources = await readJson<Record<string, string>>(join(dir, 'source-snapshot.json'));
    assert.equal(hash(sources['src/runner.ts']), manifest.hashes['src/runner.ts']);
    const events = (await readFile(join(dir, 'events.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Event);
    assert.equal(events.length, 18);
    assert.equal(events[0].fingerprint, hash(events[0].request));
    assert.equal(await readFile(join(dir, 'report.md'), 'utf8'), renderReport(manifest, events));
    assert.equal(summarize(manifest, events).successfulRequests, 18);
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});

test('dry runs cannot look like inference; auth failure leaves incomplete counts visible', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'jev-lab-test-'));
  try {
    const dry = await runExperiment({ provider: 'openrouter', split: 'development', rubricVersion: 'v1', variants: ['canonical'], live: false, outputRoot });
    assert.match(await readFile(join(dry, 'report.md'), 'utf8'), /DRY RUN — NO INFERENCE/);
    assert.equal(await readFile(join(dry, 'events.jsonl'), 'utf8'), '');
    const failed = await runExperiment({ provider: 'openrouter', split: 'development', rubricVersion: 'v1', variants: ['canonical'], live: true, apiKey: 'test', outputRoot, fetcher: async () => new Response('denied', { status: 401 }) });
    const summary = await readJson<{ failedRequests: number; unattemptedRequests: number }>(join(failed, 'summary.json'));
    assert.equal(summary.failedRequests, 1); assert.equal(summary.unattemptedRequests, 17);
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});

test('equally acceptable choices can vary without a harmful change', () => {
  const item = data.cases.find(c => c.id === 'q10')!;
  const request = buildRequest(item, rubric, 'jev-latest', 'canonical');
  const first = answer(request), second = answer(request);
  if (first.answers.judgment.type === 'choice') first.answers.judgment.choice = 'A';
  if (second.answers.judgment.type === 'choice') second.answers.judgment.choice = 'B';
  const manifest = { cases: [item], variants: ['canonical', 'reversed'], gold: data.gold, baselines: data.baselines, plannedRequests: 2 } as Manifest;
  const events = [ { caseId: 'q10', direction: 'question', variant: 'canonical', response: first }, { caseId: 'q10', direction: 'question', variant: 'reversed', response: second } ] as Event[];
  const row = summarize(manifest, events).rows.find(r => r.direction === 'question')!;
  assert.equal(row.changed, 1); assert.equal(row.harmful, 0); assert.equal(row.allCorrect, 2);
});

test('evaluation dry run enforces revision provenance and preserves both rubric variants', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'jev-lab-evaluation-'));
  try {
    for (const rubricVersion of ['v1', 'v2'] as const) {
      const dir = await runExperiment({ provider: 'openrouter', split: 'evaluation', rubricVersion, variants: ['canonical', 'reversed'], live: false, outputRoot, model: PINNED });
      const manifest = await readJson<Manifest>(join(dir, 'manifest.json'));
      assert.equal(manifest.plannedRequests, 36);
      assert.ok(manifest.cases.every(c => c.split === 'evaluation'));
      assert.equal(manifest.rubric.version, rubricVersion);
    }
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});

test('baseline exports separate unaided/checklist conditions and omit answer keys', () => {
  for (const condition of ['unaided', 'checklist']) {
    const exported = JSON.parse(execFileSync(process.execPath, [`${root}/src/cli.ts`, 'prompts', '--split', 'evaluation', '--condition', condition], { encoding: 'utf8' }));
    assert.equal(exported.cases.length, 18);
    assert.equal(Object.hasOwn(exported, 'checklist'), condition === 'checklist');
    assert.equal(Object.hasOwn(exported, 'gold'), false);
    assert.equal(JSON.stringify(exported).includes(data.gold.b07.reason), false);
    assert.ok(exported.cases.every((c: { id: string }) => ['07','08','09','10','11','12'].includes(c.id.slice(1))));
  }
});

test('evaluation runs refuse a floating model alias and accept a concrete slug', async () => {
  assert.ok(isFloatingModel('~typesafe/jev-latest'));
  assert.ok(isFloatingModel('jev-latest'));
  assert.ok(!isFloatingModel(PINNED));
  assert.ok(!isFloatingModel('typesafe/jev-1.13-20260917'));
  assert.ok(isFloatingModel(defaultModels.openrouter), 'everyday default tracks the newest version');
  const outputRoot = await mkdtemp(join(tmpdir(), 'jev-pin-'));
  try {
    await assert.rejects(
      runExperiment({ provider: 'openrouter', split: 'evaluation', rubricVersion: 'v1', variants: ['canonical'], live: false, outputRoot }),
      /concrete model/,
    );
    assert.equal((await readdir(outputRoot)).length, 0, 'a refused run writes nothing');
    const dir = await runExperiment({ provider: 'openrouter', split: 'evaluation', rubricVersion: 'v1', variants: ['canonical'], live: false, outputRoot, model: PINNED });
    const manifest = await readJson<Manifest>(join(dir, 'manifest.json'));
    assert.equal(manifest.requestedModel, PINNED);
    // Development runs stay on the alias: only the frozen comparison needs pinning.
    await runExperiment({ provider: 'openrouter', split: 'development', rubricVersion: 'v1', variants: ['canonical'], live: false, outputRoot });
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});
