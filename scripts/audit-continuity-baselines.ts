import { baselineScores, selectCards, scoreSelection } from '../src/continuity.ts';
import type { ContinuityCase } from '../src/continuity.ts';
import { readJson, root, writeJson } from '../src/io.ts';

/** Post-study audit: known record types can filter method candidates without a model. */
const cases = await readJson<ContinuityCase[]>(`${root}/studies/continuity/cases.json`);
const rows = cases.filter(c=>c.kind==='method').map(item=>{
  const candidates={...item,cards:item.cards.filter(card=>card.role==='procedure')};
  return {caseId:item.id,split:item.split,
    lexical:selectCards(candidates,baselineScores(candidates,'lexical'),0,2),
    recent:selectCards(candidates,baselineScores(candidates,'recent'),0,2)};
});
const summary = (['development','evaluation'] as const).map(split=>{
  const entries=rows.filter(r=>r.split===split);
  return {split,cases:entries.length,
    lexical:entries.filter(r=>scoreSelection(cases.find(c=>c.id===r.caseId)!,r.lexical.selected).success).length,
    recent:entries.filter(r=>scoreSelection(cases.find(c=>c.id===r.caseId)!,r.recent.selected).success).length};
});
const output={createdAt:new Date().toISOString(),note:'Post-hoc baseline audit, not pre-registered: filter explicitly typed non-procedure records before lexical/recency retrieval. Same two-card budget, no API calls. This corrects an unnecessarily weak original baseline; it does not alter the frozen original reports.',rows,summary};
await writeJson(`${root}/studies/continuity/type-aware-baselines.json`,output);
console.log(JSON.stringify(summary,null,2));
