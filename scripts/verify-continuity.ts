import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { root, hash, readJson } from '../src/io.ts';
import { buildContinuityRequest, continuityPolicy, makePacket, selectionFromResponse } from '../src/continuity.ts';
import { continuitySummary, continuityReport, validateContinuityCases } from '../src/continuity-study.ts';
import { validateResponse } from '../src/provider.ts';
import type { ContinuityCase } from '../src/continuity.ts';
import type { ContinuityManifest, ContinuityEvent } from '../src/continuity-study.ts';

/** Recompute continuity results without network calls; verify frozen source lineage. */
const cases=await readJson<ContinuityCase[]>(`${root}/studies/continuity/cases.json`);
const protocol=await readJson<{frozenAt:string}>(`${root}/studies/continuity/protocol.json`);
validateContinuityCases(cases);
let cost=0,calls=0;
for(const name of (await readdir(`${root}/studies/continuity/runs`)).sort()) {
  const dir=`${root}/studies/continuity/runs/${name}`;
  const manifest=await readJson<ContinuityManifest>(`${dir}/manifest.json`);
  const events=(await readFile(`${dir}/events.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line) as ContinuityEvent);
  const sources=await readJson<Record<string,string>>(`${dir}/source-snapshot.json`);
  for(const [path,digest] of Object.entries(manifest.hashes).filter(([p])=>p.startsWith('src/')))assert.equal(hash(sources[path]),digest);
  assert.equal(hash(cases),manifest.hashes.cases);
  assert.equal(hash(protocol),manifest.hashes.protocol);
  assert.equal(hash(continuityPolicy),manifest.hashes.policy);
  assert.ok(Date.parse(protocol.frozenAt)<=Date.parse(manifest.createdAt));
  assert.equal(new Set(events.map(e=>`${e.caseId}/${e.variant}`)).size,events.length);
  const previews=await readJson<Array<{caseId:string;variant:string;request:unknown}>>(`${dir}/requests.json`);
  const expectedPackets=[];
  for(const e of events) {
    const item=manifest.cases.find(c=>c.id===e.caseId)!;assert.ok(item);
    assert.equal(e.fingerprint,hash(e.request));
    assert.deepEqual(e.request,buildContinuityRequest(item,manifest.model,e.variant));
    assert.deepEqual(previews.find(p=>p.caseId===e.caseId&&p.variant===e.variant)?.request,e.request);
    assert.ok(Date.parse(e.startedAt)>=Date.parse(manifest.createdAt));
    if(e.response)assert.deepEqual(validateResponse(e.rawResponse,e.request),e.response);
    else assert.ok(e.error);
    if(e.response&&e.kind!=='wake') {
      const selection=selectionFromResponse(item,e.response);
      expectedPackets.push({caseId:e.caseId,variant:e.variant,selection,packet:makePacket(item,selection)});
    }
    for(const key of [process.env.OPENROUTER_API_KEY,process.env.TYPESAFE_API_KEY].filter((x):x is string=>!!x))assert.equal(JSON.stringify(e).includes(key),false,'Credential found in stored event');
  }
  assert.deepEqual(await readJson(`${dir}/packets.json`),expectedPackets);
  const summary=continuitySummary(manifest,events);
  assert.deepEqual(await readJson(`${dir}/summary.json`),summary);
  assert.equal(await readFile(`${dir}/report.md`,'utf8'),continuityReport(manifest,events));
  cost+=summary.reportedCostUsd??0;calls+=summary.httpAttempts;
  console.log(`${name}: verified ${events.length} events and ${expectedPackets.length} source-preserving packets`);
}
for(const name of await readdir(`${root}/studies/continuity/crowding`)) {
  const dir=`${root}/studies/continuity/crowding/${name}`;
  const events=(await readFile(`${dir}/events.jsonl`,'utf8')).trim().split('\n').map(line=>JSON.parse(line) as ContinuityEvent);
  const summary=await readJson<{costUsd:number;requests:number;originalComplete:number;sourceCapComplete:number}>(`${dir}/summary.json`);
  const manifest=await readJson<{items:ContinuityCase[];sourceHashes:Record<string,string>;model:string}>(`${dir}/manifest.json`);
  const sources=await readJson<Record<string,string>>(`${dir}/source-snapshot.json`);
  for(const [p,digest] of Object.entries(manifest.sourceHashes))assert.equal(hash(sources[p]),digest);
  let originalComplete=0,cappedComplete=0;
  for(const e of events) {
    assert.equal(e.fingerprint,hash(e.request));
    const item=manifest.items.find(c=>c.id===e.caseId)!;
    assert.deepEqual(e.request,buildContinuityRequest(item,manifest.model,e.variant));
    if(e.response)assert.deepEqual(validateResponse(e.rawResponse,e.request),e.response);
    const probe=e as unknown as {original:{selected:string[]};capped:{selected:string[]};requiredSources:string[];originalCoverage:number|null;cappedCoverage:number|null};
    assert.deepEqual(probe.original,selectionFromResponse(item,e.response));
    const roots=item.gold.required.map(id=>item.cards.find(c=>c.id===id)!.source);
    assert.deepEqual(probe.requiredSources,roots);
    const coverage=(ids:string[])=>roots.filter(s=>ids.some(id=>item.cards.find(c=>c.id===id)?.source===s)).length;
    if(e.response) {
      assert.equal(coverage(probe.original.selected),probe.originalCoverage);
      assert.equal(coverage(probe.capped.selected),probe.cappedCoverage);
      originalComplete+=probe.originalCoverage===roots.length?1:0;
      cappedComplete+=probe.cappedCoverage===roots.length?1:0;
    }
  }
  assert.equal(events.length,summary.requests);
  assert.equal(originalComplete,summary.originalComplete);assert.equal(cappedComplete,summary.sourceCapComplete);
  assert.equal(events.reduce((n,e)=>n+(e.response?.usage.cost??0),0),summary.costUsd);
  cost+=summary.costUsd;calls+=events.reduce((n,e)=>n+e.attempts,0);
  console.log(`${name}: verified ${events.length} crowding-probe responses and source coverage`);
}
console.log(JSON.stringify({totalCalls:calls,reportedCostUsd:cost},null,2));
