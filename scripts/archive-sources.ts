import { readdir, readFile } from 'node:fs/promises';
import { hash, readJson, root, writeJson } from '../src/io.ts';
import type { Manifest } from '../src/types.ts';

/** Add an exact source archive to historical runs only when every hash matches. */
for (const name of await readdir(`${root}/runs`)) {
  const dir = `${root}/runs/${name}`;
  const manifest = await readJson<Manifest>(`${dir}/manifest.json`);
  const sources: Record<string, string> = {};
  for (const [path, expected] of Object.entries(manifest.hashes).filter(([path]) => path.startsWith('src/'))) {
    const source = await readFile(`${root}/${path}`, 'utf8');
    if (hash(source) !== expected) throw new Error(`Cannot archive changed source ${path} for ${name}.`);
    sources[path] = source;
  }
  await writeJson(`${dir}/source-snapshot.json`, sources);
  console.log(`Archived matching source: ${name}`);
}
