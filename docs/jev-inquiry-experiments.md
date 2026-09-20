# Jev inquiry experiments — September 19, 2026

## Finding

The most promising next prototype combines **evidence tracking and choosing useful observations**, with a separate check for responses that make a belief impossible to challenge. Keep rubric improvement as an explicit experimental process.

Jev was fast and inexpensive on these short cases. It also made mistakes that matter for the proposed use cases: confusing lack of evidence with counterevidence, and confusing multiple good choices with no good choice. This study supports a bounded inquiry assistant; it does not validate an autonomous truth judge, ethical authority, or general value function.

## What actually ran

The connected agent authored 36 synthetic cases, expected labels, and two baseline passes before inference. Each direction has six development and six reserved evaluation cases. The baseline author also wrote the cases, so the comparison is **not blind or independent**. Both baseline passes matched all predeclared labels; no advantage over those controls was demonstrated.

Five live runs used OpenRouter's dedicated Decisions API, requesting `typesafe/jev-1.13`. Every response identified `typesafe/jev-1.13-20260917` and provider `TypeSafe`:

| Run | Requests | Purpose |
| --- | ---: | --- |
| [Initial v1 development](../runs/2026-09-19T20-52-31.424Z-v1-development-2d749cdb/report.md) | 18 | Check the initial rubrics and transport |
| [v1 development with variants](../runs/2026-09-19T20-52-51.239Z-v1-development-528f8b85/report.md) | 54 | Check original wording, paraphrase, and reversed order |
| [v2 development with variants](../runs/2026-09-19T20-54-10.104Z-v2-development-bf154c2d/report.md) | 54 | Test one revision based on development failures |
| [v1 reserved evaluation](../runs/2026-09-19T20-54-39.362Z-v1-evaluation-142f5654/report.md) | 54 | Measure the original rubric on reserved cases |
| [v2 reserved evaluation](../runs/2026-09-19T20-54-49.864Z-v2-evaluation-5d425d2a/report.md) | 54 | Measure the already-frozen revision on the same cases |

All **234 requests** returned valid typed responses, with no service failures or retries. Provider-reported total cost was **$0.00732543**, using **174,415 input tokens**. Median complete request latency was **174 ms**. These are measurements of this small run, not a service guarantee or host-agent workflow benchmark. TypeSafe direct transport passed mock contract tests; its key was unavailable in this environment, so it was not tested live.

## Comparison

“Canonical” means the original question wording. “All variants” includes that wording, a paraphrase, and reversed order; those are repeated views of six cases, not 18 independent examples.

| Direction | v1 development, canonical | v1 evaluation, canonical | v2 evaluation, canonical | v1 → v2 evaluation, all variants |
| --- | ---: | ---: | ---: | ---: |
| Effect of evidence on a belief | 6/6 | 5/6 | 5/6 | 15/18 → 16/18 |
| Choosing an informative next observation | 6/6 | 5/6 | 5/6 | 16/18 → 16/18 |
| Whether a response permits belief revision | 5/6 | 4/6 | 6/6 | 12/18 → 18/18 |

Only the third rubric changed. The extra matched belief answer in the v2 run came from an **identical repeated prompt**, so it is run-to-run variation, not an effect of the revision. No rubric changed after evaluation began.

### 1. Beliefs: distinguish support, contradiction, and absence of evidence

Jev handled independent replication, a counterexample to a universal claim, irrelevant observations, and a chain of agent summaries that all traced to the same speculation. This makes a useful candidate for tracking how an inquiry's evidence changes.

The failure is instructive. Case **b12** provides a glowing tile, no chemical analysis, and promotional text commanding the evaluator to call a mineral explanation confirmed. The expected label was **unchanged**: the assertion supplies no new evidence. Jev instead selected **weakens** in both canonical and paraphrased versions, under both runs. Reversing the labels yielded the expected answer. Its auxiliary new-evidence judgment was a separate signal, not a guarantee that the primary conclusion followed.

Case **b11** also varied: an ambiguous “that one passed” message changed from insufficient information to unchanged under one paraphrase, then returned to insufficient on the repeated identical request.

**Interpretation:** track evidence relevance, source independence, source credibility, and claim support separately. A misleading source can lose credibility without disproving the world-level claim. Exact source matching belongs in code; semantic support still needs scrutiny. This is a proposed next-study refinement, not a retrospectively repaired score.

### 2. Next questions: distinguish several good options from none

Jev selected observations that separated hypotheses, respected stated constraints, rejected unavailable equipment, and retained an unconventional hypothesis when a suitable test existed.

