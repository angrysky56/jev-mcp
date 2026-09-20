import { hash } from './io.ts';
import { callProvider, defaultModels } from './provider.ts';
import type { CallResult } from './provider.ts';
import { answerValue, matches, RuntimeError, validateCapability } from './runtime-contracts.ts';
import type { Capability, WorkItem, Rule } from './runtime-contracts.ts';
import { RuntimeStore } from './runtime-store.ts';
import type { CapabilityVersion } from './runtime-store.ts';
import type { Answer, Json, Provider, Request } from './types.ts';

export interface StageResult {status:'complete'|'skipped'|'error'|'cancelled';answers?:Record<string,Answer>;error?:CallResult['error'];cached?:boolean;}
export interface ItemResult {id:string;status:'complete'|'partial'|'cancelled';selected:boolean;rank:number|null;stages:Record<string,StageResult>;}
export interface RunOptions {maxCalls:number;useCache:boolean;signal?:AbortSignal;}
type Caller = (provider:Provider,request:Request,options:{apiKey:string;signal?:AbortSignal})=>Promise<CallResult>;

/** A bounded semaphore shares provider concurrency across all MCP invocations. */
class Semaphore {
  active=0;waiting:(()=>void)[]=[];
  async withSlot<T>(fn:()=>Promise<T>):Promise<T>{
    if(this.active>=4)await new Promise<void>(resolve=>this.waiting.push(resolve));
    else this.active++;
    // Hand a reserved slot directly to a waiter; a new caller cannot steal it.
    try{return await fn();}finally{const next=this.waiting.shift();if(next)next();else this.active--;}
  }
}

