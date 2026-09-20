# Skills as connected, reusable methods

September 19, 2026 in Denver; September 20 UTC.

## Proposal

Treat a skill as a collection of related methods with context, rather than a single retrieval destination. A useful unit may be a procedure, question, evidence standard, design principle, or check. Keep the skill itself intact and add a view of its useful parts.

Two kinds of indexing matter: **what a skill is about** and **what a passage helps accomplish**. The second can connect a software debugging technique to a ceramics investigation, or software decision logs to a committee's institutional memory. A title-only shortlist can hide these connections before Jev ever sees them.

The richer result is a task-specific workflow with source references, explicit assumptions, intermediate outputs, checks, and conditional branches. Each step should explain what it contributes and why its source method transfers. The host develops that explanation; Jev supplies narrow suitability judgments. Code manages dependencies and state. No new generative API is needed.

## A worked example

Task: investigate patchy ceramic glaze using existing firing notes and photographs, without running another firing yet.

| Step | Borrowed method | Task-specific use | Output |
| --- | --- | --- | --- |
| Organize observations | Research synthesis: distinguish observations from interpretations | Separate shelf positions and visible defects from potters' explanations | Evidence table linked to notes/photos |
| Develop alternatives | Debugging: specific, falsifiable hypotheses | Write competing explanations with observations that would support or weaken each | Hypothesis set |
| Design a distinguishing test | Debugging: prediction, setup, measurement, criteria | Describe a future comparison that separates the alternatives | Test protocol; no result claimed |
| Reconsider after evidence arrives | Debugging: recovery after disconfirmation | Revisit an explanation only if a later observed result contradicts it | Conditional future branch |

The final row illustrates why a workflow is richer than a list of recommended passages. That method can be worth remembering while remaining unavailable at the current step. Connect it to the earlier continuity design: the future result becomes its return condition.

Other promising transfers in this probe:

- **Thin vertical software slices → opening a volunteer tool library:** pilot one complete loan-and-return path, with an observable completion check.
- **Software observability → committee memory:** record the decision, reason, and information used, rather than a diary of activity.
- **User-research synthesis → oral history:** organize themes while preserving speakers, differences, and the distinction between recollection and established events.

These are methods to adapt, not authority to import every instruction or conclusion from another domain.

## What a method record needs

Keep the exact passage, parent skill, section, source version, and relevant surrounding conditions. Add proposed inputs and outputs, prerequisites, scope of use, completion evidence, and known limitations. An adaptation should retain both its source wording and the host's domain mapping so a reviewer can see what changed.

Use several kinds of relationship: needs the output of, checks, offers an alternative to, contradicts an assumption of, and becomes relevant after. A fixed sequence is only one possible view of this structure. A user should see the immediate workflow and unresolved branches, with details available on demand.

Do not make the original skills disappear into fragments. Some procedures only work as a whole. Before operational use, consult the full applicable source and its references; a short extracted passage cannot establish that all constraints have survived. Version changes should invalidate affected derived records.

## Prototype and experiment

The self-contained prototype imports eight real passages from five installed skills. Six full source files are retained locally, including the debugging reference. Imports were read as experiment data, not invoked as operational skills. Their input/output contracts and context annotations were authored by the host, not discovered automatically.

Jev receives source passages and parent boundaries, plus the task and context. It classifies each passage as directly useful, useful after domain adaptation, not useful, or needing more context. Multiple passages can match, and all can be rejected. Gold labels and the planner's hand-authored contracts are withheld from model state.

There are nine synthetic tasks, each tested in original and reversed candidate/answer order. Inputs, labels, requests, and code were saved before inference. This is an exploratory same-author probe, without a held-out evaluation, retrieval baseline, or downstream task-completion test.

**18 calls through OpenRouter cost $0.003142272**, with no provider or validation errors. The returned model was `typesafe/jev-1.13-20260917`.

