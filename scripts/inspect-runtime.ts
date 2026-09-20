import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { root, writeJson } from '../src/io.ts';

const [inspector]=process.argv.slice(2);
if(!inspector)throw new Error('Pass the installed MCP Inspector launcher path.');
const dir=await mkdtemp(join(tmpdir(),'jev-inspector-'));
const observations:unknown[]=[];
function invoke(method:string,name?:string,args:Record<string,unknown>={}){
  const flags=['--cli',process.execPath,`${root}/test/fixtures/runtime-server.ts`,'--method',method,'--format','json','-e',`JEV_INSPECTOR_TEST_DIR=${dir}`];
  if(name)flags.push('--tool-name',name,'--tool-args-json',JSON.stringify(args));
  const output=execFileSync(process.execPath,[inspector,...flags],{encoding:'utf8',timeout:30000,maxBuffer:2000000});
  const response=JSON.parse(output);observations.push({method,name,args,response});
  assert.ok(!response.error,JSON.stringify(response));
  return response.result;
}
function tool(name:string,args:Record<string,unknown>){
  const result=invoke('tools/call',name,args);assert.ok(!result.isError,JSON.stringify(result));
  return result.structuredContent.result;
}
try{
  assert.equal(invoke('tools/list').tools.length,10);
  const definition={name:'inspector_fixture',description:'Inspector protocol fixture; no live inference.',stages:[{id:'check',questions:{yes:{type:'noul',instructions:'Is this a fixture?'}}}]};
  tool('define_capability',{definition});tool('get_capability',{name:definition.name});tool('list_capabilities',{});
  tool('jev_judge',{state:{},questions:definition.stages[0].questions});
  const run=tool('run_capability',{name:definition.name,items:[{id:'one',data:{}}]});
  tool('get_run',{runId:run.runId});
  tool('record_outcome',{runId:run.runId,outcome:{reporter:'Inspector fixture',description:'Tool response decoded correctly.',sources:['fixture:inspector'],status:'success'}});
  tool('evaluate_capability',{name:definition.name,cases:[{id:'one',data:{},expected:[{stage:'check',question:'yes',op:'gte',value:0.7}]}]});
  tool('store_records',{records:[{id:'one',scope:'inspector',title:'Record',text:'A searchable fixture record.',source:'fixture:one',kind:'source'}]});
  tool('search_records',{scope:'inspector',query:'searchable'});
  await mkdir(`${root}/studies/runtime/inspector`,{recursive:true});
  await writeJson(`${root}/studies/runtime/inspector/${Date.now()}.json`,{provider:'deterministic test fixture',toolCalls:observations.length-1,observations});
  console.log(`Inspector passed all ${observations.length-1} tools; production stdio with live Jev is checked separately.`);
}finally{await rm(dir,{recursive:true,force:true});}
