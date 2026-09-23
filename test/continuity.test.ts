import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJson, root, hash } from '../src/io.ts';
import { baselineScores, buildContinuityRequest, eligible, makePacket, selectCards, selectionFromResponse, wakeFromResponse } from '../src/continuity.ts';
import { runContinuity, validateContinuityCases, continuityReport, continuitySummary } from '../src/continuity-study.ts';
import type { ContinuityCase } from '../src/continuity.ts';
import type { ContinuityManifest, ContinuityEvent } from '../src/continuity-study.ts';
import type { Request, Response as JevResponse } from '../src/types.ts';

const cases = await readJson<ContinuityCase[]>(`${root}/studies/continuity/cases.json`);
test('continuity fixtures are complete, segregated, and have valid record references', () => {
  validateContinuityCases(cases);
  const bad = structuredClone(cases); bad[0].gold.required = ['missing'];
  assert.throws(() => validateContinuityCases(bad), /Unknown label/);
});
test('all variants withhold labels and remove incompatible or superseded memories', () => {
  for (const c of cases) for (const variant of ['canonical','paraphrase','reversed'] as const) {
    const request = buildContinuityRequest(c, 'jev-latest', variant);
    assert.equal(JSON.stringify(request).includes(c.gold.reason), false);
    const state = request.state as Record<string, unknown>;
    assert.equal(Object.hasOwn(state, 'gold'), false);
    assert.deepEqual((state.cards as {id: string}[]).map(x => x.id).sort(), c.cards.filter(x => eligible(x,c.scope)).map(x => x.id).sort());
  }
});
test('pins and dependency closure survive ranking, while invalid scope never enters a packet', () => {
  const c = structuredClone(cases.find(c => c.id === 'p3')!);
  c.cards[0].pinned = true;
  const scores = Object.fromEntries(c.cards.map((card, i) => [card.id, i]));
  const selection = selectCards(c, scores, 0, 3);
  assert.ok(selection.selected.includes(c.cards[0].id));
  assert.ok(selection.selected.includes(c.cards[1].id));
  assert.equal(selection.selected.length, 3);
  assert.ok(selection.selected.every(id => eligible(c.cards.find(x => x.id === id)!, c.scope)));
  assert.equal(selectCards(c, scores, 0, 1).status, 'overflow');
});
test('missing and cyclic prerequisites are visible and not partially admitted', () => {
  const c = structuredClone(cases.find(c => c.id === 'p3')!);
  c.cards[0].pinned = true; c.cards[0].needs = ['missing'];
  const result = selectCards(c, {[c.cards[0].id]: 3}, 1.5, 3);
  assert.equal(result.status, 'needs_context');
  assert.equal(result.selected.includes(c.cards[0].id), false);
  c.cards[0].needs = [c.cards[1].id]; c.cards[1].needs = [c.cards[0].id];
  assert.equal(selectCards(c, {[c.cards[0].id]: 3}, 1.5, 3).status, 'needs_context');
});
test('extractive packet keeps hypothetical status and source text unchanged', () => {
  const c = cases.find(c => c.id === 'p3')!;
  const selected = selectCards(c, {[c.cards[0].id]:3}, 1.5, 3);
  const packet = makePacket(c, selected) as { records: Array<{id: string; text: string; source: string; role: string}> };
  for (const record of packet.records) {
    const source = c.cards.find(card => card.id === record.id)!;
    assert.equal(record.text, source.text); assert.equal(record.source, source.source); assert.equal(record.role, source.role);
  }
  assert.equal(packet.records[0].role, 'hypothesis');
});
test('equal-valued methods remain independently eligible and provider failures stay explicit', () => {
  const c = cases.find(c => c.id === 'm3')!;
  assert.deepEqual(selectCards(c, {M2:3,M3:3}, 1.5, 2).selected, ['M2','M3']);
  assert.equal(selectionFromResponse(c).status, 'provider_error');
  assert.equal(wakeFromResponse(cases[0]).judgment, 'provider_error');
  const cancelled = structuredClone(cases[0]); cancelled.cards[0].status = 'cancelled';
  const response: JevResponse = {model:'jev-test',usage:{input_tokens:1,output_tokens:1},answers:{judgment:{type:'choice',choice:'wake',confidence:1,probabilities:{wake:1,wait:0,review:0}}}};
  assert.deepEqual(wakeFromResponse(cancelled, response).surfaced, []);
});
test('baselines share eligibility and use only content or chronology, not expected labels', () => {
  const c = cases.find(c => c.id === 'p4')!;
  const changed = structuredClone(c); changed.gold.required = [];
  assert.deepEqual(baselineScores(c,'lexical'), baselineScores(changed,'lexical'));
  assert.deepEqual(baselineScores(c,'recent'), baselineScores(changed,'recent'));
  assert.ok(!Object.hasOwn(baselineScores(c,'recent'), 'P4X'));
});
test('continuity run is frozen, replayable, credential-free, and visibly incomplete on transport failure', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'jev-continuity-test-'));
  try {
    const dir = await runContinuity({provider:'openrouter',split:'development',live:true,apiKey:'dummy-secret',outputRoot,fetcher:async()=>new Response('no access',{status:401})});
    const manifest = await readJson<ContinuityManifest>(`${dir}/manifest.json`);
    const events = (await readFile(`${dir}/events.jsonl`,'utf8')).trim().split('\n').map(line=>JSON.parse(line) as ContinuityEvent);
    assert.equal(events.length,1); assert.equal(continuitySummary(manifest,events).unattempted,53);
    assert.equal(events[0].fingerprint,hash(events[0].request));
    assert.equal(JSON.stringify(events).includes('dummy-secret'),false);
    assert.equal(await readFile(`${dir}/report.md`,'utf8'),continuityReport(manifest,events));
    const dry = await runContinuity({provider:'openrouter',split:'evaluation',live:false,outputRoot,model:'typesafe/jev-1.13-20260917'});
    assert.match(await readFile(`${dry}/report.md`,'utf8'),/DRY RUN, NO INFERENCE/);
  } finally { await rm(outputRoot,{recursive:true,force:true}); }
});

test('continuity evaluation pins its model before writes or inference, including dry runs', async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'jev-continuity-pin-'));
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response('denied', {status: 401}); };
  try {
    for (const live of [false, true]) for (const provider of ['openrouter', 'typesafe'] as const) {
      for (const model of [undefined, provider === 'openrouter' ? '~typesafe/jev-latest' : 'jev-latest']) {
        await assert.rejects(runContinuity({provider, split:'evaluation', live, model, apiKey:'dummy', outputRoot, fetcher}), /concrete model/);
        assert.deepEqual(await readdir(outputRoot), []);
      }
    }
    assert.equal(calls, 0);
    const model = 'typesafe/jev-1.13-20260917';
    const dir = await runContinuity({provider:'openrouter',split:'evaluation',live:true,model,apiKey:'dummy',outputRoot,fetcher});
    assert.equal(calls, 1);
    const manifest = await readJson<ContinuityManifest>(join(dir, 'manifest.json'));
    assert.equal(manifest.model, model);
    const requests = await readJson<Array<{request: Request}>>(join(dir, 'requests.json'));
    assert.ok(requests.every(row => row.request.model === model));
    const dev = await runContinuity({provider:'openrouter',split:'development',live:false,outputRoot});
    assert.equal((await readJson<ContinuityManifest>(join(dev, 'manifest.json'))).model, '~typesafe/jev-latest');
  } finally { await rm(outputRoot, {recursive:true,force:true}); }
});
