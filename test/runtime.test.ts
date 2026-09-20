import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { RuntimeStore } from '../src/runtime-store.ts';
import { CapabilityRuntime } from '../src/capability-runtime.ts';
import { validateCapability, recordSchema } from '../src/runtime-contracts.ts';
import { createMcpServer } from '../src/mcp-server.ts';
import { root, hash } from '../src/io.ts';
import type { Capability, Rule } from '../src/runtime-contracts.ts';
import type { Request, Response, Answer } from '../src/types.ts';

const definition:Capability={name:'fixture',description:'Semantic filtering fixture.',stages:[{id:'assess',questions:{relevant:{type:'noul',instructions:'Does item apply?'}}},{id:'detail',when:[{stage:'assess',question:'relevant',op:'gte',value:0.7}],questions:{value:{type:'score',instructions:'Value of item?',criteria:['low','medium','high']}}}],select:[{stage:'assess',question:'relevant',op:'gte',value:0.7}],rank:{stage:'detail',question:'value',direction:'desc'}};
function fakeResponse(request:Request):Response {
  const value=(request.state as {item:{ok?:boolean}}).item.ok===false?0.1:0.9;
  const answers:Record<string,Answer>={};
  for(const [id,q]of Object.entries(request.questions)){
    if(q.type==='noul')answers[id]={type:'noul',noul:value};
    else if(q.type==='score')answers[id]={type:'score',score:2,confidence:1,legend:Object.fromEntries(q.criteria.map((s,i)=>[i,s])),probabilities:Object.fromEntries(q.criteria.map((_,i)=>[i,i===2?1:0]))};
    else {const keys=Object.keys(q.criteria);answers[id]={type:'choice',choice:keys[0],confidence:1,probabilities:Object.fromEntries(keys.map((k,i)=>[k,i===0?1:0]))};}
  }
  return {model:'typesafe/jev-fixture',answers,usage:{input_tokens:10,output_tokens:2,cost:0.0001}};
}

test('versioned capabilities and source records survive restart with scope and lifecycle intact',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jev-store-'));let store=new RuntimeStore(join(dir,'db.sqlite'));
  try{
    assert.equal(store.define(definition).version,1);assert.equal(store.define(definition).version,1);
    assert.equal(store.define({...definition,description:'Changed condition description.'}).version,2);
    const record=recordSchema.parse({id:'r1',scope:'a',title:'Glaze',text:'Original glaze observation',source:'source:one',kind:'observation'});
    store.storeRecords([record,{...record,scope:'b',text:'Other branch glaze assumption',kind:'hypothesis'}]);
    store.storeRecords([{...record,text:'Corrected glaze observation'}]);
    assert.equal(store.db.prepare('SELECT count(*) n FROM record_history').get()!.n,3);
    store.close();store=new RuntimeStore(join(dir,'db.sqlite'));
    assert.equal(store.getCapability('fixture',1).definition.description,definition.description);
    assert.equal(store.searchRecords('a','glaze',5).items[0].text,'Corrected glaze observation');
    assert.equal(store.searchRecords('a','glaze',5).items.length,1);
    store.storeRecords([{...record,status:'cancelled'}]);
    assert.equal(store.searchRecords('a','',5).items.length,0);
    assert.equal(store.searchRecords('b','glaze',5).items.length,1);
    assert.doesNotThrow(()=>store.searchRecords('b','" OR 1=1; DROP TABLE records;',5));
  }finally{store.close();await rm(dir,{recursive:true,force:true});}
});

test('pagination is query-bound, rejects changed libraries, and retains all distinct results',()=>{
  const store=new RuntimeStore(':memory:');
  try{
    for(const name of ['aaa','bbb','ccc'])store.define({...definition,name});
    const first=store.listCapabilities('',1);assert.ok(first.nextCursor);
    assert.equal(store.listCapabilities('',1,first.nextCursor!).items[0].name,'bbb');
    assert.throws(()=>store.listCapabilities('aaa',1,first.nextCursor!));
    store.define({...definition,name:'ddd'});
    assert.throws(()=>store.listCapabilities('',1,first.nextCursor!));
    assert.throws(()=>store.listCapabilities('',1,'not-a-cursor'));
  }finally{store.close();}
});

test('invalid gates, forward references, and impossible numeric domains are rejected',()=>{
  assert.throws(()=>validateCapability({...definition,stages:[{...definition.stages[0],when:[{stage:'detail',question:'value',op:'gte',value:1}]}]}));
  assert.throws(()=>validateCapability({...definition,select:[{stage:'assess',question:'relevant',op:'gte',value:5}]}));
  assert.throws(()=>validateCapability({...definition,stages:[definition.stages[0],definition.stages[0]]}));
  assert.throws(()=>validateCapability({...definition,name:'constructor'}));
});

