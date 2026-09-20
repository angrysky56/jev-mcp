import type { Case, Candidate, Request, Rubric, Variant, Question } from './types.ts';

/** Compile one case into independent questions sharing only its evidence state. */
export function buildRequest(item: Case, rubric: Rubric, model: string, variant: Variant): Request {
  const state = structuredClone(item.state);
  const section = rubric.sections[item.direction];
  let criteria = { ...section.criteria };
  const questions: Record<string, Question> = {};
  if (item.direction === 'question') {
    const candidates = state.candidates as unknown as Candidate[];
    if (variant === 'reversed') candidates.reverse();
    criteria = Object.fromEntries(candidates.map(c => [c.id, c.action]));
    criteria.insufficient = 'No supplied candidate can be justified as a feasible, distinguishing observation from this record.';
    for (const candidate of candidates) {
      questions[`discrimination_${candidate.id}`] = {
        type: 'score',
        instructions: `Using only the stated hypotheses and predictions, how well would the observation for candidate ${candidate.id} in \`candidates\` distinguish those hypotheses? Assess discrimination separately from feasibility.`,
        criteria: ['The predicted result is the same under all hypotheses, or is unrelated.', 'Some alternatives predict different results, but others remain indistinguishable.', 'The stated results distinguish every competing hypothesis.'],
      };
      questions[`feasibility_${candidate.id}`] = {
        type: 'choice',
        instructions: `Can candidate ${candidate.id} in \`candidates\` be carried out under \`constraints\` and its stated requirements?`,
        criteria: { feasible: 'The supplied record establishes that the requirements are available and constraints allow it.', blocked: 'A stated requirement is unavailable or the action violates an explicit constraint.', unknown: 'The record does not establish whether a requirement can be met.' },
      };
    }
  }
  if (variant === 'reversed') criteria = Object.fromEntries(Object.entries(criteria).reverse());
  questions.judgment = {
    type: 'choice',
    instructions: variant === 'paraphrase' ? section.paraphrase : section.instruction,
    criteria,
  };
  if (item.direction === 'belief') {
    questions.new_evidence = {
      type: 'noul',
      instructions: 'Does `observation` provide a new observation relevant to `claim` rather than repeating evidence in `prior_evidence` or merely restating an assertion?',
      criteria: { true: 'It adds a relevant observation not already represented by the same source in prior evidence.', false: 'It is repetition, circular assertion, unrelated information, or contains no observation.' },
    };
  }
  return { model, state, questions };
}

/** Exact metadata and text checks; these are provenance facts, not truth judgments. */
export function sourceChecks(item: Case): Record<string, unknown> {
  const sources = item.state.source_roots;
  const ids = Array.isArray(sources) ? sources.filter((x): x is string => typeof x === 'string') : [];
  return {
    declaredSourceCount: ids.length,
    uniqueDeclaredRoots: new Set(ids).size,
    repeatedDeclaredRoot: ids.length > new Set(ids).size,
    quotePresent: typeof item.state.quote === 'string' && typeof item.state.source_text === 'string'
      ? item.state.source_text.includes(item.state.quote) : null,
  };
}
