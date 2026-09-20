import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadDataset } from './dataset.ts';
import { hash, readJson, root, writeJson } from './io.ts';
import { buildRequest, sourceChecks } from './questions.ts';
import { callProvider, defaultModels, endpoints, isFloatingModel } from './provider.ts';
import { renderReport, summarize } from './report.ts';
import type { Event, Manifest, Provider, Rubric, Split, Variant } from './types.ts';

export interface RunOptions {
  provider: Provider; split: Split; rubricVersion: 'v1' | 'v2'; variants: Variant[];
  live: boolean; apiKey?: string; model?: string; outputRoot?: string; maxRequests?: number;
  fetcher?: typeof fetch;
}

export async function runExperiment(options: RunOptions): Promise<string> {
  const rubric = await readJson<Rubric>(`${root}/experiments/rubrics/${options.rubricVersion}.json`);
  const data = await loadDataset(rubric);
  if (options.split === 'evaluation') {
    const revision = await readJson<{ revisedRubricHash: string; originalRubricHash: string; sourceRun: string; sourceManifestHash: string; sourceEventsHash: string }>(`${root}/experiments/revision.json`);
    const revised = await readJson<Rubric>(`${root}/experiments/rubrics/v2.json`);
    const original = await readJson<Rubric>(`${root}/experiments/rubrics/v1.json`);
    if (revision.revisedRubricHash !== hash(revised)) throw new Error('Revised rubric differs from its pre-evaluation freeze.');
    if (revision.originalRubricHash !== hash(original)) throw new Error('Original rubric differs from its pre-evaluation freeze.');
    const sourceManifest = await readJson<Manifest>(`${root}/${revision.sourceRun}/manifest.json`);
    const sourceEvents = await readFile(`${root}/${revision.sourceRun}/events.jsonl`, 'utf8');
    if (hash(sourceManifest) !== revision.sourceManifestHash || hash(sourceEvents) !== revision.sourceEventsHash) throw new Error('Revision source run has changed.');
    if (sourceManifest.hashes.cases !== hash(data.cases) || sourceManifest.hashes.gold !== hash(data.gold) || sourceManifest.hashes.baselines !== hash(data.baselines)) throw new Error('Cases, gold labels, or baselines changed after development. Start a new study.');
  }
  const cases = data.cases.filter(c => c.split === options.split);
  const plannedRequests = cases.length * options.variants.length;
  if (!options.variants.length || new Set(options.variants).size !== options.variants.length || !options.variants.includes('canonical')) throw new Error('Variants must be unique and include canonical.');
  if (plannedRequests > (options.maxRequests ?? 108)) throw new Error('Planned calls exceed the experiment request limit.');
  if (options.live && !options.apiKey) throw new Error(`Missing ${options.provider === 'typesafe' ? 'TYPESAFE_API_KEY' : 'OPENROUTER_API_KEY'} in the launching shell. No calls made.`);
  const requestedModel = options.model ?? defaultModels[options.provider];
  // Evaluation runs are the frozen comparison; they reject a changed rubric, cases, or baselines,
  // and for the same reason they reject a model identifier that can change underneath them.
  if (options.split === 'evaluation' && isFloatingModel(requestedModel)) throw new Error(`Evaluation runs require a concrete model, not the floating alias ${requestedModel}. Pass --model with an exact slug, e.g. typesafe/jev-1.13.`);
  const runDir = join(options.outputRoot ?? `${root}/runs`, `${new Date().toISOString().replaceAll(':', '-')}-${options.rubricVersion}-${options.split}-${randomUUID().slice(0, 8)}`);
  await mkdir(runDir, { recursive: true });
  const codeFiles = (await readdir(`${root}/src`)).filter(f => f.endsWith('.ts')).sort();
  const sources = Object.fromEntries(await Promise.all(codeFiles.map(async f => [`src/${f}`, await readFile(`${root}/src/${f}`, 'utf8')])));
  const hashes = Object.fromEntries(Object.entries(sources).map(([path, source]) => [path, hash(source)]));
  const selectedGold = Object.fromEntries(cases.map(c => [c.id, data.gold[c.id]]));
  const manifest: Manifest = {
    schemaVersion: 1, createdAt: new Date().toISOString(), live: options.live,
    provider: options.provider, endpoint: endpoints[options.provider], requestedModel,
    split: options.split, variants: options.variants, rubric, cases, gold: selectedGold, baselines: data.baselines,
    hashes: { ...hashes, cases: hash(data.cases), gold: hash(data.gold), baselines: hash(data.baselines), rubric: hash(rubric) }, plannedRequests,
  };
  await writeJson(join(runDir, 'manifest.json'), manifest);
  await writeJson(join(runDir, 'source-snapshot.json'), sources);
  await writeJson(join(runDir, 'source-checks.json'), Object.fromEntries(cases.map(c => [c.id, sourceChecks(c)])));
  // The request preview deliberately omits gold, baseline answers, and fixture titles.
  const requests = cases.flatMap(item => options.variants.map(variant => ({ item, variant, request: buildRequest(item, rubric, manifest.requestedModel, variant) })));
  await writeJson(join(runDir, 'requests.json'), requests.map(({ item, variant, request }) => ({ caseId: item.id, variant, request })));
  await writeFile(join(runDir, 'events.jsonl'), '', { flag: 'wx', mode: 0o600 });
  const events: Event[] = [];
  if (options.live) {
    for (const { item, variant, request } of requests) {
      const startedAt = new Date().toISOString(), start = performance.now();
      const result = await callProvider(options.provider, request, { apiKey: options.apiKey!, fetcher: options.fetcher });
      const event: Event = { caseId: item.id, direction: item.direction, variant, startedAt, request, fingerprint: hash(request), elapsedMs: performance.now() - start, ...result };
      // An interruption leaves all completed calls readable, never replaces an earlier run.
      await appendFile(join(runDir, 'events.jsonl'), JSON.stringify(event) + '\n');
      events.push(event);
      console.log(`${events.length}/${plannedRequests} ${item.id}/${variant}: ${event.error ? 'ERROR ' + event.error.kind : 'recorded'}`);
      if (event.error?.kind === 'configuration' || [401, 402, 403, 404].includes(event.error?.status ?? 0)) break;
    }
  }
  await writeJson(join(runDir, 'summary.json'), summarize(manifest, events));
  await writeFile(join(runDir, 'report.md'), renderReport(manifest, events), { flag: 'wx' });
  return runDir;
}
