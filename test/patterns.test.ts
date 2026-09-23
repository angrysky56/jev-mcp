/**
 * Tests for the TypeSafe patterns as declarative capability features:
 * speculative fan-out (many questions in one stage), composite scoring,
 * confidence-gated rules, and first-match routing.
 * https://docs.typesafe.ai/patterns
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeStore } from '../src/runtime-store.ts';
import { CapabilityRuntime } from '../src/capability-runtime.ts';
import { computeComposites, confidenceOf, routeFor, validateCapability, matches } from '../src/runtime-contracts.ts';
import type { Capability, Expectation } from '../src/runtime-contracts.ts';
import type { Answer, Request, Response } from '../src/types.ts';

/** One fan-out stage; composite over three question types; routes by risk, confidence, then label. */
const router:Capability={
  name:'router_fixture',description:'Pattern fixture.',
  stages:[{id:'triage',questions:{
    kind:{type:'choice',instructions:'Kind of item?',criteria:{alpha:'A',beta:'B',gamma:'C'}},
    size:{type:'score',instructions:'Size?',criteria:['none','some','much','all']},
    risky:{type:'noul',instructions:'Is item risky?'},
  }}],
  composites:{risk:{terms:[{stage:'triage',question:'risky',weight:2},{stage:'triage',question:'size',weight:1},{stage:'triage',question:'kind',label:'gamma',weight:1}]}},
  routes:[
    {id:'hold',when:[{composite:'risk',op:'gte',value:0.7}]},
    {id:'unsure',when:[{stage:'triage',question:'kind',field:'confidence',op:'lte',value:0.5}]},
    {id:'alpha_path',when:[{stage:'triage',question:'kind',op:'eq',value:'alpha'}]},
    {id:'fallback'},
  ],
  rank:{composite:'risk',direction:'desc'},
};

/** Fixture answers are driven by item fields so each route can be reached deliberately. */
function fake(request:Request):Response{
  const item=(request.state as {item:{kind:string;conf:number;size:number;risky:number}}).item;
  const probs:Record<string,number>={alpha:0,beta:0,gamma:0};probs[item.kind]=item.conf;
  for(const k of Object.keys(probs))if(k!==item.kind)probs[k]=(1-item.conf)/2;
  const answers:Record<string,Answer>={
    kind:{type:'choice',choice:item.kind,confidence:(3*item.conf-1)/2,probabilities:probs},
    size:{type:'score',score:item.size,confidence:1,probabilities:{},legend:{0:'none',1:'some',2:'much',3:'all'}},
    risky:{type:'noul',noul:item.risky},
  };
  return {model:'fixture',answers,usage:{input_tokens:1,output_tokens:1,cost:0}};
}

test('composite normalises each question type and weights it in code',()=>{
  const answers={triage:fake({model:'m',questions:{},state:{item:{kind:'gamma',conf:0.8,size:3,risky:0.5},context:{},prior:{}}}).answers};
  // noul 0.5*2 + size 3/3*1 + P(gamma)=0.8*1, divided by total weight 4
  assert.equal(computeComposites(validateCapability(router),answers).risk,(1+1+0.8)/4);
});

test('confidence: provider value for choice/score, derived decisiveness for noul',()=>{
  assert.equal(confidenceOf({type:'choice',choice:'a',confidence:0.3,probabilities:{}}),0.3);
  assert.equal(confidenceOf({type:'noul',noul:0.9}),0.8);
  assert.equal(confidenceOf({type:'noul',noul:0.5}),0);
});

test('routing is first match; confidence gate precedes label; missing composite never matches',async()=>{
  const store=new RuntimeStore(':memory:'),requests:Request[]=[];
  const runtime=new CapabilityRuntime(store,{apiKey:'fixture',caller:async(_,request)=>{requests.push(request);return {response:fake(request),attempts:1};}});
  try{
    const version=store.define(router);
    const items=[
      {id:'danger',data:{kind:'alpha',conf:0.9,size:3,risky:0.9}},
      {id:'vague',data:{kind:'alpha',conf:0.5,size:0,risky:0.1}},
      {id:'plain',data:{kind:'alpha',conf:0.9,size:0,risky:0.1}},
      {id:'other',data:{kind:'beta',conf:0.9,size:1,risky:0.1}},
    ];
    const run=await runtime.run(version,items,{},{maxCalls:8,useCache:false});
    assert.equal(run.summary.modelCalls,4,'fan-out: one call per item for all three questions');
    assert.deepEqual(run.summary.routes,{hold:['danger'],unsure:['vague'],alpha_path:['plain'],fallback:['other']});
    assert.equal(run.results.find(r=>r.id==='danger')!.route,'hold');
    assert.deepEqual(run.summary.selectedIds.slice(0,1),['danger'],'rank by composite, highest first');
    assert.ok(requests.every(r=>Object.keys(r.questions).length===3));
    assert.equal(matches({composite:'risk',op:'gte',value:0},{}),false);
    const expected:Record<string,Expectation[]>={danger:[{route:'hold'},{composite:'risk',op:'gte',value:0.7}],plain:[{route:'hold'}]};
    const evaluation=await runtime.evaluate(version,[{id:'danger',data:items[0].data,expected:expected.danger},{id:'plain',data:items[2].data,expected:expected.plain}],{},4);
    assert.deepEqual(evaluation.evaluation.checks.map(c=>c.passed),[true,false]);
    assert.ok(requests.every(r=>!JSON.stringify(r).includes('hold')),'routes and expectations never reach the model');
  }finally{store.close();}
});

