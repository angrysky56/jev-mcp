# A Jev runtime for making capabilities

September 20, 2026.

The repository now includes a working local MCP server. A connected agent can author questions, combine stages, save a capability, evaluate examples, apply it to records, and retain revisions with their evidence. This is the reusable substrate behind the earlier memory and skill-method experiments.

The capability library can grow without adding server tools or editing the TypeSafe skill. The agent remains responsible for forming useful questions and checking outcomes. Jev supplies typed judgments; ordinary code supplies arithmetic, filtering, ranking, dependencies, persistence, and execution of the host's other tools.

## What is implemented

| Operation | Use |
| --- | --- |
| `jev_judge` | Try an authored Noul, Choice, or Score over JSON data |
| `define_capability` | Save a reusable workflow; changed definitions create immutable versions |
| `get_capability` | Read a version and recent run/evaluation evidence |
| `list_capabilities` | Discover saved definitions with pagination |
| `run_capability` | Process a batch, conditionally run stages, filter and rank items |
| `evaluate_capability` | Compare fresh judgments with caller-authored expected answers |
| `store_records` | Retain source-linked records and their version history |
| `search_records` | Retrieve active records within a scope using SQLite FTS5 |
| `get_run` | Inspect pinned inputs, results, costs, cache provenance, and failures |
| `record_outcome` | Attach attributed downstream observations to the exact run |

Read the MCP resource `jev://guide` for the complete authoring contract. `jev://status` reports provider/model and whether a key is configured, without revealing it. A [project-owned skill](../skills/jev-capabilities/SKILL.md) teaches agents to consult and improve the live registry rather than depend on a static list of uses.

## How a new capability is made

For example, an agent can ask whether a passage addresses a missing prerequisite. It writes that question as a Noul, gives it positive and negative examples, and measures where it fails. It can then combine that predicate with a relevance score, a classification of source status, or a later question that consumes the first result.

All stage state has the form `{item, context, prior}`. Independent questions share a stage. A later stage sees earlier typed answers under `prior.STAGE.QUESTION`. Conditions can compare Choice labels or numeric Noul/Score values. Missing, skipped, or failed answers do not pass a condition. Final selection can require several conditions, and a numeric answer can rank the selected records.

This is scripting with a semantic component. Arbitrary loops and computation run through the host's normal tools or an MCP client script. The server's saved workflow language has bounded stages and comparisons; it does not introduce another arbitrary-code execution service. New definitions do not dynamically add MCP tool names: `run_capability` is their stable entry point.

The starter library contains:

- `source_relevance`: relevance filtering and ranking for supplied passages.
- `evidence_status`: classification of reported completion, non-completion, and uncertainty. Version 2 addresses ambiguous references found during evaluation.
- `method_readiness`: potential usefulness followed by a separate check of current prerequisites.

## Search, RAG, and databases

The current database is local SQLite, using Node's built-in database API and FTS5 retrieval. No database service or embedding model is installed. It holds definitions, record versions, runs, per-stage events, short-lived request cache entries, and reported outcomes. The active database lives in `.jev/jev.sqlite` by default and is excluded from Git.

The retrieval loop is: obtain documents with a host search tool → preserve text and source → retrieve candidate records → apply an authored Jev relevance/coverage capability → let the host compose and check an answer. Qdrant or Chroma results can enter as ordinary item data. This is JSON interoperability, **not a native database adapter or embedding integration**. Use a stable identifier such as `point_123` as the run item ID, retaining an external database's original ID inside `data` when needed.

The live probe used notes paraphrased from official documentation, plus an actual irrelevant web-search result about Python packaging. The notes explicitly identify themselves as host-written paraphrases. Jev selected the Noul documentation for a question about authoring a yes/no predicate and rejected the packaging result. The test does not measure open-web search recall, full RAG answer quality, or improvement over a strong retrieval baseline.

## What grew during this build

The first end-to-end run passed **8/10 scripted scenarios**. The two failures reflected one ambiguous example: the completion classifier read “that thing is sorted” as reported completion despite an unresolved reference.

The agent used the MCP to read that definition, save a new version requiring an identifiable action/result, and evaluate both versions on six additional examples. The original passed **5/6**, the revision **6/6**. The revision also passed the original **3/3** classification examples. Definitions and new cases were frozen before the comparison; this remains a small, same-author test rather than independent validation. The original failure is preserved.

