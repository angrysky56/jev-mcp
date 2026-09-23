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

- **wisdom-engine fills Jev's known gap.** Jev can't come up with rival explanations. `wisdom-engine.generate_hypotheses` does, and `apply_via_negativa` eliminates them. So claim_router's `test_rivals` route can become: wisdom-engine generates rivals, then `evidence_stance` judges them against the observations. Tried later the same day; see the live check below.
- **LocalREPL runs on Ty's real machine**, unlike the sandboxed device shell. Anything needing the GPU, Ollama or Neo4j goes there.

## Live check after restart

- **Calling it from Cowork works.** A call with `records` and `summaryOnly` succeeded, even though Cowork's cached tool list still shows the old `run_capability` schema.
- **The task:** wire wisdom-engine into claim_router's `test_rivals` route. It routed graph-of-thought and wisdom-engine to `use`, and jev to `consider`.
- **The recommended server failed on its first call.** `wisdom-engine.generate_hypotheses` returned an error: its LLM fallback reached Ollama asking for `gemma4:12b`, and Ollama answered 404, which likely means that model isn't installed. It failed loudly by design. This is the "descriptions, not health" limit in practice: the router can recommend a server that is currently broken.
- **Fixed, then retried (same day).** Ollama was asked for `gemma4:12b`, which isn't installed. `OLLAMA_MODEL` now names `aura-ornith:35b`, and an unknown model name now gives a clear error listing what is installed. With 3 prompts in parallel, the 35B local model timed out at 120 s. Ty then added an OpenRouter key, and `generate_hypotheses` now answers through `deepseek/deepseek-v4.1-flash` inside the 60 s bridge limit (2 of 2 calls).
- **Rival-generation test on claim E4** ("the host didn't pass the key; nothing else could explain it"). wisdom-engine gave 3 hypotheses, then `evidence_stance` v2 judged them (run `4ae2d67a`):

  | Hypothesis (short) | Really a rival? (my label) | Jev stance | Jev rival_explanation |
  | --- | --- | --- | --- |
  | GUI launch never read ~/.bashrc | No, it restates the claim | supports 0.76 | 0.61 |
  | "Blame story" that hides a key-name mismatch | Partly: names the mismatch | contradicts 0.97 | 0.92 |
  | ~/.bashrc invisible **and** the server needed TYPESAFE_API_KEY | Partly: adds the mismatch | supports 0.68 | 0.77 |

  - In both calls (n = 2), all 3 "competing" hypotheses reused the claim's own mechanism, and only the key-name mismatch was a distinct rival. Neither the misspelled-variable rival I listed by hand earlier nor a `.env` that was never loaded appeared. So wisdom-engine's three perspectives vary the framing more than the cause.
  - Jev again gave a restatement of the claim a middling rival score (0.61). It still can't tell "same cause, reworded" from "different cause", so a person or a second tool has to make that call.
  - **`apply_via_negativa` timed out** at the 60 s bridge limit (1 of 1 call; it runs several LLM stages in a row). It can't be used from Cowork as is.
- **What this means for `test_rivals`:** usable as "wisdom-engine drafts rivals, Claude adds the ones it missed and removes restatements, then `evidence_stance` sorts them". wisdom-engine alone is not a full rival search.

## Portable version (2026-09-23)

jev-mcp has to work for people who don't have Ty's servers, so `tool_router` now ships as a starter (`starters/capabilities.json`) that no longer assumes a fixed setup.

**What changed:**

- The description no longer refers to Ty's servers.
- The comparison baseline used to be fixed wording ("a sandbox shell, file editing in connected folders, and web search"). It now comes from `context.baseline`. If no baseline is given, Jev compares against an assistant that can only write text.

**Re-run on the same 14 tasks and the same catalog** (`catalog_records_e875cfb.json`, the version committed before the wisdom-engine entry changed). One run of each; results are in `results_portable_*.json`.

| Arm | Top-1 | T12 clean | Unneeded `use` routes | Failed items |
| --- | --- | --- | --- | --- |
| Earlier v2, fixed baseline | 13/14 | yes | 0 | 0 |
| Portable, `baseline` = the old wording | 13/14 | yes | 0 | 0 |
| Portable, no baseline | 12/14 | yes | 2 (browser on T9, local_repl on T13) | 3 of 280 (HTTP 529, provider overloaded, after one retry) |

- **Giving the old wording as `context.baseline` reproduced the earlier result.** One run, so this shows no sign of a regression, not proof of none.
- **Without a baseline:**
  - T5's miss comes from a failed item: Context7 got no answer, so it could not rank first.
  - The two unneeded `use` routes fit the expectation that a weaker baseline makes more servers look helpful. One run can't show that.
- **Clean-copy check.** A copy of the repo with no `.env`, `.jev` or `node_modules`, plus the key copied in:
  - `npm ci`, typecheck and 42/42 tests pass.
  - `mcp:configure` works. Running `mcp:bootstrap` added all five starters, and running it again reported them "already current".
  - The 6-server example catalog routed a GitHub pull-request task to `github` only (1 task).
  - `claim_router` routed "never leaks memory; ran it ten minutes" to `search_first` (1 claim).

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
