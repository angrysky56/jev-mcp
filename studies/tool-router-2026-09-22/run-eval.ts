/**
 * Runs tool_router over every task in tasks.json and scores it against the
 * expectations stored beforehand (belief_ledger/pred_tool_router_1).
 * Uses the repo's MCP server over stdio so field order and object context are preserved.
 * Usage: JEV_DATA_DIR=... node studies/tool-router-2026-09-22/run-eval.ts
 */
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readFile, writeFile } from 'node:fs/promises';
import { root } from '../../src/io.ts';

interface Task { id: string; task: string; core: string[]; ok: string[] }
const dir = `${root}/studies/tool-router-2026-09-22`;
const catalog = JSON.parse(await readFile(`${dir}/catalog.json`, 'utf8'));
const tasks: Task[] = JSON.parse(await readFile(`${dir}/tasks.json`, 'utf8'));
const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
const client = new Client({ name: 'tool-router-eval', version: '1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [`${root}/src/server.ts`], env, stderr: 'ignore' }));
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await client.callTool({ name, arguments: args }, { timeout: 170000 });
  const result = (r.structuredContent as { result: Record<string, any> }).result;
  if (r.isError) throw new Error(JSON.stringify(result));
  return result;
};
try {
  const recordsMode = process.argv.includes('--records');
  if (process.argv.includes('--define')) await call('define_capability', JSON.parse(await readFile(`${dir}/${recordsMode ? 'define_v2.json' : 'define.json'}`, 'utf8')));
  if (recordsMode) await call('store_records', JSON.parse(await readFile(`${dir}/catalog_records.json`, 'utf8')));
  const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'results.json';
  const rows = [];
  for (const t of tasks) {
    const source = recordsMode ? { records: { scope: 'mcp_catalog' } } : { items: catalog, version: 1 };
    const run = await call('run_capability', { name: 'tool_router', ...source, context: { task: t.task }, maxCalls: 20 });
    const page = await call('get_run', { runId: run.runId, limit: 20 });
    const helps: Record<string, number> = {}, route: Record<string, string> = {};
    for (const item of page.items) { helps[item.id] = item.result.stages.fit.answers.helps.noul; route[item.id] = item.result.route; }
    const ranked = Object.keys(helps).sort((a, b) => helps[b] - helps[a]);
    const use = ranked.filter(id => route[id] === 'use'), consider = ranked.filter(id => route[id] === 'consider');
    const acceptable = new Set([...t.core, ...t.ok]);
    const top1 = t.core.length ? t.core.includes(ranked[0]) : use.length === 0;
    rows.push({ id: t.id, runId: run.runId, top: ranked.slice(0, 3).map(id => `${id}:${helps[id].toFixed(2)}`), use, consider, top1,
      falseUse: use.filter(id => !acceptable.has(id)), missedCore: t.core.filter(id => route[id] === 'skip') });
    console.log(JSON.stringify(rows.at(-1)));
  }
  const summary = { top1: rows.filter(r => r.top1).length, tasks: rows.length,
    negativeT12Clean: rows.find(r => r.id === 'T12')!.use.length === 0,
    falseUseTotal: rows.reduce((n, r) => n + r.falseUse.length, 0), falseUsePerTask: rows.reduce((n, r) => n + r.falseUse.length, 0) / rows.length };
  console.log(JSON.stringify(summary));
  await writeFile(`${dir}/${out}`, JSON.stringify({ summary, rows }, null, 1));
} finally { await client.close(); }