test('conditional stages, exact cache provenance, and evaluation labels stay separate',async()=>{
  const store=new RuntimeStore(':memory:'),requests:Request[]=[];
  const runtime=new CapabilityRuntime(store,{apiKey:'fixture-only',caller:async(_,request)=>{requests.push(structuredClone(request));const response=fakeResponse(request);return{response,rawResponse:response as never,attempts:1};}});
  try{
    const version=store.define(definition),items=[{id:'yes',data:{ok:true}},{id:'no',data:{ok:false}}];
    const run=await runtime.run(version,items,{query:'original'},{maxCalls:4,useCache:false});
    assert.equal(run.summary.modelCalls,3);assert.deepEqual(run.summary.selectedIds,['yes']);
    assert.equal(run.results.find(r=>r.id==='no')!.stages.detail.status,'skipped');
    const cached=await runtime.run(version,items,{query:'original'},{maxCalls:4,useCache:true});
    assert.equal(cached.summary.cacheHits,3);assert.equal(cached.summary.httpAttempts,0);
    assert.equal(cached.summary.reportedCostUsd,0);
    const detail=store.getRun(cached.runId,20,undefined,true);
    for(const row of detail.items)for(const event of row.events??[]){const e=event as {request:Request;fingerprint:string};assert.equal(e.fingerprint,hash({provider:'openrouter',request:e.request}));}
    const expected:Rule[]=[{stage:'assess',question:'relevant',op:'lte',value:0.2}];
    const evaluation=await runtime.evaluate(version,[{id:'label',data:{ok:true},expected}],{},4);
    assert.equal(evaluation.evaluation.passed,0);assert.equal(evaluation.summary.cacheHits,0);
    assert.ok(requests.every(r=>!JSON.stringify(r).includes('expected')));
    assert.equal(store.getRun(evaluation.runId,1).outcomes.length,1);
    assert.equal(store.getCapability('fixture').validation,'unvalidated');
  }finally{store.close();}
});

test('batch budgets, global concurrency, provider failures, and cancellation remain explicit',async()=>{
  const store=new RuntimeStore(':memory:');let calls=0,active=0,maxActive=0;
  const runtime=new CapabilityRuntime(store,{apiKey:'fixture',caller:async(_,request)=>{calls++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,5));active--;return {response:fakeResponse(request),attempts:1};}});
  try{
    const version=store.define(definition),items=Array.from({length:8},(_,i)=>({id:`i${i}`,data:{ok:true}}));
    await assert.rejects(runtime.run(version,items,{}, {maxCalls:1,useCache:false}),/above maxCalls/);assert.equal(calls,0);
    await Promise.all([runtime.run(version,items,{}, {maxCalls:16,useCache:false}),runtime.run(version,items,{}, {maxCalls:16,useCache:false})]);
    assert.ok(maxActive<=4);
    const before=calls,controller=new AbortController();controller.abort();
    const cancelled=await runtime.run(version,items,{}, {maxCalls:16,useCache:false,signal:controller.signal});
    assert.equal(calls,before);assert.equal(cancelled.status,'failed');
    const failing=new CapabilityRuntime(store,{apiKey:'fixture',caller:async()=>({attempts:1,error:{kind:'http',message:'Unauthorized',status:401}})});
    const failure=await failing.run(version,[items[0]],{}, {maxCalls:2,useCache:false});
    assert.equal(failure.status,'failed');assert.equal(failure.results[0].stages.detail.status,'cancelled');
    assert.deepEqual(failure.summary.selectedIds,[]);
  }finally{store.close();}
});

test('all MCP operations work through the actual protocol with a deterministic test provider',async()=>{
  const store=new RuntimeStore(':memory:');
  const runtime=new CapabilityRuntime(store,{apiKey:'fixture',caller:async(_,request)=>({response:fakeResponse(request),attempts:1})});
  const server=createMcpServer(runtime),client=new Client({name:'test',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  const call=async(name:string,args:Record<string,unknown>)=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return (r.structuredContent as {result:Record<string,unknown>}).result;};
  try{
    assert.equal((await client.listTools()).tools.length,10);
    assert.equal((await client.readResource({uri:'jev://guide'})).contents.length,1);
    await call('define_capability',{definition});await call('get_capability',{name:'fixture'});await call('list_capabilities',{});
    await call('jev_judge',{state:{ok:true},questions:definition.stages[0].questions});
    const run=await call('run_capability',{name:'fixture',items:[{id:'one',data:{ok:true}}]});
    await call('get_run',{runId:run.runId});
    await call('record_outcome',{runId:run.runId,outcome:{reporter:'test',description:'Fixture completed',sources:['fixture:one'],status:'success'}});
    await call('evaluate_capability',{name:'fixture',cases:[{id:'one',data:{ok:true},expected:[{stage:'assess',question:'relevant',op:'gte',value:0.7}]}]});
    await call('store_records',{records:[{id:'one',scope:'test',title:'Glaze',text:'Glaze details',source:'fixture:source',kind:'source'}]});
    const search=await call('search_records',{scope:'test',query:'glaze'});assert.equal((search.items as unknown[]).length,1);
    assert.ok((await client.callTool({name:'get_capability',arguments:{name:'missing'}})).isError);
    assert.ok((await client.callTool({name:'search_records',arguments:{scope:'test',limit:200}})).isError);
  }finally{await client.close();await server.close();store.close();}
});

test('stdio startup works without credentials and reports missing keys without leaking environment',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jev-stdio-'));
  const transport=new StdioClientTransport({command:process.execPath,args:[`${root}/src/server.ts`],env:{PATH:process.env.PATH??'',JEV_DATA_DIR:dir,OPENROUTER_API_KEY:'',TYPESAFE_API_KEY:''},stderr:'pipe'});
  const client=new Client({name:'stdio-test',version:'1'});
  try{
    await client.connect(transport);assert.equal((await client.listTools()).tools.length,10);
    const result=await client.callTool({name:'jev_judge',arguments:{state:{},questions:{q:{type:'noul',instructions:'Is item empty?'}}}});
    assert.ok(result.isError);assert.match(JSON.stringify(result),/missing_key/);
  }finally{await client.close();await rm(dir,{recursive:true,force:true});}
});
