# Jev as a reasoning auditor: the Reasoning and Beliefs doc as capabilities

September 22, 2026. Claude (Opus 5.5) in Cowork, with Ty.

**Question:** can the "Reasoning and Beliefs" doc become something an agent actually uses through jev-mcp, not just reads?

**Short answer:** partly. Three pieces work and are saved. One idea failed, and that failure shows where Jev's limits are. Nothing here is independently validated: every label was written by the same agent that wrote the questions.

## Design principle

Jev is literal and cannot come up with ideas. It judges the options you give it. So the split is:

- **The agent** (Claude) writes the claim, states its basis, and goes looking for evidence, including evidence against it.
- **Jev** judges narrow, literal questions about that material: which reasoning mode this is, whether the wording goes further than the basis, and whether this evidence counts against the claim.

This follows the efh-core rule, "measured, not trusted": the author of a claim should not be the only one who judges whether its confidence is earned.

The Playground screenshot showed the same thing from the other side. `is_human_escalation` had no criteria and scored 41% on an obvious request for a human. `is_possible_ghost_or_vampire` had explicit criteria and scored 96%. Jev is only as smart as the criteria it is given.

## What was built

| Piece | What it does | Status |
| --- | --- | --- |
| `reasoning_methods` records (9) | The doc split into searchable method and practice records (deduction, induction, abduction, the Peirce loop, and the 5 practices) | Stored; `search_records` retrieval verified |
| `inference_warrant` v3 | For a claim and its basis: the reasoning mode, how certain the wording is, and three checks: `overclaim`, `scope_gap`, `absence_as_evidence` | Saved, unvalidated |
| `evidence_stance` v2 | Pre-mortem sorter. Labels each evidence item's stance toward a claim, flags counterevidence, and flags **rival explanations** of the observations | Saved, unvalidated |
| `belief_ledger` records | Predictions written *before* a run, then resolved afterwards (the doc's "tighten feedback latency" practice) | 1 prediction and its resolution |

## Results

### evidence_stance

- **v1: 7/8.** It missed the doc's own sprinkler example. That was the correct call for the question as asked: a sprinkler timer, read on its own, does not make rain less likely. What the sprinkler does is **explain the wet grass another way**, which is a different question.
- **v2** adds `rival_explanation`, judged against `context.observations`. It passed **6/6** new cases: sprinkler 0.95, irrigation 0.95, dew 0.85, with non-rivals at 0.25 or below.

### inference_warrant: textbook cases

- **v1: 7/7.** These cases were easy.

### inference_warrant: self-audit on Claude's own past claims

I took 7 claims from the 2026-09-20 session record. Two were later shown to be wrong:

- **R1:** dismissing the `~` model id as someone's shorthand.
- **R2:** "the monitor is blind to contradiction."

I stored my predictions before running.

- v1 flagged both errors, R1 at 0.88 and R2 at 0.86.
- It also flagged 3 of the 4 true factual claims (G1, G2, G3), plus G4, a recommendation, at 0.55.
- **`overclaim` detects unearned confidence, not error.** Those flags were fair: "the embedding measure *could not have* caught it" was concluded from 18 pairs. "The self-report leg *never refused anything*" was concluded from 3 commits, and commits cannot show refusals at all.
- My pre-run predictions: 5 of 6 directional calls were right, 1 was a coin flip, and G4 was the miss.

### v2: why the two errors happened

v2 adds two literal checks aimed at what caused R1 and R2. It passed 13/13: 4 held-out cases, 6 from the self-audit (now development data), and 3 regression cases.

| Check | True cases | False cases | Verdict |
| --- | --- | --- | --- |
| `absence_as_evidence` | R1 0.85, H3 0.94 | ≤0.43 (a real NVD search: 0.43) | **Cleanest signal** |
| `scope_gap` (4 draws) | R2 0.71–0.77, H1 0.97 | G1 0.44–0.53, G5 0.47–0.48 | Separates R2 from G1 by about 0.25, but true negatives sit right at 0.5. **Read 0.4–0.6 as unsettled** |
| `overclaim` | High on all overclaims | False positive: a well-supported NVD zero-result claim scored 0.86 | High sensitivity, low specificity |
| `rivals_unaddressed` (v1/v2) | 0.84–0.93 | 0.85 on a claim that framed itself as one hypothesis | **Did not discriminate; removed in v3** |

**The failed idea teaches the main lesson.** Asking Jev "are there rival explanations?" fails because Jev cannot imagine rivals. Giving it a specific rival and asking "does this explain the observation?" works. So the agent generates the rivals and Jev judges them. In practice that means running `evidence_stance` with the candidate rivals as items.

**Correction (same day):** the `evidence_stance` evaluations above were run through Cowork's device bridge, which delivered `context` as a JSON string. Re-running them with an object context gave the same results: v1 7/8 with the same sprinkler miss, and v2 6/6. The `inference_warrant` runs received items with their keys sorted alphabetically (basis before claim), which can lower the mode-confidence values. See `studies/claim-router-2026-09-22/README.md`.

## How I would use this

Before handing Ty a confident conclusion from debugging or research:

1. Write the key claims as `{claim, basis}` and run `inference_warrant` v3. Each claim costs 2 Jev calls, which were free on the TypeSafe beta in this session.
2. If `absence_as_evidence` ≥ 0.6, go and search properly before asserting.
3. If `scope_gap` ≥ 0.6, restate the claim to cover only what was actually measured. Between 0.4 and 0.6, look again yourself.
4. Treat `overclaim` as a prompt to hedge the wording, not as evidence that the claim is wrong.
5. For an abductive conclusion, list 2–4 rival causes yourself and run `evidence_stance` with the observations in context.
6. For anything consequential, store a prediction in `belief_ledger` first and resolve it later.

## Limits

- All labels are same-author. The 4 held-out cases are few and were written by the agent that designed the checks.
- The self-audit bases were reconstructed from the session record, not the original transcript.
- Each value above is one draw, except the 4-draw `scope_gap` check. The spread is roughly 0.02–0.09.
- Jev judges the basis as written. It could not know that the monitor had scalar channels, so it caught R2 through its *wording*, not through knowledge.
- Costs came back as `reportedCostUsd: 0` / `unreportedCosts` on the TypeSafe provider, so cost is not measured here.

## Next steps, if wanted

- Label a batch of real claims from future sessions, with a second reviewer, and measure calibration of the `belief_ledger` over roughly 30 or more predictions.
- Try a stricter `overclaim` variant that states the sample size explicitly, to see whether the NVD-style false positives drop.
- Hook `absence_as_evidence` into efh-core's `verify_implication` basis field.

## Evidence

- `evidence_stance`: runs f57329f6 (v1) and 2ff02740 (v2)
- `inference_warrant`: runs 880e5782 (v1 textbook), 5785d45f (v1 self-audit), 863d11d4 (v2 evaluation), and 77c5b7f2, 67cfff1e, aaa931a7 (v3 repeat draws)
- Outcomes are attached to runs 5785d45f (including a correction to my own tally), 863d11d4 and 77c5b7f2
- Records: `reasoning_methods/*` and `belief_ledger/*`
