import type { Event, Manifest } from './types.ts';

export function summarize(manifest: Manifest, events: Event[]) {
  const rows = (['belief', 'question', 'adaptation'] as const).map(direction => {
    const cases = manifest.cases.filter(c => c.direction === direction);
    const attempts = events.filter(e => e.direction === direction);
    const canonical = attempts.filter(e => e.variant === 'canonical');
    const correct = (e: Event): boolean => e.response?.answers.judgment.type === 'choice' && manifest.gold[e.caseId].labels.includes(e.response.answers.judgment.choice);
    let changed = 0, comparisons = 0, harmful = 0;
    for (const event of attempts.filter(e => e.variant !== 'canonical')) {
      const base = canonical.find(e => e.caseId === event.caseId);
      const answer = event.response?.answers.judgment;
      const baseAnswer = base?.response?.answers.judgment;
      if (answer?.type !== 'choice' || baseAnswer?.type !== 'choice') continue;
      comparisons++;
      if (answer.choice !== baseAnswer.choice) {
        changed++;
        if (correct(base!) && !correct(event)) harmful++;
      }
    }
    return {
      direction, cases: cases.length,
      unaided: cases.filter(c => manifest.gold[c.id].labels.includes(manifest.baselines.unaided[c.id])).length,
      checklist: cases.filter(c => manifest.gold[c.id].labels.includes(manifest.baselines.checklist[c.id])).length,
      canonicalCorrect: canonical.filter(correct).length,
      canonicalValid: canonical.filter(e => !!e.response).length,
      allCorrect: attempts.filter(correct).length,
      allPlanned: cases.length * manifest.variants.length,
      failures: attempts.filter(e => !!e.error).length,
      changed, comparisons, harmful,
    };
  });
  const successes = events.filter(e => e.response);
  const sortedTimes = successes.map(e => e.elapsedMs).sort((a, b) => a - b);
  const medianMs = sortedTimes.length ? sortedTimes[Math.floor(sortedTimes.length / 2)] : null;
  return {
    rows,
    plannedRequests: manifest.plannedRequests,
    recordedRequests: events.length,
    successfulRequests: successes.length,
    failedRequests: events.filter(e => e.error).length,
    unattemptedRequests: manifest.plannedRequests - events.length,
    httpAttempts: events.reduce((n, e) => n + e.attempts, 0),
    inputTokens: successes.reduce((n, e) => n + e.response!.usage.input_tokens, 0),
    outputTokens: successes.reduce((n, e) => n + e.response!.usage.output_tokens, 0),
    reportedCostUsd: successes.some(e => e.response!.usage.cost !== undefined) ? successes.reduce((n, e) => n + (e.response!.usage.cost ?? 0), 0) : null,
    costCoverage: `${successes.filter(e => e.response!.usage.cost !== undefined).length}/${successes.length} validated responses; failed requests may have unrecorded charges`,
    medianMs,
    models: [...new Set(successes.map(e => e.response!.model))],
  };
}

/** Reports never count transport failures or unattempted cases as successful abstentions. */
export function renderReport(manifest: Manifest, events: Event[]): string {
  const summary = summarize(manifest, events);
  const lines = [
    `# Jev ${manifest.rubric.version}: ${manifest.split} ${manifest.live ? 'live run' : 'DRY RUN — NO INFERENCE'}`,
    '', `Created: ${manifest.createdAt}. Provider: ${manifest.provider}. Requested model: ${manifest.requestedModel}.`,
    `Returned models: ${summary.models.join(', ') || 'none'}.`, '',
    `Valid responses: ${summary.successfulRequests}/${summary.plannedRequests}. Failures: ${summary.failedRequests}. Unattempted: ${summary.unattemptedRequests}. HTTP attempts: ${summary.httpAttempts}.`,
    `Validated-response input/output tokens: ${summary.inputTokens}/${summary.outputTokens}. Reported cost: ${summary.reportedCostUsd === null ? 'unavailable' : '$' + summary.reportedCostUsd.toFixed(8)}. Cost coverage: ${summary.costCoverage}. Median successful request: ${summary.medianMs === null ? 'unavailable' : summary.medianMs.toFixed(0) + ' ms'}.`,
    '', '## Primary judgments', '',
    '| Direction | Same-author unaided | Same-author checklist | Jev canonical | Jev all variants | Errors | Label changes | Correct-to-wrong changes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of summary.rows) lines.push(`| ${r.direction} | ${r.unaided}/${r.cases} | ${r.checklist}/${r.cases} | ${manifest.live ? `${r.canonicalCorrect}/${r.cases}` : 'not run'} | ${manifest.live ? `${r.allCorrect}/${r.allPlanned}` : 'not run'} | ${r.failures} | ${r.changed}/${r.comparisons} | ${r.harmful} |`);
  lines.push('', 'Counts use predeclared acceptable labels. Equal acceptable alternatives can change labels harmlessly. Auxiliary scores and probabilities remain in events.jsonl; they have no measured accuracy claim or tuned automation threshold.', '',
    '## Case records', '', '| Case | Variant | Expected | Returned | Confidence | Result |', '| --- | --- | --- | --- | --- | --- |');
  for (const event of events) {
    const answer = event.response?.answers.judgment;
    const label = answer?.type === 'choice' ? answer.choice : 'none';
    const confidence = answer?.type === 'choice' ? answer.confidence.toFixed(3) : '—';
    const result = event.error ? `ERROR ${event.error.kind}${event.error.status ? ' ' + event.error.status : ''}` : manifest.gold[event.caseId].labels.includes(label) ? 'match' : 'MISMATCH';
    lines.push(`| ${event.caseId} | ${event.variant} | ${manifest.gold[event.caseId].labels.join(' or ')} | ${label} | ${confidence} | ${result} |`);
  }
  lines.push('', '## Limitations', '', manifest.baselines.limitation,
    '', 'The cases are short synthetic examples. Evaluation labels are reserved from rubric revision, but authored by the same agent. No blinding, calibration study, end-to-end host-agent trial, general truth verification, or formal value-function test is claimed. Development improvements and evaluation results must remain separate. Model scores cannot override constraints.',
    '', 'manifest.json freezes cases, labels, baseline answers, rubric, source hashes, and planned calls before inference. events.jsonl records exact requests, validated answers, redacted raw responses, latency, and failures. source-checks.json contains deterministic provenance checks.', '');
  return lines.join('\n');
}
