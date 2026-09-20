import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hash, readJson, root, writeJson } from '../src/io.ts';
import type { Event, Manifest, Rubric } from '../src/types.ts';

/** One explicit host-authored revision, based only on a completed development run. */
const sourceRun = process.argv[2];
if (!sourceRun) throw new Error('Usage: node scripts/freeze-revision.ts DEVELOPMENT_RUN_DIRECTORY');
const dir = resolve(sourceRun);
const manifest = await readJson<Manifest>(`${dir}/manifest.json`);
if (manifest.split !== 'development' || manifest.rubric.version !== 'v1' || !manifest.live) throw new Error('Revision requires a live v1 development run.');
const eventText = await readFile(`${dir}/events.jsonl`, 'utf8');
const events = eventText.trim().split('\n').map(line => JSON.parse(line) as Event);
if (events.length !== manifest.plannedRequests || events.some(e => e.error)) throw new Error('Finish the development run before freezing a revision.');
const failures = events.filter(e => e.response?.answers.judgment.type === 'choice' && !manifest.gold[e.caseId].labels.includes(e.response.answers.judgment.choice));
if (!failures.some(e => e.caseId === 'a04')) throw new Error('This particular revision addresses the observed a04 failure; inspect the new run before revising.');
const rubric = structuredClone(manifest.rubric) as Rubric;
rubric.version = 'v2';
rubric.note = 'One host-authored revision after development. Only adaptation changes; belief and question rubrics had no primary-label development errors. No evaluation output informed the revision.';
rubric.sections.adaptation = {
  instruction: 'Classify the response by whether the record specifies an actual revision or an observation that could weaken the hypothesis. Inspect what outcomes are allowed to count against the belief. Do not equate willingness-to-investigate language with a specified test or belief update. Use only the supplied record.',
  paraphrase: 'Does this response actually reduce or revise the challenged belief, identify a concrete possible observation that would weaken it, or make it immune to contrary outcomes? General interest in investigating does not establish a test or update. Classify only what the record makes explicit.',
  criteria: {
    responsive: 'The response actually withdraws, weakens, or narrows the challenged claim, or gives a concrete test with a stated outcome that would weaken or reject it. A bounded instrument check or auxiliary explanation qualifies when it retains such a losing outcome.',
    self_sealing: 'The response makes every relevant outcome confirm the claim, or explicitly excludes any possible observation from weakening it. A proposed test or verbal revision does not qualify as responsive when an escape clause makes disconfirmation impossible.',
    insufficient: 'The response specifies neither an actual belief revision nor a concrete possible outcome that would weaken it, and does not explicitly immunize it. General curiosity, promises to investigate, tentative possibilities, and undefined criteria alone are insufficient.',
  },
};
await writeJson(`${root}/experiments/rubrics/v2.json`, rubric);
await writeJson(`${root}/experiments/revision.json`, {
  frozenAt: new Date().toISOString(),
  author: 'Connected Codex agent; no generative API call',
  sourceRun: sourceRun.replace(root, ''),
  sourceManifestHash: hash(manifest), sourceEventsHash: hash(eventText),
  originalRubricHash: hash(manifest.rubric), revisedRubricHash: hash(rubric),
  observedFailures: failures.map(e => ({ caseId: e.caseId, variant: e.variant, answer: e.response!.answers.judgment })),
  change: 'Distinguish a vague intention to investigate from an actual revision or a specific test with a losing outcome. Preserve the other two rubrics unchanged because development did not identify an error in them.',
  evaluationPolicy: 'Freeze now, run v1 and v2 on the reserved evaluation split, and report every result without further rubric changes.',
});
console.log('Frozen v2 and revision provenance. Evaluation may now run.');