That is the concrete capability-building loop: author → run → inspect failure → revise → compare → retain both versions and evidence. Saving does not automatically promote a capability to “validated.” Outcome reports also remain attributed reports.

The complete integration suite was rerun with the refined definition and passed **10/10 scripted scenarios**. This is regression verification after the revision, not a new independent sample.

The initial study and comparison used **31 live Jev calls costing $0.000597492**, as reported by OpenRouter. Bootstrapping the project library repeated the six revised cases successfully for **$0.000118314**. The final suite used **16 calls costing $0.000327726**. Together that is **53 calls and $0.001043532 in reported Jev cost**, excluding the connected agent's own work. These costs are observations from these runs, not a future price guarantee.

## Running and connecting

```sh
npm ci
npm run mcp:configure
npm run mcp:bootstrap
node scripts/mcp-call.ts list_capabilities
node scripts/mcp-call.ts jev_judge examples/adhoc-noul.json
node scripts/mcp-call.ts run_capability examples/method-readiness-run.json
```

The final two commands make live Jev calls. `mcp:bootstrap` only saves starter definitions unless `-- --live` is supplied. It preserves independently edited definitions. `mcp:configure` writes missing project configuration and leaves existing files untouched.

The MCP host launches `node src/server.ts` directly; stdout is reserved for the protocol. Codex project configuration is in `.codex/config.toml`, including an `env_vars` allowlist that forwards the provider keys by name. `codex mcp get jev` confirms that Codex reads the enabled project entry. The current host session may need its MCP connections reloaded before the tools appear directly in its tool list. No key values are stored in configuration.

Other hosts can use `.mcp.json` and must configure their own environment forwarding. Merely exporting a variable somewhere else does not update an already running host. MCP Inspector 2.1.0 did not forward the provider key by default; the live SDK scripts explicitly forward the inherited environment.

Environment: the server reads these from its own process environment, falling back to a project-root `.env`
for any that are unset. Exported variables always take precedence.


- `OPENROUTER_API_KEY`: default provider credential.
- `JEV_PROVIDER=typesafe` and `TYPESAFE_API_KEY`: opt into the direct TypeSafe API.
- `JEV_MODEL`: optional Jev identifier override; the default OpenRouter model is `typesafe/jev-1.13` on `/api/alpha/decisions`.
- `JEV_DATA_DIR`: optional data directory override.

The runtime calls no OpenAI or Anthropic model API. MCP SDK packages are protocol libraries, not model integrations.

## Limits and verification

Limits are 20 items per batch, four stages per capability, 16 questions per stage, and 32 potential model calls per run by default, explicitly raisable to 64. Four model calls can be active across the server. Each has a 20-second timeout and at most one transient HTTP retry. There is a 250 KB batch limit and 40 KB provider-request limit. These are prototype bounds, not model capability claims.

Cache reuse is opt-in for identical provider/model/state/questions and expires after one hour. Cache hits report no new token cost and retain their original response provenance. Evaluation always requests fresh judgments. Failures and cancellations are recorded; the server does not turn them into negative semantic labels. SQLite retains old record contents; search returns active current records. Historical source versions remain in the database history, while run snapshots preserve the exact records used.

```sh
npm run check
npm test
npm run verify:runtime
npm run verify:continuity
npm run verify:study
```

MCP Inspector exercised all ten tools with an isolated deterministic provider fixture. Separate real stdio clients exercised live Jev calls, persistence across restarts, version pinning, conditional execution, evaluation, cache reuse, and error recovery. The ten scenarios in [evals.xml](../evals.xml) are scripted acceptance checks authored by the connected agent; they do not measure a separate model discovering the tools unaided.

Evidence:

- [Initial live MCP run](../studies/runtime/runs/2026-09-20T08-12-22.412Z/summary.json)
- [Capability revision comparison](../studies/runtime/refinements/2026-09-20T08-14-24.025Z/summary.json)
- [Final live MCP regression run](../studies/runtime/runs/2026-09-20T08-21-05.603Z/summary.json)
- [MCP scenario driver](../scripts/evaluate-mcp.ts)
- [Offline evidence verifier](../scripts/verify-runtime.ts)

Official references checked during implementation: [MCP TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk), [MCP tools and structured output](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md), [TypeSafe Noul](https://docs.typesafe.ai/primitives/noul), [TypeSafe reranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe), and [Node SQLite](https://nodejs.org/api/sqlite.html). The implementation uses MCP server/client 2.0.0 and Zod 4.6.5, with versions pinned in the lockfile.
