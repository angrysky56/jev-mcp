import type { Baseline, Case, Gold, Rubric } from './types.ts';
import { readJson, root } from './io.ts';
import { buildRequest } from './questions.ts';

export interface Dataset { cases: Case[]; gold: Record<string, Gold>; baselines: Baseline }

/** Fail before inference if a fixture, answer key, or baseline is incomplete. */
export function validateDataset(data: Dataset, rubric: Rubric): void {
  const fail = (message: string): never => { throw new Error(`Invalid experiment data: ${message}`); };
  if (!Array.isArray(data.cases) || data.cases.length !== 36) fail('expected 36 cases');
  const ids = data.cases.map(c => c.id);
  if (new Set(ids).size !== ids.length) fail('duplicate case IDs');
  for (const direction of ['belief', 'question', 'adaptation']) {
    for (const split of ['development', 'evaluation']) {
      if (data.cases.filter(c => c.direction === direction && c.split === split).length !== 6) fail(`expected six ${direction}/${split} cases`);
    }
  }
  for (const labels of [data.gold, data.baselines.unaided, data.baselines.checklist]) {
    if (Object.keys(labels).length !== ids.length || ids.some(id => !Object.hasOwn(labels, id))) fail('gold/baseline IDs do not match cases');
  }
  for (const item of data.cases) {
    if (!/^[a-z][0-9]{2}$/.test(item.id) || !item.title || !item.state || Array.isArray(item.state)) fail('invalid case identity or state');
    if (item.direction === 'question') {
      const candidates = item.state.candidates;
      if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 8) fail(`invalid candidates: ${item.id}`);
      const candidateIds: string[] = [];
      for (const c of candidates as Array<Record<string, unknown>>) {
        if (!c || typeof c !== 'object' || !['id', 'action', 'predictions', 'requirements'].every(k => typeof c[k] === 'string' && c[k])) fail(`incomplete candidate: ${item.id}`);
        if (!/^[A-H]$/.test(c.id as string)) fail(`invalid candidate ID: ${item.id}`);
        candidateIds.push(c.id as string);
      }
      if (new Set(candidateIds).size !== candidateIds.length) fail(`duplicate candidate: ${item.id}`);
    }
    const question = buildRequest(item, rubric, 'jev-latest', 'canonical').questions.judgment;
    if (question.type !== 'choice') throw new Error('Primary judgment must be a choice');
    const allowed = Object.keys(question.criteria);
    const gold = data.gold[item.id];
    if (!gold?.reason || !gold.labels?.length || gold.labels.some(label => !allowed.includes(label))) fail(`invalid gold labels: ${item.id}`);
    for (const condition of ['unaided', 'checklist'] as const) {
      if (!allowed.includes(data.baselines[condition][item.id])) fail(`invalid baseline: ${condition}/${item.id}`);
    }
  }
}

export async function loadDataset(rubric: Rubric): Promise<Dataset> {
  const [cases, gold, baselines] = await Promise.all([
    readJson<Case[]>(`${root}/experiments/cases.json`),
    readJson<Record<string, Gold>>(`${root}/experiments/gold.json`),
    readJson<Baseline>(`${root}/experiments/baselines.json`),
  ]);
  const data = { cases, gold, baselines };
  validateDataset(data, rubric);
  return data;
}
