import { parseArgs } from 'node:util';
import { readJson } from '../src/io.ts';
import { runContinuity } from '../src/continuity-study.ts';
import type { Provider } from '../src/types.ts';

try {
  const { values } = parseArgs({ options: { live: { type: 'boolean', default: false }, provider: { type: 'string', default: 'openrouter' }, split: { type: 'string', default: 'development' } } });
  if (!['typesafe','openrouter'].includes(values.provider!) || !['development','evaluation'].includes(values.split!)) throw new Error('Invalid provider or split.');
  const provider = values.provider as Provider;
  const dir = await runContinuity({ live: values.live!, provider, split: values.split as 'development' | 'evaluation', apiKey: process.env[provider === 'typesafe' ? 'TYPESAFE_API_KEY' : 'OPENROUTER_API_KEY'] });
  console.log(`Run saved: ${dir}`);
  const summary = await readJson<{ errors: number; unattempted: number }>(`${dir}/summary.json`);
  if (values.live && (summary.errors || summary.unattempted)) process.exitCode = 1;
} catch (error) { console.error(error instanceof Error ? error.message : 'Continuity study failed.'); process.exitCode = 1; }
