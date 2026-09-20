import { mkdir, readFile, readdir, appendFile } from 'node:fs/promises';
import { root, hash, readJson, writeJson } from '../src/io.ts';
import { buildContinuityRequest, continuityPolicy, selectCards, selectionFromResponse } from '../src/continuity.ts';
import { callProvider, defaultModels } from '../src/provider.ts';
import type { ContinuityCase } from '../src/continuity.ts';

const live = process.argv.includes('--live');
const apiKey = process.env.OPENROUTER_API_KEY;
if (live && !apiKey) throw new Error('OPENROUTER_API_KEY is unavailable.');
const corpus = await readJson<ContinuityCase[]>(`${root}/studies/continuity/cases.json`);
const items: ContinuityCase[] = [];
for (const id of ['p2','p9']) {
  const base = structuredClone(corpus.find(c => c.id === id)!);
  items.push(base);
  const crowded = structuredClone(base); crowded.id = `${id}-crowded`;
  const source = base.cards[0];
  const paraphrases = id === 'p2'
    ? ['Cycling power twice did not fix the mount; repeating that trial under unchanged conditions adds nothing.', 'The previous two restarts had no effect, so do not spend the next turn trying the same restart again.', 'Restarting already failed twice with the current setup; this unsuccessful attempt must be remembered.', 'Two unsuccessful power resets are recorded. The problem persisted after each reset.']
    : ['Opening the roof vent already failed to lower humidity in the controlled test.', 'The roof-vent intervention did not change the humidity reading; that attempt is finished.', 'Remember that the controlled vent-opening trial failed to reduce humidity.', 'The same setup was tested with the vent opened, and humidity did not fall.'];
  // Same observation, explicitly the same source; credit coverage by source, not ID.
  crowded.cards = [...paraphrases.map((text, i) => ({...source,id:`A${i}`,text})), ...crowded.cards];
  items.push(crowded);
}
const variants = ['canonical','paraphrase','reversed'] as const;
const dir = `${root}/studies/continuity/crowding/${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(dir,{recursive:true});
const sources = Object.fromEntries(await Promise.all((await readdir(`${root}/src`)).filter(f=>f.endsWith('.ts')).map(async f=>[`src/${f}`,await readFile(`${root}/src/${f}`,'utf8')])));
await writeJson(`${dir}/manifest.json`, {createdAt:new Date().toISOString(),live,items,variants,policy:continuityPolicy,model:defaultModels.openrouter,sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,hash(v)])),
  scoring:'A required information item is present if any selected card cites its source. Duplicate aliases receive credit for the same information, but cannot substitute for a different required source.',
  comparison:'Compare current per-card packing with a code-only cap of one selected representative per identical source; both use the same raw Jev scores. No semantic equivalence is inferred by the source cap.'});
await writeJson(`${dir}/source-snapshot.json`,sources);
const events=[];
if(live) for(const item of items) for(const variant of variants) {
  const request=buildContinuityRequest(item,defaultModels.openrouter,variant);
  const start=performance.now();
  const result=await callProvider('openrouter',request,{apiKey:apiKey!});
  const original=selectionFromResponse(item,result.response);
  const scores=Object.fromEntries(Object.entries(result.response?.answers??{}).flatMap(([id,a])=>a.type==='score'?[[id.replace(/^value_/,''),a.score]]:[]));
  // Choose the best-scored representative per explicit source before packing.
  const representatives=new Map<string, typeof item.cards[number]>();
  for(const card of item.cards) {
    const existing=representatives.get(card.source);
    if(!existing||(scores[card.id]??-Infinity)>(scores[existing.id]??-Infinity))representatives.set(card.source,card);
  }
  const capped=selectCards({...item,cards:[...representatives.values()]},scores,continuityPolicy.minimumScore,continuityPolicy.packetCardLimit);
  const requiredSources=item.gold.required.map(id=>item.cards.find(c=>c.id===id)!.source);
  const coverage=(ids:string[])=>{
    const selectedSources=new Set(ids.map(id=>item.cards.find(c=>c.id===id)!.source));
    return requiredSources.filter(s=>selectedSources.has(s)).length;
  };
  const event={caseId:item.id,variant,request,fingerprint:hash(request),elapsedMs:performance.now()-start,...result,original,capped,requiredSources,originalCoverage:result.response?coverage(original.selected):null,cappedCoverage:result.response?coverage(capped.selected):null};
  await appendFile(`${dir}/events.jsonl`,JSON.stringify(event)+'\n');events.push(event);
  console.log(`${item.id}/${variant}: original ${event.originalCoverage}/${requiredSources.length}, source cap ${event.cappedCoverage}/${requiredSources.length}`);
  if(result.error?.status&&[401,402,403,404].includes(result.error.status))throw new Error(`Provider stopped with ${result.error.status}`);
}
await writeJson(`${dir}/summary.json`,{
  live,requests:events.length,errors:events.filter(e=>e.error).length,
  originalComplete:events.filter(e=>e.originalCoverage===e.requiredSources.length).length,
  sourceCapComplete:events.filter(e=>e.cappedCoverage===e.requiredSources.length).length,
  costUsd:events.reduce((n,e)=>n+(e.response?.usage.cost??0),0),
});
console.log(`Crowding probe: ${dir}`);
