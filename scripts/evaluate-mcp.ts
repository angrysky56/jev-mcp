import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdir, readFile, readdir, appendFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { root, readJson, writeJson, hash } from '../src/io.ts';
import type { Capability, Rule } from '../src/runtime-contracts.ts';

if(!process.argv.includes('--live'))throw new Error('This is a live MCP evaluation. Pass --live with OPENROUTER_API_KEY inherited.');
if(!process.env.OPENROUTER_API_KEY)throw new Error('OPENROUTER_API_KEY is unavailable.');
const definitions=await readJson<Capability[]>(`${root}/experiments/runtime-capabilities.json`);
if(process.argv.includes('--refined')){
  const revision=await readJson<{newDefinition:Capability}>(`${root}/studies/runtime/refinements/2026-09-20T08-14-24.025Z/manifest.json`);
  definitions[definitions.findIndex(d=>d.name==='evidence_status')]=revision.newDefinition;
}
const records=await readJson<Record<string,unknown>[]>(`${root}/experiments/runtime-records.json`);
const dir=`${root}/studies/runtime/runs/${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(dir,{recursive:true,mode:0o700});
const sourcePaths=[...(await readdir(`${root}/src`)).filter(f=>f.endsWith('.ts')).map(f=>`src/${f}`),'scripts/evaluate-mcp.ts','package.json','package-lock.json'];
const sourceSnapshot=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,await readFile(`${root}/${p}`,'utf8')])));
const cases=[
  {id:'done',data:{text:'We completed the controlled trial and recorded that humidity did not change.'},expected:[{stage:'classify',question:'status',op:'eq',value:'reported_complete'}]},
  {id:'plan',data:{text:'We plan to run the controlled trial tomorrow; no test has happened.'},expected:[{stage:'classify',question:'status',op:'eq',value:'not_complete'}]},
  {id:'ambiguous',data:{text:'That thing is sorted, apparently.'},expected:[{stage:'classify',question:'status',op:'eq',value:'unclear'}]},
] satisfies {id:string;data:unknown;expected:Rule[]}[];
await writeJson(`${dir}/manifest.json`,{createdAt:new Date().toISOString(),provider:'openrouter',definitions,records,cases,evals:await readFile(`${root}/evals.xml`,'utf8'),sourceHashes:Object.fromEntries(Object.entries(sourceSnapshot).map(([p,t])=>[p,hash(t)])),note:'Scripted end-to-end acceptance scenarios authored by the connected agent. These do not measure an independent model discovering the tools unaided. Source records are labelled paraphrases, not verbatim web extracts.'});
await writeJson(`${dir}/source-snapshot.json`,sourceSnapshot);
await appendFile(`${dir}/calls.jsonl`,'',{flag:'wx',mode:0o600});
const env={...Object.fromEntries(Object.entries(process.env).filter((e):e is [string,string]=>e[1]!==undefined)),JEV_PROVIDER:'openrouter',JEV_DATA_DIR:`${dir}/data`};
let client:Client;
async function connect(){
  client=new Client({name:'jev-runtime-evaluation',version:'0.2.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[`${root}/src/server.ts`],env,stderr:'inherit'}));
}
type Payload = Record<string,any>; // MCP JSON is inspected dynamically in this test driver.
const runIds=new Set<string>();
async function call(name:string,args:Record<string,unknown>,expectError=false):Promise<Payload>{
  const response=await client.callTool({name,arguments:args},{timeout:180000});
  await appendFile(`${dir}/calls.jsonl`,JSON.stringify({at:new Date().toISOString(),name,args,response})+'\n');
  assert.equal(!!response.isError,expectError,`${name}: ${JSON.stringify(response)}`);
  const result=(response.structuredContent as {result:Payload}|undefined)?.result;
  assert.ok(result,`${name} has no structured result`);
  if(typeof result.runId==='string')runIds.add(result.runId);
  return result;
}
const outcomes:{id:number;passed:boolean;detail:string}[]=[];
async function scenario(id:number,fn:()=>Promise<void>){
  try{await fn();outcomes.push({id,passed:true,detail:'Acceptance checks passed.'});console.log(`Scenario ${id}: passed`);}
  catch(error){outcomes.push({id,passed:false,detail:error instanceof Error?error.message:'Unknown error'});console.log(`Scenario ${id}: failed — ${outcomes.at(-1)!.detail}`);}
}
let retrieval:Payload|undefined;
const query={query:'How do I author my own yes/no predicate using Jev Noul?'};
let retrievalItems:{id:string;data:unknown}[]=[];
try{
  await connect();
  await scenario(1,async()=>{
    assert.equal((await client.listTools()).tools.length,10);
    assert.equal((await client.readResource({uri:'jev://guide'})).contents.length,1);
    const result=await call('jev_judge',{state:{text:'The next step requires a measurement that has not yet been collected.'},questions:{missing_evidence:{type:'noul',instructions:'Does item.text say that a required observation is still missing?'}}});
    assert.ok(result.results[0].stages.judge.answers.missing_evidence.noul>=0.7);
  });
  await scenario(2,async()=>{
    const saved=await call('define_capability',{definition:definitions[0]});assert.equal(saved.version,1);
    const old=await call('get_capability',{name:definitions[0].name,version:1});
    const revised=await call('define_capability',{definition:{...definitions[0],notes:definitions[0].notes+' Revision: record this as an experimental retrieval capability.'}});assert.equal(revised.version,2);
    const retained=await call('get_capability',{name:definitions[0].name,version:1});assert.equal(retained.hash,old.hash);
  });
  // Set up distinct capabilities through MCP, with no server code changes.
  await call('define_capability',{definition:definitions[1]});await call('define_capability',{definition:definitions[2]});
  await scenario(3,async()=>{
    await call('store_records',{records});
    const found=await call('search_records',{scope:'web_notes',query:'TypeSafe Noul Python',limit:20});
    assert.ok(found.items.some((r:Payload)=>r.id==='dagger'));
    retrievalItems=found.items.map((r:Payload)=>({id:r.id,data:r}));
    retrieval=await call('run_capability',{name:'source_relevance',version:1,items:retrievalItems,context:query});
    assert.equal(retrieval.summary.selectedIds[0],'noul');assert.ok(!retrieval.summary.selectedIds.includes('dagger'));
  });
  await scenario(4,async()=>{
    const result=await call('run_capability',{name:'evidence_status',items:cases.map(c=>({id:c.id,data:c.data}))});
    const persisted=await call('get_run',{runId:result.runId,limit:20});
    for(const c of cases)assert.equal(persisted.items.find((i:Payload)=>i.id===c.id).result.stages.classify.answers.status.choice,c.expected[0].value);
  });
  await scenario(5,async()=>{
    const method='Revise a hypothesis after an observed test result contradicts its prediction. Prerequisite: an actual disconfirming test result.';
    const result=await call('run_capability',{name:'method_readiness',items:[{id:'planned',data:{method,task:'Develop and revise explanations for patchy glaze.',observation:'We plan to test next week; no measurement has occurred.'}},{id:'observed',data:{method,task:'Develop and revise explanations for patchy glaze.',observation:'The completed controlled trial contradicted the predicted result; the measurement is recorded.'}}]});
    assert.deepEqual(result.summary.selectedIds,['observed']);
    const planned=result.results.find((r:Payload)=>r.id==='planned');assert.equal(planned.stages.readiness.answers.state.choice,'blocked');
  });
  await scenario(6,async()=>{
    const error=await call('get_capability',{name:'does_not_exist'},true);assert.equal(error.error.code,'not_found');
    const list=await call('list_capabilities',{query:'evidence'});assert.ok(list.items.length);
    await call('get_capability',{name:list.items[0].name,version:list.items[0].version});
  });
  await scenario(7,async()=>{
    const items=cases.slice(0,2).map(c=>({id:c.id,data:c.data}));
    const error=await call('run_capability',{name:'evidence_status',items,maxCalls:1},true);assert.equal(error.error.code,'budget_exceeded');
    const run=await call('run_capability',{name:'evidence_status',items,maxCalls:2});assert.equal(run.status,'complete');
  });
  await scenario(8,async()=>{
    const ids:string[]=[];let cursor:string|undefined;
    do{const result=await call('search_records',{scope:'web_notes',limit:2,...(cursor?{cursor}:{})});ids.push(...result.items.map((i:Payload)=>i.id));cursor=result.nextCursor??undefined;}while(cursor);
    assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);
  });
  await scenario(9,async()=>{
    const result=await call('evaluate_capability',{name:'evidence_status',cases});
    assert.equal(result.evaluation.passed,3);
    const stored=await call('get_run',{runId:result.runId,limit:20,details:true});
    assert.ok(stored.outcomes.length);
    for(const item of stored.items)for(const event of item.events)assert.ok(!JSON.stringify(event.request.state).includes('expected'));
  });
  await scenario(10,async()=>{
    assert.ok(retrieval&&retrievalItems.length);
    const cached=await call('run_capability',{name:'source_relevance',version:1,items:retrievalItems,context:query,useCache:true});
    assert.equal(cached.summary.modelCalls,0);assert.equal(cached.summary.cacheHits,retrievalItems.length);
    await call('record_outcome',{runId:cached.runId,outcome:{reporter:'connected-agent scripted check',description:'The Noul documentation note was selected; the unrelated Python packaging result was excluded. This checks retrieval on this small set, not the truth of generated answers.',sources:['https://docs.typesafe.ai/primitives/noul','eval:scenario-3'],status:'success'}});
    await client.close();await connect();
    const persisted=await call('get_run',{runId:cached.runId});assert.equal(persisted.outcomes.length,1);
  });
  const runs=[];
  for(const id of runIds)runs.push(await call('get_run',{runId:id,limit:20,details:true}));
  await writeJson(`${dir}/runs.json`,runs);
  const summary={passed:outcomes.filter(o=>o.passed).length,total:10,outcomes,runIds:[...runIds],modelCalls:runs.reduce((n,r)=>n+(r.summary?.modelCalls??0),0),httpAttempts:runs.reduce((n,r)=>n+(r.summary?.httpAttempts??0),0),reportedCostUsd:runs.reduce((n,r)=>n+(r.summary?.reportedCostUsd??0),0),cacheHits:runs.reduce((n,r)=>n+(r.summary?.cacheHits??0),0)};
  await writeJson(`${dir}/summary.json`,summary);console.log(JSON.stringify(summary,null,2));
  if(summary.passed!==10)process.exitCode=1;
}finally{await client!.close();console.log(`MCP evaluation: ${dir}`);}
