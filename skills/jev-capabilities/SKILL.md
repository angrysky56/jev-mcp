---
name: jev-capabilities
description: Create, test, compose, and revise Jev-powered capabilities through the project's MCP runtime. Consult the live capability library and recorded evidence instead of treating this skill as a fixed catalog of uses.
---

# Build capabilities with Jev

Read `jev://guide`, then `list_capabilities` and `get_capability` for related definitions and recent evidence. The capability registry is the evolving knowledge source. This document explains how to use it; it does not enumerate everything Jev can do.

For a new task:

1. Identify which parts need semantic judgment and which parts ordinary code can handle.
2. Author a narrow Choice, Score, or Noul question. Explicitly identify `item`, `context`, and any `prior` answer it uses.
3. Try it with `jev_judge`, including a no-match or missing-evidence example.
4. Save the useful definition through `define_capability`. Conditional stages can consume earlier results; independent questions share a stage.
5. Write expected labels before calling `evaluate_capability`. Keep negatives, uncertain cases, and counterexamples. Passing your own examples is limited evidence.
6. Apply a pinned version through `run_capability`, optionally combining host web search, database retrieval, and ordinary transformations in a script.
7. Inspect `get_run` and record observed downstream outcomes with sources. When a failure suggests a better question, save a new version and compare both on additional examples. Preserve the original failure.

Jev supplies typed judgments; the connected agent supplies language and inventions. A custom Noul is an authored yes/no predicate using the existing primitive, not a newly trained model. Saving a workflow does not dynamically register a new MCP tool name.

Keep original records, source roles, and version references. Distinguish possible usefulness from readiness now, and reported completion from a verified result. Explicitly represent missing prerequisites. Do not let a relevance score substitute for a fact check.

The current server supports SQLite full-text retrieval and supplied JSON records. Host tools can provide Qdrant/Chroma/web results; embeddings and native vector-store connectors are not part of this version.

## Implementation notes from this build

The verified stack is Node 24.20, MCP server/client SDK 2.0.0, and Zod 4.6.5. Check current official docs before upgrades. SDK v2 tool cancellation lives at `ctx.mcpReq.signal`, not the older top-level `signal`. A generic tool-registration wrapper needs explicit `StandardSchemaWithJSON` type parameters to resolve its conditional callback overload; see `src/mcp-server.ts` rather than guessing or suppressing type checking.

Use `scripts/mcp-call.ts` for host-side scripting. Keep credentials in the launch environment. Stdout belongs to MCP; diagnostics go to stderr. Use `npm test`, `npm run verify:runtime`, and MCP Inspector after runtime changes. The cached Inspector used for this build was 2.1.0; its CLI accepted the server command before `--method` flags. Do not hardcode an installed cache path into runtime code.
