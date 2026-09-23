# tool_router: Jev suggests which MCP servers to use

September 22, 2026. Claude (Opus 5.5) in Cowork, with Ty.

**Why:** Ty has built many MCP servers that rarely get used. The likely reason is that Claude doesn't think to reach for them: most servers' tools aren't loaded until Claude looks them up. `tool_router` makes the check cheap. One Jev call per server returns a route: `use`, `consider` or `skip`.

## How to call it

```
run_capability {name: "tool_router", records: {scope: "mcp_catalog"}, context: {task: "<the task in plain words>"}, summaryOnly: true}
```

- **Cost:** 20 Jev calls, about 800 characters back. `summary.routes` lists `use`, `consider` and `skip`, and `selectedIds` is ranked by fit.
- **Catalog:** 20 servers, stored as records in scope `mcp_catalog`. Each record is a title plus "Does / Good for / Not for" text, written from the servers' own tool descriptions.
- **Keeping it current:** edit a record (`store_records`, same id) when a server changes. Add a record when a server is added.
- **Questions:** `helps` (Noul): would this server materially help, beyond a sandbox shell, file editing and web search? `role` (Choice): core, step or none.
- **Routes:** `use` = core and helps ≥ 0.6. `consider` = helps ≥ 0.5. Otherwise `skip`.

## Runtime additions (jev-mcp)

- **`run_capability` accepts `records: {scope, query?, kind?, limit?}` instead of `items`.** Stored records become items `{title, text, kind, source, metadata?}`. Large reusable lists no longer ride along on every call.
  - Side effect: data built on the server can't have its keys reordered by the Cowork bridge.
- **`summaryOnly: true`** drops the per-item rows; they stay available through `get_run`.
- **Tests:** 42/42 pass, typecheck is clean, `verify:runtime` passes.
- **Needs a server restart** before `records` and `summaryOnly` work from Cowork. The catalog records and `tool_router` are already stored in the main library, as version 1 with the v2 wording.

## Evaluation (14 tasks, expectations stored first: `belief_ledger/pred_tool_router_1`)

Each task names the server(s) that should come out on top, plus others that would be acceptable. T12 is a negative case: renaming photos, which the plain shell already handles.

| Metric | Prediction | v1 fields, run 1 | v1, run 2 | v2 record text, run 1 |
| --- | --- | --- | --- | --- |
| Top-ranked server matches the expected one | ≥ 10/14 | 12/14 | 12/14 | 13/14 |
| Negative T12: no server routed `use` | yes | yes | yes | yes |
| `use` routes outside the acceptable set | ≤ 1 per task | 1 total | 1 total | 0 |

**Per task (v2):**

- **Hits:** mcp-logic (logic check, but only `consider`, 0.54), graph-of-thought (design exploration), PageIndex (long PDF), ast-asg (refactor), Context7 (library docs, `consider`, 0.58), shadcn (React UI), advanced-writer (story), jev (filter search results), GitHub (PR), LocalREPL (GPU benchmark), project-synapse (knowledge base), aseke-compass (behaviour).
- **Miss, T10 (intermittent job failure):** Desktop Commander 0.76 and LocalREPL 0.65 ranked above wisdom-engine 0.64. All three were routed `use`. I had predicted this as the weak spot. Arguably you do need the machine's shell to debug a job.
- **v1 misses:**
  - T5: Context7 scored 0.39. Jev judged that web search already covers documentation, which follows from how the baseline was worded.
  - T6: shadcn ranked top, but at 0.46 it fell below every route threshold.
- **A fresh task after the evaluation:** "stress-test a favoured explanation by listing and eliminating rivals" routed wisdom-engine to `use`, with graph-of-thought and advanced-reasoning as `consider`.

## Findings worth acting on

- **wisdom-engine fills Jev's known gap.** Jev can't come up with rival explanations. `wisdom-engine.generate_hypotheses` does, and `apply_via_negativa` eliminates them. So claim_router's `test_rivals` route can become: wisdom-engine generates rivals, then `evidence_stance` judges them against the observations. Not wired up yet.
- **LocalREPL runs on Ty's real machine**, unlike the sandboxed device shell. Anything needing the GPU, Ollama or Neo4j goes there.

## Limits

- **I wrote both the catalog and the tasks.** The "Good for" phrases overlap with the task wording, which makes hits easier than they'll be on real tasks. The real test is logging, over the next weeks, whether each suggested server actually helped.
- **v1 vs v2 is one run each on 14 tasks.** The 13 vs 12 difference doesn't show that v2 is better.
- **It judges from the descriptions only.** It doesn't know whether a server is healthy or configured. For example, GoT's 60 s bridge limit is in the text, but a broken server wouldn't be.
- **Thresholds 0.6 / 0.5 are authored guesses.**

## Files

- `catalog.json` (v1 fields), `catalog_records.json` (v2 records)
- `define.json` (v1), `define_v2.json` (installed)
- `tasks.json`, `run-eval.ts`
- `results.json`, `results_v1_rerun.json`, `results_v2.json`
