import assert from 'node:assert/strict';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { root, hash, readJson, writeJson } from '../src/io.ts';
import { callProvider, defaultModels, validateResponse } from '../src/provider.ts';
import { buildMethodRequest, composeMethodWorkflow, methodFits, methodPolicy, scoreMethodFits } from '../src/skill-methods.ts';
import type { MethodFragment, MethodTask, MethodVariant } from '../src/skill-methods.ts';
import type { Json, Request } from '../src/types.ts';
import type { CallResult } from '../src/provider.ts';

interface Manifest {
  createdAt: string; live: boolean; model: string; policy: typeof methodPolicy;
  catalog: MethodFragment[]; cases: MethodTask[]; sources: Record<string,string>;
  hashes: Record<string,string>; code: Record<string,string>; variants: MethodVariant[];
}
interface Event extends CallResult {
  caseId: string; variant: MethodVariant; request: Request; fingerprint: string; elapsedMs: number;
  score: ReturnType<typeof scoreMethodFits> | null;
  workflow: ReturnType<typeof composeMethodWorkflow>;
}

/** Verify exact spans against retained source versions; never consult installed skills. */
function verifySources(manifest: Manifest) {
  assert.equal(new Set(manifest.catalog.map(f=>f.id)).size,manifest.catalog.length);
  assert.equal(new Set(manifest.cases.map(c=>c.id)).size,manifest.cases.length);
  for (const f of manifest.catalog) {
    const source = manifest.sources[f.source];
    assert.equal(hash(source),f.sourceHash);
    assert.equal(source.split('\n').slice(f.startLine-1,f.endLine).join('\n'),f.excerpt);
  }
  assert.equal(hash(manifest.catalog),manifest.hashes.catalog);
  assert.equal(hash(manifest.cases),manifest.hashes.cases);
  assert.equal(hash(manifest.sources),manifest.hashes.sources);
  assert.equal(hash(manifest.code),manifest.hashes.code);
}
function summarize(events: Event[]) {
  return {
    requests:events.length, httpCalls:events.reduce((n,e)=>n+e.attempts,0),
    errors:events.filter(e=>e.error).length, matched:events.filter(e=>e.score?.success).length,
    reportedCostUsd:events.reduce((n,e)=>n+(e.response?.usage.cost??0),0),
    unreportedCosts:events.filter(e=>e.response&&e.response.usage.cost===undefined).length,
    returnedModels:[...new Set(events.flatMap(e=>e.response?[e.response.model]:[]))],
    results:events.map(e=>({caseId:e.caseId,variant:e.variant,...e.score,workflowStatus:e.workflow.status,steps:e.workflow.steps.map(s=>s.id),uncertain:e.workflow.uncertain})),
  };
}
const args = process.argv.slice(2);
if (args[0] === '--verify') {
  if (args.length !== 2) throw new Error('Usage: --verify run-directory');
  const dir = args[1], manifest = await readJson<Manifest>(`${dir}/manifest.json`);
  verifySources(manifest);
  assert.equal(manifest.policy.version,methodPolicy.version);
  const events = (await readFile(`${dir}/events.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(l=>JSON.parse(l) as Event);
  const seen = new Set<string>();
  for (const e of events) {
    const item = manifest.cases.find(c=>c.id===e.caseId)!;
    assert.ok(item); assert.ok(manifest.variants.includes(e.variant));
    const id = `${e.caseId}/${e.variant}`; assert.ok(!seen.has(id)); seen.add(id);
    const request = buildMethodRequest(item,manifest.catalog,manifest.model,e.variant);
    assert.deepEqual(e.request,request); assert.equal(hash(request),e.fingerprint);
    if (e.response) assert.deepEqual(validateResponse(e.rawResponse as Json,request),e.response);
    assert.deepEqual(e.score,e.response?scoreMethodFits(item,methodFits(e.response)):null);
    assert.deepEqual(e.workflow,composeMethodWorkflow(item,manifest.catalog,e.response?methodFits(e.response):undefined));
  }
  assert.deepEqual(await readJson(`${dir}/summary.json`),summarize(events));
  if(manifest.live) assert.equal(events.length,manifest.cases.length*manifest.variants.length);
  console.log(JSON.stringify({verified:true,...summarize(events)},null,2));
} else {
  if (args.some(a=>a!=='--live')) throw new Error('Use --live, no arguments for dry run, or --verify run-directory.');
  const live = args.includes('--live'), apiKey = process.env.OPENROUTER_API_KEY;
  if (live && !apiKey) throw new Error('OPENROUTER_API_KEY is unavailable.');
  const base = `${root}/studies/skill-methods`;
  const catalog = await readJson<MethodFragment[]>(`${base}/catalog.json`);
  const cases = await readJson<MethodTask[]>(`${base}/cases.json`);
  const sources = await readJson<Record<string,string>>(`${base}/source-texts.json`);
  const code = Object.fromEntries(await Promise.all(['src/skill-methods.ts','src/provider.ts','src/io.ts','scripts/probe-skill-methods.ts'].map(async p=>[p,await readFile(`${root}/${p}`,'utf8')])));
  const manifest: Manifest = {createdAt:new Date().toISOString(),live,model:defaultModels.openrouter,policy:methodPolicy,catalog,cases,sources,code,hashes:{catalog:hash(catalog),cases:hash(cases),sources:hash(sources),code:hash(code)},variants:['canonical','reversed']};
  verifySources(manifest);
  const dir = `${base}/runs/${manifest.createdAt.replaceAll(':','-')}`;
  await mkdir(dir,{recursive:true});
  await writeJson(`${dir}/manifest.json`,manifest);
  await writeJson(`${dir}/requests.json`,cases.flatMap(c=>manifest.variants.map(v=>({caseId:c.id,variant:v,request:buildMethodRequest(c,catalog,manifest.model,v)}))));
  await appendFile(`${dir}/events.jsonl`,'',{mode:0o600,flag:'wx'});
  const events: Event[] = [];
  if(live) for(const item of cases) {
    let stop = false;
    for(const variant of manifest.variants) {
      const request = buildMethodRequest(item,catalog,manifest.model,variant), start = performance.now();
      const result = await callProvider('openrouter',request,{apiKey:apiKey!});
      const fits = result.response?methodFits(result.response):undefined;
      const event: Event = {caseId:item.id,variant,request,fingerprint:hash(request),elapsedMs:performance.now()-start,...result,score:fits?scoreMethodFits(item,fits):null,workflow:composeMethodWorkflow(item,catalog,fits)};
      events.push(event); await appendFile(`${dir}/events.jsonl`,JSON.stringify(event)+'\n');
      console.log(`${item.id}/${variant}: ${event.score?.success??'error'}; ${event.workflow.status}; ${event.workflow.steps.map(s=>s.id).join(' -> ')}`);
      if(result.error) process.exitCode = 1;
      if(result.error?.status&&[401,402,403,404].includes(result.error.status)){stop=true;break;}
    }
    if(stop) break;
  }
  await writeJson(`${dir}/summary.json`,summarize(events));
  console.log(`Skill-method probe: ${dir}`);
}
