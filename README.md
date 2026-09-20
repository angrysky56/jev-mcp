# Jev MCP and inquiry laboratory

A working TypeScript MCP runtime for creating, testing, composing, and retaining Jev-powered capabilities, alongside reproducible inquiry experiments.

**Start with the [programmable MCP guide and results](docs/jev-programmable-mcp.md).** The server provides custom typed judgments, versioned capability definitions, conditional batch workflows, evaluations, and a local SQLite record store. The [original experiment findings](docs/jev-inquiry-experiments.md) retain earlier successes and failures.

The newer [continuity, planning, and operational self-model study](docs/jev-continuity-and-agency.md) adds prospective reminders, bounded memory selection, method retrieval, and a real Git worktree probe. It includes a stronger baseline audit alongside the Jev results.

[Skills as connected methods](docs/jev-skills-as-methods.md) explores reusing actual skill passages across domains and composing them into workflows. Its live probe includes no-match cases, premature method suggestions, and a correction for omitted workflow checks.

The connected agent supplies ideas, explanations, and host-side scripts. The server calls only Jev, through OpenRouter or TypeSafe. SQLite runs locally; no database service, generative model API, or other local project is required. Native Qdrant/Chroma adapters and embeddings are not implemented; their records can be supplied through the shared JSON batch interface.

## Run locally

Requires Node **24.12 or newer**; verified on 24.20. Node runs TypeScript directly. Runtime dependencies are the official MCP server SDK and Zod, with built-in Node SQLite. Install dependencies and check the project with:

```sh
npm ci
npm run check
npm test
npm run validate
npm run verify:study
npm run verify:continuity
npm run verify:runtime
```

Prepare the local capability library and project MCP configuration:

```sh
npm run mcp:configure
npm run mcp:bootstrap
node scripts/mcp-call.ts list_capabilities
```

The MCP server reads the provider key from its own environment first. Because a host may launch it with only a minimal environment, it then loads any `.env` in the project root to fill what is missing; real environment variables are never overwritten, and a missing or unreadable file is ignored. Codex reads `.codex/config.toml`, which forwards provider keys by environment-variable name. Other hosts can use `.mcp.json` with equivalent key forwarding. Reload the host's MCP connections to expose the tools directly. The server is also callable immediately through `scripts/mcp-call.ts`; see the guide for live examples. Runtime data is stored in `.jev/jev.sqlite` and ignored by Git.

`verify:study` reads the saved study and verifies requests, responses, labels, reports, source archives, and the revision's timing. It makes no network calls. The original source files used for each recorded run are preserved in that run's `source-snapshot.json`; later harness improvements do not replace them.

## Preview or run an experiment

The default is a **dry run**: it writes frozen inputs and request previews, with no API call. Every run gets a new directory.

```sh
npm run experiment
```

To run inference, export the chosen provider's key in the **same environment that launches Node**. An export in another terminal does not update an already running application. Never put the key in a command argument, source file, report, or chat. The harness does not automatically load `.env` files; only the MCP server does, as a fallback for hosts that supply a minimal environment. A key exported from `~/.bashrc` or `~/.zshrc` exists only in interactive shells and never reaches a desktop host, so copy `.env.example` to `.env` for that case.

```sh
# Uses the exported OPENROUTER_API_KEY.
npm run experiment -- --live --provider openrouter --split development --rubric v1 --variants canonical,paraphrase,reversed

# Alternatively uses the exported TYPESAFE_API_KEY.
npm run experiment -- --live --provider typesafe --split development --rubric v1

# Repeat the frozen evaluation study without changing its labels or rubrics.
npm run experiment -- --live --provider openrouter --split evaluation --rubric v2 --model typesafe/jev-1.13 --variants canonical,paraphrase,reversed
```

OpenRouter defaults to `~typesafe/jev-latest` on `/api/alpha/decisions`. TypeSafe defaults to `jev-latest` on `/v1/systemone`. Both track the newest published version, so a model update needs no change here. OpenRouter's leading `~` is its latest-resolution alias notation; the same slug without the tilde does not exist and returns `400`. The response reports the concrete slug that served the request, and the runner records it in every event, so drift is visible afterwards. A floating alias is unsuitable for regression testing: set `JEV_MODEL` to a concrete slug such as `typesafe/jev-1.13` for any run whose results must stay comparable. `--model` accepts Jev identifiers only. These beta provider identifiers may change; inspect current official documentation before changing them. There is no automatic provider fallback.

Each run has at most 108 planned requests, 40 KB per request, a 20-second request timeout, and at most one retry for selected transient HTTP errors. Long retry instructions are returned as failures rather than retried early. Authentication, payment, permission, and missing-model errors stop the run. Live failures produce a nonzero CLI exit code and a readable partial report.

## Inspect a result

Each `runs/<run-id>/` directory contains:

- `manifest.json`: frozen cases, labels, baselines, rubric, model request, and hashes, saved before inference.
- `requests.json`: exact request previews, without answer keys or baseline predictions.
- `events.jsonl`: one completed-call record per line, with exact request, fingerprint, validated answers, redacted raw response, time, attempts, and any error.
- `source-checks.json`: deterministic shared-source and quoted-text checks.
- `source-snapshot.json`: the source text matching that run's source hashes.
- `summary.json` and `report.md`: recomputable counts, latency, usage, failures, and limitations.

Replay any report without inference:

```sh
npm run report -- runs/2026-09-19T20-54-49.864Z-v2-evaluation-5d425d2a
```

Scores are observations to inspect, not permissions or proofs. The primary evaluation accepts all predeclared equally valid choices. It reports malformed answers and service failures separately. Auxiliary Noul/Score results have not been independently calibrated.

## Study protocol and extension

There are 12 synthetic cases per direction: six for development and six reserved from rubric revision. Labels were fixed before inference. Original, paraphrased, and reversed-order requests test sensitivity. For next-question cases the reversed variant reverses candidate order in state; for the fixed-label tasks it reverses answer-option order. It is not a full factorial order study.

Both baseline conditions were authored by the same connected agent that wrote the fixtures, before Jev was called. They are illustrative controls, not a blinded experiment. Export case-only inputs for a future independent connected-agent review with:

```sh
npm run prompts -- --split evaluation --condition unaided
npm run prompts -- --split evaluation --condition checklist
```

The original `v1` and one revised `v2` rubric are frozen. `experiments/revision.json` records the development failures, rationale, input hashes, and freeze time. `scripts/freeze-revision.ts` documents and reproduces that specific one-time revision in a fresh copy; it intentionally refuses to overwrite existing files. Evaluation runs reject changed rubrics, cases, labels, or baseline answers, and for the same reason they reject a floating model alias: `--model` must name a concrete slug, so a later model release cannot silently change what the frozen comparison measured. Development runs stay on the alias. New questions or further revisions should be a new study with new reserved cases, preserving this one.

Original concept notes remain in `docs`. The current ten-tool MCP surface is documented in the programmable MCP guide; the earlier design documents remain historical proposals.

## Official references

- [TypeSafe HTTP API](https://docs.typesafe.ai/api)
- [OpenRouter Decisions API schema](https://openrouter.ai/openapi.json)
- [TypeSafe citation checks](https://docs.typesafe.ai/cookbooks/citation_check)
- [TypeSafe feature discovery](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery)
- [Jev's documented failure modes](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- [Node's built-in TypeScript support](https://nodejs.org/api/typescript.html)
