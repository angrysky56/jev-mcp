import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { root, hash, readJson } from '../src/io.ts';
import { validateResponse } from '../src/provider.ts';
import { matches } from '../src/runtime-contracts.ts';
import type { Capability, Rule } from '../src/runtime-contracts.ts';
import type { Answer, Json, Request, Response } from '../src/types.ts';

type Event={stage:string;request:Request;fingerprint:string;cached:boolean;attempts:number;response?:Response;rawResponse?:Json;error?:{kind:string}};
type Run={runId:string;manifest:{provider:string;context:Json;capability:{definition:Capability;hash:string}};items:{id:string;data:Json;events:Event[];result:{status:string;stages:Record<string,{status:string;answers?:Record<string,Answer>}>}}[];summary:{modelCalls:number;httpAttempts:number;reportedCostUsd:number;cacheHits:number};outcomes:{reported:Record<string,unknown>}[]};
let verifiedRuns=0,calls=0,cost=0;
for(const group of ['runs','refinements'])for(const name of await readdir(`${root}/studies/runtime/${group}`)){
  const dir=`${root}/studies/runtime/${group}/${name}`;
  const manifest=await readJson<{sourceHashes:Record<string,string>}>(`${dir}/manifest.json`);
  const source=await readJson<Record<string,string>>(`${dir}/source-snapshot.json`);
  for(const [path,fingerprint]of Object.entries(manifest.sourceHashes))assert.equal(hash(source[path]),fingerprint,path);
  const runs=await readJson<Run[]>(`${dir}/runs.json`);
  const seen=new Set<string>();
  for(const run of runs){
    assert.ok(!seen.has(run.runId));seen.add(run.runId);
    assert.equal(hash(run.manifest.capability.definition),run.manifest.capability.hash);
    let runCalls=0,attempts=0,runCost=0,hits=0;
    for(const item of run.items){
      const prior:Record<string,Record<string,Answer>>={};
      for(const event of item.events){
        const stage=run.manifest.capability.definition.stages.find(s=>s.id===event.stage)!;assert.ok(stage);
        assert.ok(!stage.when||stage.when.every(r=>matches(r,prior)));
        assert.deepEqual(event.request.state,{item:item.data,context:run.manifest.context,prior});
        assert.deepEqual(event.request.questions,stage.questions);
        assert.equal(event.fingerprint,hash({provider:run.manifest.provider,request:event.request}));
        if(event.response){
          assert.deepEqual(validateResponse(event.rawResponse??event.response,event.request),event.response);
          prior[stage.id]=event.response.answers;
          assert.deepEqual(item.result.stages[stage.id].answers,event.response.answers);
        }
        if(event.cached)hits++;else if(event.error?.kind!=='cancelled'){runCalls++;runCost+=event.response?.usage.cost??0;}
        attempts+=event.attempts;
      }
    }
    assert.equal(run.summary.modelCalls,runCalls);assert.equal(run.summary.httpAttempts,attempts);assert.equal(run.summary.cacheHits,hits);assert.ok(Math.abs(run.summary.reportedCostUsd-runCost)<1e-12);
    for(const {reported}of run.outcomes)if(reported.kind==='authored_test_evaluation'){
      const evaluation=reported as {expected:{id:string;expected:Rule[]}[];passed:number;checks:unknown[]};
      const checks=evaluation.expected.map(c=>{
        const result=run.items.find(i=>i.id===c.id)!.result;
        const answers=Object.fromEntries(Object.entries(result.stages).flatMap(([id,s])=>s.answers?[[id,s.answers]]:[]));
        const failed=c.expected.filter(r=>!matches(r,answers));
        return {id:c.id,passed:result.status==='complete'&&!failed.length,failed};
      });
      assert.deepEqual(evaluation.checks,checks);assert.equal(evaluation.passed,checks.filter(c=>c.passed).length);
    }
    verifiedRuns++;calls+=runCalls;cost+=runCost;
  }
  const summary=await readJson<{modelCalls:number;httpAttempts:number;reportedCostUsd:number}>(`${dir}/summary.json`);
  assert.equal(summary.modelCalls,runs.reduce((n,r)=>n+r.summary.modelCalls,0));
  assert.equal(summary.httpAttempts,runs.reduce((n,r)=>n+r.summary.httpAttempts,0));
  assert.ok(Math.abs(summary.reportedCostUsd-runs.reduce((n,r)=>n+r.summary.reportedCostUsd,0))<1e-12);
  console.log(`${group}/${name}: verified ${runs.length} stored runs`);
}
console.log(JSON.stringify({verifiedRuns,modelCalls:calls,reportedCostUsd:cost},null,2));
