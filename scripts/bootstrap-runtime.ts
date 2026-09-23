import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { root, readJson, hash, writeJson } from '../src/io.ts';
import type { Capability } from '../src/runtime-contracts.ts';

const definitions=await readJson<Capability[]>(`${root}/experiments/runtime-capabilities.json`);
// Portable starter library: exported from the author's library with setup-specific wording removed.
const starters=(await readJson<{definition:Capability}[]>(`${root}/starters/capabilities.json`)).map(s=>s.definition);
const refinement=await readJson<{newDefinition:Capability;cases:unknown[]}>(`${root}/studies/runtime/refinements/2026-09-20T08-14-24.025Z/manifest.json`);
const client=new Client({name:'jev-bootstrap',version:'0.2.0'});
const dataDir=process.env.JEV_DATA_DIR??`${root}/.jev`;
const env={...Object.fromEntries(Object.entries(process.env).filter((e):e is [string,string]=>e[1]!==undefined)),JEV_PROVIDER:process.env.JEV_PROVIDER??'openrouter',JEV_DATA_DIR:dataDir};
type Payload=Record<string,any>;
async function call(name:string,args:Record<string,unknown>,allowMissing=false):Promise<Payload>{
  const r=await client.callTool({name,arguments:args},{timeout:180000});
  const value=(r.structuredContent as {result:Payload}).result;
  if(r.isError&&!(allowMissing&&value.error?.code==='not_found'))throw new Error(JSON.stringify(r));return value;
}
try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[`${root}/src/server.ts`],env,stderr:'inherit'}));
  const seeded=[];
  for(const definition of definitions){
    let current=await call('get_capability',{name:definition.name},true);
    if(current.error)current=await call('define_capability',{definition});
    // Upgrade only our untouched starter; preserve any independently edited definition.
    if(definition.name==='evidence_status'&&current.hash===hash(definition))current=await call('define_capability',{definition:refinement.newDefinition});
    seeded.push({name:current.name,version:current.version,hash:current.hash});
  }
  // Starters are added only when missing; an existing capability of the same name is never replaced.
  for(const definition of starters){
    const current=await call('get_capability',{name:definition.name},true);
    if(current.error){const saved=await call('define_capability',{definition});seeded.push({name:saved.name,version:saved.version,hash:saved.hash,starter:'added'});}
    else seeded.push({name:current.name,version:current.version,hash:current.hash,starter:current.hash===hash(definition)?'already current':'kept existing (differs from starter)'});
  }
  const evidence=await call('get_capability',{name:'evidence_status'});
  let evaluation:Payload|undefined;
  if(process.argv.includes('--live')&&evidence.hash===hash(refinement.newDefinition))evaluation=await call('evaluate_capability',{name:'evidence_status',version:evidence.version,cases:refinement.cases});
  const report={createdAt:new Date().toISOString(),seeded,...(evaluation?{evaluation}:{note:'Starter definitions saved; pass --live to evaluate the refined classifier in the local library.'})};
  await writeJson(`${dataDir}/bootstrap-${Date.now()}.json`,report);
  console.log(JSON.stringify({seeded,evaluation:evaluation?{runId:evaluation.runId,passed:evaluation.evaluation.passed,total:evaluation.evaluation.total,cost:evaluation.summary.reportedCostUsd}:null},null,2));
}finally{await client.close();}