export class CapabilityRuntime {
  store:RuntimeStore;provider:Provider;model:string;apiKey:string;caller:Caller;
  semaphore=new Semaphore();running=0;
  constructor(store:RuntimeStore,options:{provider?:Provider;model?:string;apiKey?:string;caller?:Caller}={}){
    this.store=store;this.provider=options.provider??'openrouter';this.model=options.model??defaultModels[this.provider];
    this.apiKey=options.apiKey??'';this.caller=options.caller??callProvider;
  }
  async run(version:CapabilityVersion,items:WorkItem[],context:Json,options:RunOptions){
    const definition=validateCapability(version.definition);
    if(items.length<1||items.length>20||new Set(items.map(i=>i.id)).size!==items.length)throw new RuntimeError('invalid_items','Supply 1–20 items with unique IDs.');
    const plannedCalls=items.length*definition.stages.length;
    if(plannedCalls>options.maxCalls)throw new RuntimeError('budget_exceeded',`This batch can require ${plannedCalls} model calls, above maxCalls=${options.maxCalls}. Reduce items/stages or set an explicit limit up to 64.`);
    if(!this.apiKey)throw new RuntimeError('missing_key',`Set ${this.provider==='openrouter'?'OPENROUTER_API_KEY':'TYPESAFE_API_KEY'} in the environment that launches the MCP server.`);
    if(this.running>=4)throw new RuntimeError('busy','Four runs are already active. Retry after one finishes.');
    if(Buffer.byteLength(JSON.stringify({items,context,definition}))>250000)throw new RuntimeError('input_too_large','Batch exceeds 250 KB. Use smaller records or split the batch.');
    this.running++;
    let runId:string|undefined;
    const results:ItemResult[]=[];
    const costs={modelCalls:0,httpAttempts:0,cacheHits:0,reportedCostUsd:0,unreportedCosts:0,inputTokens:0,outputTokens:0};
    let fatal=false;
    try {
      runId=this.store.startRun({createdAt:new Date().toISOString(),capability:version,context,provider:this.provider,model:this.model,plannedCalls,options:{maxCalls:options.maxCalls,useCache:options.useCache}},items);
      let index=0;
      const worker=async()=>{
        while(index<items.length){
          const item=items[index++];
          const stages:Record<string,StageResult>={},prior:Record<string,Record<string,Answer>>={};
          for(const stage of definition.stages){
            if(options.signal?.aborted||fatal){stages[stage.id]={status:'cancelled'};continue;}
            if(stage.when&&!stage.when.every(r=>matches(r,prior))){stages[stage.id]={status:'skipped'};continue;}
            const request:Request={model:this.model,state:structuredClone({item:item.data,context,prior}) as Json,questions:stage.questions};
            const fingerprint=hash({provider:this.provider,request}),started=performance.now();
            const cached=options.useCache?this.store.cacheGet(fingerprint):undefined;
            if(cached){
              costs.cacheHits++;prior[stage.id]=cached.response.answers;stages[stage.id]={status:'complete',answers:cached.response.answers,cached:true};
              this.store.event(runId!,item.id,{stage:stage.id,request,fingerprint,cached:true,cachedAt:cached.createdAt,response:cached.response,attempts:0,elapsedMs:performance.now()-started});continue;
            }
            const result=await this.semaphore.withSlot(async()=>{
              if(options.signal?.aborted||fatal)return {attempts:0,error:{kind:'cancelled',message:'Run cancelled before the provider call.'}} satisfies CallResult;
              costs.modelCalls++;
              return this.caller(this.provider,request,{apiKey:this.apiKey,signal:options.signal});
            });
            costs.httpAttempts+=result.attempts;
            this.store.event(runId!,item.id,{stage:stage.id,request,fingerprint,cached:false,...result,elapsedMs:performance.now()-started});
            if(result.response){
              const {usage}=result.response;
              costs.reportedCostUsd+=usage.cost??0;costs.unreportedCosts+=usage.cost===undefined?1:0;costs.inputTokens+=usage.input_tokens;costs.outputTokens+=usage.output_tokens;
              prior[stage.id]=result.response.answers;stages[stage.id]={status:'complete',answers:result.response.answers,cached:false};
              this.store.cachePut(fingerprint,result.response);
            }else{
              stages[stage.id]={status:result.error?.kind==='cancelled'?'cancelled':'error',error:result.error};
              if(result.error?.status&&[401,402,403,404].includes(result.error.status))fatal=true;
            }
          }
          const status=Object.values(stages).some(s=>s.status==='error')?'partial':Object.values(stages).some(s=>s.status==='cancelled')?'cancelled':'complete';
          const value=definition.rank?answerValue(prior[definition.rank.stage]?.[definition.rank.question]):undefined;
          const result:ItemResult={id:item.id,status,stages,selected:status==='complete'&&(definition.select?definition.select.every(r=>matches(r,prior)):Object.values(stages).some(s=>s.status==='complete')),rank:typeof value==='number'?value:null};
          this.store.finishItem(runId!,item.id,result);results.push(result);
        }
      };
      const workers=await Promise.allSettled(Array.from({length:Math.min(4,items.length)},worker));
      const rejected=workers.find(w=>w.status==='rejected');
      if(rejected?.status==='rejected')throw rejected.reason;
      const selected=results.filter(r=>r.selected).sort((a,b)=>{
        if(a.rank===null&&b.rank!==null)return 1;if(b.rank===null&&a.rank!==null)return -1;
        return (definition.rank?.direction==='asc'?1:-1)*((a.rank??0)-(b.rank??0))||a.id.localeCompare(b.id);
      }).map(r=>r.id);
      const status=results.every(r=>r.status==='complete')?'complete':results.some(r=>r.status==='complete')?'partial':'failed';
      const summary={...costs,totalItems:items.length,completedItems:results.filter(r=>r.status==='complete').length,selectedIds:selected};
      this.store.finishRun(runId,status,summary);
      return {runId,status,capability:{name:version.name,version:version.version,hash:version.hash},summary,results:results.sort((a,b)=>items.findIndex(i=>i.id===a.id)-items.findIndex(i=>i.id===b.id)).slice(0,5),moreResults:results.length>5};
    }catch(error){
      if(runId)this.store.finishRun(runId,'failed',{...costs,message:'Run interrupted. Inspect completed item events with get_run.'});
      throw error;
    }finally{this.running--;}
  }
  async judge(state:Json,questions:Request['questions'],options:RunOptions){
    // Ad hoc calls share the same audit and failure behavior as saved capabilities.
    const definition:Capability={name:'adhoc',description:'One-off authored judgment; state is available as item.',stages:[{id:'judge',questions}]};
    return this.run({name:'adhoc',version:0,hash:hash(definition),definition,createdAt:new Date().toISOString(),validation:'unvalidated'},[{id:'state',data:state}],{},options);
  }
  async evaluate(version:CapabilityVersion,cases:{id:string;data:Json;expected:Rule[]}[],context:Json,maxCalls:number,signal?:AbortSignal){
    // Check expected references without sending labels to Jev or mutating the definition.
    for(const c of cases)validateCapability({...version.definition,select:c.expected});
    const run=await this.run(version,cases.map(c=>({id:c.id,data:c.data})),context,{maxCalls,useCache:false,signal});
    const page=this.store.getRun(run.runId,20);
    const checks=cases.map(c=>{
      const result=page.items.find(i=>i.id===c.id)?.result as ItemResult|undefined;
      const answers=Object.fromEntries(Object.entries(result?.stages??{}).flatMap(([id,s])=>s.answers?[[id,s.answers]]:[]));
      const failed=c.expected.filter(r=>!matches(r,answers));
      return {id:c.id,passed:result?.status==='complete'&&!failed.length,failed};
    });
    const evaluation={kind:'authored_test_evaluation',capability:run.capability,checks,passed:checks.filter(c=>c.passed).length,total:cases.length,expected:cases.map(c=>({id:c.id,expected:c.expected})),note:'Labels are caller-authored. Passing them is evidence for these examples, not independent validation.'};
    this.store.outcome(run.runId,evaluation);
    return {...run,evaluation};
  }
}
