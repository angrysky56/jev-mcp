import { root, readJson, writeJson } from '../src/io.ts';
import { methodFits, composeMethodWorkflow } from '../src/skill-methods.ts';
import type { MethodTask, MethodFragment } from '../src/skill-methods.ts';
import type { Response } from '../src/types.ts';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const args = process.argv.slice(2), verify = args[0] === '--verify';
const dir = verify ? args[1] : args[0];
if (!dir || args.length !== (verify?2:1)) throw new Error('Usage: [--verify] run-directory');
const manifest = await readJson<{cases:MethodTask[];catalog:MethodFragment[]}>(`${dir}/manifest.json`);
const events = (await readFile(`${dir}/events.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(l=>JSON.parse(l) as {caseId:string;variant:string;response?:Response});
// This is an explicit post-hoc correction to the host-authored workflow contracts.
// It reuses original judgments and preserves the original single-goal reports.
const extraGoals: Record<string,string[]> = {library:['verification_plan'],oral_history:['evidence_table']};
const results = events.filter(e=>extraGoals[e.caseId]).map(e=>{
  const task = {...manifest.cases.find(c=>c.id===e.caseId)!,additionalGoals:extraGoals[e.caseId]};
  return {caseId:e.caseId,variant:e.variant,additionalGoals:task.additionalGoals,workflow:composeMethodWorkflow(task,manifest.catalog,e.response?methodFits(e.response):undefined)};
});
const audit = {note:'Post-hoc contract correction: cover explicit evidence/checking outputs as well as the primary artifact. No new inference and no relabelling of the original model study.',sourceRun:dir.split('/').at(-1),results};
const path = `${root}/studies/skill-methods/composition-audit.json`;
if (verify) assert.deepEqual(await readJson(path),audit);
else await writeJson(path,audit);
console.log(JSON.stringify({verified:verify,results:results.map(r=>({caseId:r.caseId,variant:r.variant,status:r.workflow.status,steps:r.workflow.steps.map(s=>s.id)}))},null,2));