Case **q10** exposed a different failure. Two equally available indicators each fully distinguish the two hypotheses. Both **A and B** were accepted in the frozen answer key. Jev selected **insufficient** in the canonical and paraphrased versions under both runs. With candidates reversed in state, it selected an acceptable test.

**Interpretation:** an inquiry tool should be able to return several acceptable tests. A future experiment should first assess candidates individually for informativeness and feasibility, then let code retain an acceptable set and choose among ties. The existing auxiliary candidate judgments provide material for investigating that composition, but this study did not evaluate an automatic selection policy built from them.

### 3. Rubric improvement: a small change transferred to reserved examples

The v1 rubric treated “Interesting. We should look into that” in case **a04** as evidence-responsive, despite no revision or stated observation that could weaken the belief. All three variants missed it. In the reversed version the incorrect answer had confidence **0.75**; confidence alone did not settle correctness.

The connected agent made one revision: require an actual belief update or a concrete test with a stated losing outcome; distinguish general curiosity and undefined criteria from both responsiveness and explicit immunity to evidence. Existing belief and question rubrics were preserved because their development labels showed no error.

The revision fixed a04 in development and transferred to two reserved examples:

- **a10:** an undefined claim about “harmony” had been called self-sealing. The revised rubric identified insufficient information.
- **a12:** an untested coating hypothesis had been called responsive merely because it was tentative. The revised rubric identified insufficient information.

Results improved from **4/6 to 6/6** canonical evaluation judgments, and **12/18 to 18/18** across variants. Other cases retained genuinely testable auxiliary explanations and recognized claims that made every possible outcome confirming.

**Interpretation:** one explicit criterion revision improved this narrow task. It does not establish general framework evolution, online learning, model retraining, or a Baldwin-effect mechanism. TypeSafe's [feature-discovery cookbook](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery) supplies a related pattern for a larger future study with external labels and repeated held-out evaluation.

## Proposed changes to the original concepts

The original notes are preserved. These refinements belong in the next design discussion:

| Original direction | Refinement supported by this experiment or required by its limits |
| --- | --- |
| Jev as an external value function | Use named, inspectable judgments at specific inquiry steps. The experiment measured neither long-term reward nor overall reasoning quality. |
| Anti-hallucination by comparing output with known data | Separate unsupported, contradicted, uninterpretable, and circularly sourced claims. Novelty alone is not a hallucination test. |
| Prune to the best branch | Return an acceptable set, preserving ties and useful counter-hypotheses. “No clear winner” and “no acceptable option” are different. |
| Markovian carryover | Keep compact state linked to original evidence, unresolved claims, and contrary observations. Sufficiency of compressed state remains untested. |
| Adaptive framework/Baldwin analogy | Retain a two-speed process: update inquiry state from observations, and revise evaluation rules in separately compared versions. |
| Ethical scoring | Express concrete constraints separately. This study tested simple stated restrictions, not moral judgment, stakeholder impact, or alignment. |
| Principal-researcher optimality | Specify what can be measured in a bounded task. Nothing here establishes globally optimal conceptual reasoning. |

## Recommended next experiment

Combine the first two directions into a small **“what would change our mind?”** workflow: the connected agent supplies competing explanations, source-linked evidence, and possible observations; the evaluator identifies relevant support and returns useful feasible tests, including multiple acceptable options. Use the revised response check to flag places where the inquiry no longer allows disconfirmation.

Before defining public MCP tools, use real completed inquiries and an independent reviewer. Include conflicting credible sources, longer state, uncertain feasibility, several good tests, and surprising ideas whose evidence is initially thin. Measure whether the host actually chooses a better next observation or preserves an important counterexample. Keep the revised rubric as a candidate, not a production policy.

The implementation is deliberately a reproducible laboratory. It leaves public MCP API design open, and makes no automatic actions or framework changes.

## Reproduce and inspect

Run `npm run check`, `npm test`, and `npm run verify:study` from the project root. The last command recomputes all saved results without inference, verifies source snapshots and request fingerprints, checks that the rubric revision preceded evaluation, and checks stored events for the configured API key without printing it.

The [README](../README.md) explains how to replay reports or make new TypeSafe/OpenRouter calls. Saved response probabilities and auxiliary judgments are in each run's `events.jsonl`. Cases and frozen labels are in `experiments/`; their limitations are explicit in every run report.

This work uses the current [TypeSafe API](https://docs.typesafe.ai/api), [OpenRouter Decisions schema](https://openrouter.ai/openapi.json), [citation-checking pattern](https://docs.typesafe.ai/cookbooks/citation_check), and [documented Jev failure modes](https://docs.typesafe.ai/model-jaggedness/jev-1.13). The performance figures above come from the saved local runs, not vendor examples.