- All 22 predeclared required passage occurrences were selected across the two variants.
- All six no-match trials returned no useful passages: translation, JSON formatting, and a request for command documentation absent from the catalog.
- Only **12 of 18** trials met the complete predeclared inclusion/exclusion criterion. In six trials, Jev also selected the recovery-after-disconfirmation passage although no disconfirming result had occurred. Code excluded it from the proposed path because its prerequisite was missing.
- Additional, unlabelled recommendations varied with order and were sometimes broad. The required/forbidden labels do not establish precision for every selected passage.
- The evidence-free investigation remained incomplete in code. A suggested method did not invent its inputs.

The six failures expose an ambiguity in the experiment as well as a design issue: the prompt permits methods for a possible future workflow, while the recovery exclusion expects present applicability. These results do not show that Jev falsely asserted an experiment occurred. They argue for separating **potential usefulness**, **present readiness**, and **conditional future usefulness**, rather than forcing all three into a fit label.

### The composition correction

The original shortest-path composer reached one primary output. That left out a requested verification plan for the library pilot and a separate evidence table for oral history. This was a host-authored contract problem, not something Jev could fix: it selected the relevant passages, but code had not required their outputs.

The composer now supports multiple required outputs. A separately recorded, post-hoc audit reuses the original judgments with those obligations added. It returns pilot + verification, and evidence separation + themes, in both variants. Original results remain intact. Predicted outputs are always labelled `wouldProvide`; `observedArtifacts` never grows merely because a plan was assembled.

This matters for the user's holistic concept: a workflow must preserve the task's evidence and checking obligations, not simply minimize its number of steps.

## A practical architecture

1. **Read and index once:** retain original skills; extract candidate passages with source spans, parent boundaries, and proposed roles. Host-authored interpretations remain labelled interpretations.
2. **Retrieve from two directions:** use topic search and purpose/mechanism search so distant domains remain reachable. At scale, compare ordinary lexical and embedding retrieval before adding inference everywhere.
3. **Judge the candidates:** Jev assesses concrete usefulness and whether a proposed transfer preserves the important conditions. Keep no-match and uncertain results available.
4. **Compose the task:** the host proposes the domain mapping and desired outputs. Code checks declared inputs, dependencies, all required outcomes, and incompatible assumptions. Jev can assess uncertain semantic connections in a later request; that connection-checking stage remains untested.
5. **Present a coherent workflow:** explain steps, expected artifacts, checks, and conditional branches. Display missing input as a gap, not an invented bridge.
6. **Learn from execution:** record which methods were tried, adaptations, observed outcomes, and failure conditions. Reuse a successful combination as a provisional recipe with evidence and scope. Repeated self-ratings alone do not establish that a recipe works.

An MCP operation such as `compose_methods` could return that workflow and its evidence trail. A companion operation could record outcomes for later retrieval. The current prototype does not implement an MCP server, execute skills, automatically extract a whole library, or install host integration.

## Reproduction and evidence

- [Frozen source passages](../studies/skill-methods/catalog.json)
- [Source import provenance](../studies/skill-methods/provenance.json)
- [Live study summary](../studies/skill-methods/runs/2026-09-20T04-45-22.406Z/summary.json)
- [Original requests, raw responses, and workflow proposals](../studies/skill-methods/runs/2026-09-20T04-45-22.406Z/events.jsonl)
- [Post-hoc composition audit](../studies/skill-methods/composition-audit.json)

Run `npm run methods` for a dry run or `npm run methods -- --live` to use the inherited OpenRouter key. No source project paths are required after import. No new dependencies were installed.

```sh
npm run check
npm test
node scripts/probe-skill-methods.ts --verify studies/skill-methods/runs/2026-09-20T04-45-22.406Z
node scripts/audit-method-composition.ts --verify studies/skill-methods/runs/2026-09-20T04-45-22.406Z
```

The verifiers check source spans, hashes, reconstructed requests, validated saved responses, scores, and workflow output without network calls.

TypeSafe's [skill-suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion) provides a starting point for whole-skill retrieval. This experiment extends the question to source passages and composition; the cookbook does not demonstrate these new behaviors. [Choice](https://docs.typesafe.ai/primitives/choice) supplies the per-passage categories. [Composite scoring](https://docs.typesafe.ai/patterns/composite-scoring) motivates keeping separate judgments available for code to combine.
