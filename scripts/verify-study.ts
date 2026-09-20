import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { hash, readJson, root } from '../src/io.ts';
import { buildRequest, sourceChecks } from '../src/questions.ts';
import { validateResponse } from '../src/provider.ts';
import { renderReport, summarize } from '../src/report.ts';
import type { Event, Manifest } from '../src/types.ts';

/** Read-only audit: recompute every result from frozen requests and raw responses. */
let totalCalls = 0, cost = 0, tokens = 0;
const elapsed: number[] = [];
const revision = await readJson<{ frozenAt: string; sourceRun: string; sourceManifestHash: string; sourceEventsHash: string; originalRubricHash: string; revisedRubricHash: string }>(`${root}/experiments/revision.json`);
assert.equal(hash(await readJson(`${root}/${revision.sourceRun}/manifest.json`)), revision.sourceManifestHash);
assert.equal(hash(await readFile(`${root}/${revision.sourceRun}/events.jsonl`, 'utf8')), revision.sourceEventsHash);
for (const name of (await readdir(`${root}/runs`)).sort()) {
  const dir = `${root}/runs/${name}`;
  const manifest = await readJson<Manifest>(`${dir}/manifest.json`);
  const events = (await readFile(`${dir}/events.jsonl`, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Event);
  const sources = await readJson<Record<string, string>>(`${dir}/source-snapshot.json`);
  for (const [path, expected] of Object.entries(manifest.hashes).filter(([path]) => path.startsWith('src/'))) assert.equal(hash(sources[path]), expected, `${name}: source archive ${path}`);
  assert.equal(hash(manifest.rubric), manifest.hashes.rubric);
  assert.equal(hash(manifest.baselines), manifest.hashes.baselines);
  assert.ok(Date.parse(manifest.baselines.createdAt) <= Date.parse(manifest.createdAt));
  if (manifest.split === 'evaluation') {
    assert.ok(Date.parse(revision.frozenAt) <= Date.parse(manifest.createdAt), 'Revision must precede evaluation');
    assert.equal(hash(manifest.rubric), manifest.rubric.version === 'v1' ? revision.originalRubricHash : revision.revisedRubricHash);
  }
  assert.equal(new Set(events.map(e => `${e.caseId}/${e.variant}`)).size, events.length, 'No duplicated case/variant events');
  const preview = await readJson<Array<{ caseId: string; variant: string; request: unknown }>>(`${dir}/requests.json`);
  assert.equal(preview.length, manifest.plannedRequests);
  for (const e of events) {
    const item = manifest.cases.find(c => c.id === e.caseId);
    assert.ok(item);
    assert.ok(manifest.variants.includes(e.variant));
    assert.ok(Date.parse(e.startedAt) >= Date.parse(manifest.createdAt));
    assert.deepEqual(e.request, buildRequest(item, manifest.rubric, manifest.requestedModel, e.variant), `${name}: request reconstruction`);
    assert.equal(e.fingerprint, hash(e.request));
    assert.deepEqual(preview.find(p => p.caseId === e.caseId && p.variant === e.variant)?.request, e.request);
    if (e.response) assert.deepEqual(validateResponse(e.rawResponse, e.request), e.response);
    else assert.ok(e.error, 'Every call has a response or an error');
    // Check configured secrets by equality without printing their values.
    for (const secret of [process.env.TYPESAFE_API_KEY, process.env.OPENROUTER_API_KEY].filter((s): s is string => !!s)) assert.equal(JSON.stringify(e).includes(secret), false, 'Credential found in event');
  }
  assert.deepEqual(await readJson(`${dir}/source-checks.json`), Object.fromEntries(manifest.cases.map(c => [c.id, sourceChecks(c)])));
  const summary = summarize(manifest, events);
  assert.deepEqual(await readJson(`${dir}/summary.json`), summary);
  assert.equal(await readFile(`${dir}/report.md`, 'utf8'), renderReport(manifest, events));
  totalCalls += summary.httpAttempts; cost += summary.reportedCostUsd ?? 0; tokens += summary.inputTokens;
  elapsed.push(...events.filter(e => e.response).map(e => e.elapsedMs));
  console.log(`${name}: verified ${events.length} records, ${summary.failedRequests} errors`);
}
elapsed.sort((a, b) => a - b);
console.log(JSON.stringify({ httpCalls: totalCalls, reportedCostUsd: cost, inputTokens: tokens, medianMs: elapsed[Math.floor(elapsed.length / 2)] }, null, 2));
