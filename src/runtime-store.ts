import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from './io.ts';
import { RuntimeError, validateCapability } from './runtime-contracts.ts';
import type { Capability, StoredRecord, WorkItem } from './runtime-contracts.ts';
import type { Response } from './types.ts';

export interface CapabilityVersion {name:string;version:number;hash:string;definition:Capability;createdAt:string;validation:'unvalidated';}
type Row = Record<string,unknown>;
const parse = <T>(text:unknown):T => JSON.parse(String(text)) as T;
function cursorOffset(cursor:string|undefined,binding:unknown):number {
  if(!cursor)return 0;
  try {
    const c=JSON.parse(Buffer.from(cursor,'base64url').toString());
    if(c.binding!==hash(binding)||!Number.isSafeInteger(c.offset)||c.offset<0)throw Error();
    return c.offset;
  } catch {throw new RuntimeError('invalid_cursor','Cursor does not match this query or the collection changed. Restart without a cursor.');}
}
function page<T>(rows:T[],limit:number,offset:number,binding:unknown){
  return {items:rows.slice(0,limit),nextCursor:rows.length>limit?Buffer.from(JSON.stringify({binding:hash(binding),offset:offset+limit})).toString('base64url'):null};
}

/** Local versioned source store and audit log. SQL parameters never contain executable SQL. */
export class RuntimeStore {
  db:DatabaseSync;
  constructor(path:string){
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);
    if(path!==':memory:')chmodSync(path,0o600);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version=Number(this.db.prepare('PRAGMA user_version').get()!.user_version);
    if(version>1)throw new RuntimeError('schema_version','Database is newer than this server. Use the matching server version.');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS capabilities(name TEXT NOT NULL,version INTEGER NOT NULL,hash TEXT NOT NULL,definition TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(name,version));
      CREATE TABLE IF NOT EXISTS records(scope TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,record_json TEXT NOT NULL,PRIMARY KEY(scope,id));
      CREATE TABLE IF NOT EXISTS record_history(scope TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,record_json TEXT NOT NULL,PRIMARY KEY(scope,id,version));
      CREATE VIRTUAL TABLE IF NOT EXISTS record_search USING fts5(scope UNINDEXED,id UNINDEXED,title,body);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,manifest TEXT NOT NULL,status TEXT NOT NULL,summary TEXT);
      CREATE TABLE IF NOT EXISTS run_items(run_id TEXT NOT NULL REFERENCES runs(id),id TEXT NOT NULL,position INTEGER NOT NULL,data TEXT NOT NULL,result TEXT,PRIMARY KEY(run_id,id));
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL REFERENCES runs(id),item_id TEXT NOT NULL,event TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache(fingerprint TEXT PRIMARY KEY,response TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS outcomes(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id),outcome TEXT NOT NULL,created_at TEXT NOT NULL);
      PRAGMA user_version=1;
    `);
  }
  close(){this.db.close();}
  transaction<T>(fn:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    try{const result=fn();this.db.exec('COMMIT');return result;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  define(value:unknown):CapabilityVersion {
    const definition=validateCapability(value), fingerprint=hash(definition);
    return this.transaction(()=>{
      const latest=this.db.prepare('SELECT * FROM capabilities WHERE name=? ORDER BY version DESC LIMIT 1').get(definition.name);
      if(latest?.hash===fingerprint)return this.capabilityRow(latest);
      const version=Number(latest?.version??0)+1,createdAt=new Date().toISOString();
      this.db.prepare('INSERT INTO capabilities VALUES(?,?,?,?,?)').run(definition.name,version,fingerprint,JSON.stringify(definition),createdAt);
      return {name:definition.name,version,hash:fingerprint,definition,createdAt,validation:'unvalidated'};
    });
  }
  capabilityRow(row:Row):CapabilityVersion {
    return {name:String(row.name),version:Number(row.version),hash:String(row.hash),definition:parse<Capability>(row.definition),createdAt:String(row.created_at),validation:'unvalidated'};
  }
  getCapability(name:string,version?:number):CapabilityVersion {
    const row=version===undefined?this.db.prepare('SELECT * FROM capabilities WHERE name=? ORDER BY version DESC LIMIT 1').get(name):this.db.prepare('SELECT * FROM capabilities WHERE name=? AND version=?').get(name,version);
    if(!row)throw new RuntimeError('not_found',`Capability ${name}${version?` version ${version}`:''} does not exist. Use list_capabilities or define_capability.`);
    return this.capabilityRow(row);
  }
  listCapabilities(query:string,limit:number,cursor?:string){
    const revision=this.db.prepare('SELECT count(*) AS n FROM capabilities').get()!.n;
    const binding={type:'capabilities',query,revision},offset=cursorOffset(cursor,binding);
    const rows=this.db.prepare(`SELECT c.* FROM capabilities c JOIN (SELECT name,max(version) version FROM capabilities GROUP BY name) x USING(name,version) WHERE instr(lower(c.name||' '||c.definition),lower(?))>0 ORDER BY c.name LIMIT ? OFFSET ?`).all(query,limit+1,offset).map(r=>{
      const c=this.capabilityRow(r);return {name:c.name,version:c.version,hash:c.hash,description:c.definition.description,validation:c.validation};
    });
    return page(rows,limit,offset,binding);
  }
  capabilityEvidence(name:string,version:number){
    return this.db.prepare("SELECT id,status,summary FROM runs WHERE json_extract(manifest,'$.capability.name')=? AND json_extract(manifest,'$.capability.version')=? ORDER BY rowid DESC LIMIT 10").all(name,version).map(r=>({runId:String(r.id),status:String(r.status),summary:r.summary?parse(r.summary):null,reports:this.db.prepare('SELECT outcome FROM outcomes WHERE run_id=? ORDER BY rowid DESC LIMIT 3').all(String(r.id)).map(o=>{
      const report=parse<Record<string,unknown>>(o.outcome);
      return {kind:report.kind??'reported_outcome',passed:report.passed,total:report.total,reporter:report.reporter,status:report.status,description:typeof report.description==='string'?report.description.slice(0,800):undefined};
    })}));
  }
  storeRecords(records:StoredRecord[]){
    const keys=records.map(r=>`${r.scope}/${r.id}`);
    if(new Set(keys).size!==keys.length)throw new RuntimeError('duplicate_record','Record IDs must be unique within each scope in a batch.');
    return this.transaction(()=>records.map(record=>{
      const prior=this.db.prepare('SELECT * FROM records WHERE scope=? AND id=?').get(record.scope,record.id);
      const json=JSON.stringify(record);
      if(prior?.record_json===json)return {id:record.id,scope:record.scope,version:Number(prior.version),unchanged:true};
      const version=Number(prior?.version??0)+1;
      this.db.prepare('INSERT INTO record_history VALUES(?,?,?,?)').run(record.scope,record.id,version,json);
      this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(scope,id) DO UPDATE SET version=excluded.version,title=excluded.title,body=excluded.body,kind=excluded.kind,status=excluded.status,record_json=excluded.record_json').run(record.scope,record.id,version,record.title,record.text,record.kind,record.status,json);
      this.db.prepare('DELETE FROM record_search WHERE scope=? AND id=?').run(record.scope,record.id);
      if(record.status==='active')this.db.prepare('INSERT INTO record_search VALUES(?,?,?,?)').run(record.scope,record.id,record.title,record.text);
      return {id:record.id,scope:record.scope,version,unchanged:false};
    }));
  }
  searchRecords(scope:string,query:string,limit:number,cursor?:string,kind?:string){
    const revision=this.db.prepare('SELECT count(*) AS n FROM record_history').get()!.n;
    const binding={type:'records',scope,query,kind,revision},offset=cursorOffset(cursor,binding);
    const tokens=[...new Set(query.match(/[\p{L}\p{N}_]+/gu)??[])].slice(0,32);
    const expression=tokens.map(t=>`"${t}"`).join(' OR ');
    let rows:Row[];
    if(expression) rows=this.db.prepare(`SELECT r.record_json,r.version,bm25(record_search) relevance FROM record_search JOIN records r ON r.scope=record_search.scope AND r.id=record_search.id WHERE record_search MATCH ? AND r.scope=? AND r.status='active' AND (? IS NULL OR r.kind=?) ORDER BY relevance,r.id LIMIT ? OFFSET ?`).all(expression,scope,kind??null,kind??null,limit+1,offset);
    else rows=this.db.prepare(`SELECT record_json,version,0 relevance FROM records WHERE scope=? AND status='active' AND (? IS NULL OR kind=?) ORDER BY id LIMIT ? OFFSET ?`).all(scope,kind??null,kind??null,limit+1,offset);
    return {...page(rows.map(r=>({...parse<StoredRecord>(r.record_json),version:Number(r.version),lexicalRank:Number(r.relevance)})),limit,offset,binding),retrieval:'sqlite_fts5',query};
  }
  startRun(manifest:unknown,items:WorkItem[]):string {
    const id=randomUUID();
    this.transaction(()=>{
      this.db.prepare('INSERT INTO runs VALUES(?,?,?,NULL)').run(id,JSON.stringify(manifest),'running');
      const insert=this.db.prepare('INSERT INTO run_items VALUES(?,?,?,?,NULL)');
      items.forEach((item,i)=>insert.run(id,item.id,i,JSON.stringify(item.data)));
    });return id;
  }
  event(runId:string,itemId:string,event:unknown){this.db.prepare('INSERT INTO events(run_id,item_id,event) VALUES(?,?,?)').run(runId,itemId,JSON.stringify(event));}
  finishItem(runId:string,itemId:string,result:unknown){this.db.prepare('UPDATE run_items SET result=? WHERE run_id=? AND id=?').run(JSON.stringify(result),runId,itemId);}
  finishRun(runId:string,status:string,summary:unknown){this.db.prepare('UPDATE runs SET status=?,summary=? WHERE id=?').run(status,JSON.stringify(summary),runId);}
  getRun(id:string,limit:number,cursor?:string,details=false){
    const row=this.db.prepare('SELECT * FROM runs WHERE id=?').get(id);
    if(!row)throw new RuntimeError('not_found','Run does not exist. Use the runId returned by a judgment, run, or evaluation.');
    const binding={type:'run',id,details},offset=cursorOffset(cursor,binding);
    const rows=this.db.prepare('SELECT * FROM run_items WHERE run_id=? ORDER BY position LIMIT ? OFFSET ?').all(id,limit+1,offset);
    const items=rows.map(r=>({id:String(r.id),data:parse(r.data),result:r.result?parse(r.result):null,...(details?{events:this.db.prepare('SELECT event FROM events WHERE run_id=? AND item_id=? ORDER BY seq').all(id,String(r.id)).map(e=>parse(e.event))}:{})}));
    return {runId:id,status:String(row.status),manifest:parse(row.manifest),summary:row.summary?parse(row.summary):null,...page(items,limit,offset,binding),outcomes:this.db.prepare('SELECT outcome,created_at FROM outcomes WHERE run_id=? ORDER BY created_at').all(id).map(o=>({reported:parse(o.outcome),createdAt:String(o.created_at)}))};
  }
  cacheGet(fingerprint:string):{response:Response;createdAt:string}|undefined {
    const row=this.db.prepare('SELECT * FROM cache WHERE fingerprint=? AND created_at>?').get(fingerprint,Date.now()-3_600_000);
    return row?{response:parse<Response>(row.response),createdAt:new Date(Number(row.created_at)).toISOString()}:undefined;
  }
  cachePut(fingerprint:string,response:Response){this.db.prepare('INSERT OR REPLACE INTO cache VALUES(?,?,?)').run(fingerprint,JSON.stringify(response),Date.now());}
  outcome(runId:string,value:unknown){
    if(!this.db.prepare('SELECT id FROM runs WHERE id=?').get(runId))throw new RuntimeError('not_found','Attach an outcome to an existing runId.');
    const id=randomUUID();this.db.prepare('INSERT INTO outcomes VALUES(?,?,?,?)').run(id,runId,JSON.stringify(value),new Date().toISOString());
    return {id,runId,status:'recorded_as_reported',note:'An outcome report is retained as supplied, not independently verified or automatically promoted to a reusable rule.'};
  }
}
