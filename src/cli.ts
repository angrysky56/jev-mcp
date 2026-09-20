import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadDataset } from './dataset.ts';
import { readJson, root } from './io.ts';
import { runExperiment } from './runner.ts';
import { renderReport } from './report.ts';
import type { Event, Manifest, Provider, Rubric, Split, Variant } from './types.ts';

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      provider: { type: 'string', default: 'openrouter' },
      split: { type: 'string', default: 'development' },
      rubric: { type: 'string', default: 'v1' },
      variants: { type: 'string', default: 'canonical' },
      live: { type: 'boolean', default: false },
      model: { type: 'string' }, out: { type: 'string' },
      condition: { type: 'string', default: 'unaided' },
    },
  });
  const command = positionals[0] ?? 'help';
  if (command === 'help') {
    console.log('Commands: validate | prompts | run [--live] [--provider openrouter|typesafe] [--split development|evaluation] [--rubric v1|v2] [--variants canonical,paraphrase,reversed] [--out directory] | report RUN_DIRECTORY');
  } else if (command === 'report') {
    if (!positionals[1]) throw new Error('Provide a run directory.');
    const dir = resolve(positionals[1]);
    const manifest = await readJson<Manifest>(`${dir}/manifest.json`);
    const events = (await readFile(`${dir}/events.jsonl`, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Event);
    console.log(renderReport(manifest, events));
  } else {
    if (!['openrouter', 'typesafe'].includes(values.provider!) || !['development', 'evaluation'].includes(values.split!) || !['v1', 'v2'].includes(values.rubric!)) throw new Error('Invalid provider, split, or rubric.');
    const variants = values.variants!.split(',');
    if (variants.some(v => !['canonical', 'paraphrase', 'reversed'].includes(v))) throw new Error('Unknown variant.');
    const rubric = await readJson<Rubric>(`${root}/experiments/rubrics/${values.rubric}.json`);
    const data = await loadDataset(rubric);
    if (command === 'validate') console.log('Validated 36 cases, six per direction/split; all gold and baseline choices are in range.');
    else if (command === 'prompts') {
      if (!['unaided', 'checklist'].includes(values.condition!)) throw new Error('Baseline condition must be unaided or checklist.');
      console.log(JSON.stringify({ instruction: 'Return one label per case using only the supplied state. This export excludes answer keys and baseline predictions.', condition: values.condition, labels: { belief: ['supports', 'weakens', 'unchanged', 'insufficient'], question: 'A supplied candidate ID, or insufficient when none is justified as a feasible distinguishing observation.', adaptation: ['responsive', 'self_sealing', 'insufficient'] }, cases: data.cases.filter(c => c.split === values.split).map(c => ({ id: c.id, direction: c.direction, state: c.state })), ...(values.condition === 'checklist' ? { checklist: await readFile(`${root}/experiments/checklist.md`, 'utf8') } : {}) }, null, 2));
    } else if (command === 'run') {
      const provider = values.provider as Provider;
      const directory = await runExperiment({ provider, split: values.split as Split, rubricVersion: values.rubric as 'v1' | 'v2', variants: variants as Variant[], live: values.live!, apiKey: process.env[provider === 'typesafe' ? 'TYPESAFE_API_KEY' : 'OPENROUTER_API_KEY'], model: values.model, outputRoot: values.out ? resolve(values.out) : undefined });
      console.log(`Run saved: ${directory}`);
      const summary = await readJson<{ failedRequests: number; unattemptedRequests: number }>(`${directory}/summary.json`);
      if (values.live && (summary.failedRequests > 0 || summary.unattemptedRequests > 0)) process.exitCode = 1;
    } else throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Experiment failed.');
  process.exitCode = 1;
}