test('invalid pattern definitions are rejected before any call',()=>{
  const bad=(patch:Partial<Capability>)=>assert.throws(()=>validateCapability({...router,...patch}));
  bad({composites:{x:{terms:[{stage:'triage',question:'kind',weight:1}]}}});             // choice term needs a label
  bad({composites:{x:{terms:[{stage:'triage',question:'risky',label:'alpha',weight:1}]}}}); // label only for choice
  bad({composites:{x:{terms:[{stage:'nope',question:'risky',weight:1}]}}});
  bad({routes:[{id:'a'},{id:'b',when:[{stage:'triage',question:'risky',op:'gte',value:0.5}]}]}); // default must be last
  bad({routes:[{id:'a',when:[{composite:'missing',op:'gte',value:0.5}]}]});
  bad({routes:[{id:'a',when:[{stage:'triage',question:'kind',field:'confidence',op:'eq',value:'alpha'}]}]});
  bad({routes:[{id:'a'},{id:'a'}]});
  bad({stages:[router.stages[0],{id:'late',when:[{composite:'risk',op:'gte',value:0.5}],questions:{q:{type:'noul',instructions:'x'}}}]});
  bad({rank:{composite:'missing',direction:'desc'}});
  assert.equal(routeFor(validateCapability(router),{}, {}),'fallback');
});

test('stringified JSON context and state from a host bridge are unwrapped; plain strings are kept',async()=>{
  const { unwrapJson } = await import('../src/mcp-server.ts');
  assert.deepEqual(unwrapJson('{"text":"a, b"}'),{text:'a, b'});
  assert.deepEqual(unwrapJson(' [1,2] '),[1,2]);
  assert.equal(unwrapJson('{not json}'),'{not json}');
  assert.equal(unwrapJson('"quoted"'),'"quoted"');
  assert.equal(unwrapJson('plain words'),'plain words');
  assert.deepEqual(unwrapJson({a:1}),{a:1});
});

test('run_capability over MCP receives an object context even when the host sends a string',async()=>{
  const { Client } = await import('@modelcontextprotocol/client');
  const { InMemoryTransport } = await import('@modelcontextprotocol/server');
  const { createMcpServer } = await import('../src/mcp-server.ts');
  const store=new RuntimeStore(':memory:'),seen:Request[]=[];
  const runtime=new CapabilityRuntime(store,{apiKey:'fixture',caller:async(_,request)=>{seen.push(request);return {response:fake(request),attempts:1};}});
  const server=createMcpServer(runtime),client=new Client({name:'t',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
  try{
    store.define(router);
    const r=await client.callTool({name:'run_capability',arguments:{name:'router_fixture',items:[{id:'x',data:{kind:'alpha',conf:0.9,size:0,risky:0.1}}],context:'{"topic":"t"}'}});
    assert.ok(!r.isError,JSON.stringify(r));
    assert.deepEqual((seen[0].state as {context:unknown}).context,{topic:'t'});
    const j=await client.callTool({name:'jev_judge',arguments:{state:'{"kind":"beta","conf":0.9,"size":0,"risky":0.1}',questions:router.stages[0].questions}});
    assert.ok(!j.isError,JSON.stringify(j));
    assert.deepEqual((seen[1].state as {item:unknown}).item,{kind:'beta',conf:0.9,size:0,risky:0.1});
  }finally{await client.close();await server.close();store.close();}
});

test('run_capability can take its items from stored records in a scope',async()=>{
  const { Client } = await import('@modelcontextprotocol/client');
  const { InMemoryTransport } = await import('@modelcontextprotocol/server');
  const { createMcpServer } = await import('../src/mcp-server.ts');
  const store=new RuntimeStore(':memory:'),seen:Request[]=[];
  const runtime=new CapabilityRuntime(store,{apiKey:'fixture',caller:async(_,request)=>{seen.push(request);return {response:{model:'f',answers:{q:{type:'noul',noul:0.7}},usage:{input_tokens:1,output_tokens:1}},attempts:1};}});
  const server=createMcpServer(runtime),client=new Client({name:'t',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
  try{
    store.define({name:'rec',description:'Record fixture.',stages:[{id:'s',questions:{q:{type:'noul',instructions:'Does item.text fit context.task?'}}}]});
    store.storeRecords([{id:'r1',scope:'cat',title:'One',text:'Does: first',source:'fixture',kind:'server',status:'active'},{id:'r2',scope:'cat',title:'Two',text:'Does: second',source:'fixture',kind:'server',status:'active'}]);
    const r=await client.callTool({name:'run_capability',arguments:{name:'rec',records:{scope:'cat'},context:{task:'t'}}});
    assert.ok(!r.isError,JSON.stringify(r));
    assert.equal(seen.length,2);
    assert.deepEqual((seen[0].state as {item:unknown}).item,{title:'One',text:'Does: first',kind:'server',source:'fixture'});
    const brief=await client.callTool({name:'run_capability',arguments:{name:'rec',records:{scope:'cat'},summaryOnly:true}});
    const result=(brief.structuredContent as {result:Record<string,unknown>}).result;
    assert.ok(!('results' in result)&&'summary' in result&&'runId' in result);
    const both=await client.callTool({name:'run_capability',arguments:{name:'rec',records:{scope:'cat'},items:[{id:'x',data:{}}]}});
    assert.ok(both.isError);
    const empty=await client.callTool({name:'run_capability',arguments:{name:'rec',records:{scope:'none'}}});
    assert.ok(empty.isError);
  }finally{await client.close();await server.close();store.close();}
});
