# Jev as the scorer inside Graph of Thoughts

September 22, 2026. Claude (Opus 5.5) in Cowork, with Ty.

**Question:** in GoT's generate → score → keep-best loop, is Jev a better scorer than GoT's own LLM? This is also a small, real test of the "Jev as MCTS value function" idea.

**Answer:** not as a pass/fail gate. As a ranker, somewhat. Neither scorer caught most of the meaning errors. The run also turned up six operational bugs in the GoT and bridge setup, which matter more in practice than the scorer choice.

## Design

Everything below was stored in `belief_ledger` before any scoring:

- predictions: `pred_got_jev_scorer_1`
- labels: `labels_got_jev_scorer_1`

**Arm A: meaning fidelity** (Jev is expected to help here).

- The GoT server's LLM rewrote 6 logically tricky claims (conditions like "only if", "unless" and "not every") for 6 audiences: logician, code comment, 10-year-old, headline, manager, skeptic. That produced 36 glosses.
- Claude labelled each gloss before either scorer ran: faithful (F) 23, unfaithful (U) 9, ambiguous 4. The 4 ambiguous ones are excluded.
- Scorer 1: GoT's own `score` operation with the same LLM, 0–10, faithful if ≥ 7. It was fed through an echo step, so it scored exactly the saved text.
- Scorer 2: Jev `formalization_fidelity` v1, faithful if `same_truth_conditions` ≥ 0.6.
- Both thresholds were fixed in advance.

**Arm B: counting** (the negative control; Jev is expected to fail).

- Code generated a text with known country counts, plus 12 count tables with 0–4 known wrong entries.
- Jev was asked whether each table was all correct, and how many entries were wrong.

## Results: Arm A (32 labelled glosses)

| | Faithful accepted | Unfaithful rejected | Accuracy | AUC (ranking) |
| --- | --- | --- | --- | --- |
| Accept everything (baseline) | 23/23 | 0/9 | 71.9% | — |
| GoT LLM scorer | 22/23 | 4/9 | 81.2% | 0.686 |
| Jev `formalization_fidelity` | 23/23 | 2/9 | 78.1% | **0.785** |

- **Both scorers let most errors through.** Neither caught the dropped clause "instead of returning a score". Neither caught "some were false positives" standing in for "not confirmed". Neither caught one of the two "only if" reversals.
- **Jev was more lenient than the LLM** at the 0.6 threshold, the opposite of my prediction. Faithful glosses scored 0.71–0.98, so 0.6 is below everything faithful. That floor came from efh-core, where faithful pairs clustered near 0.65, so it doesn't transfer. After the fact, a floor of 0.70 would have rejected 4/9 unfaithful with no false rejects. That needs fresh data before anyone relies on it.
- **The LLM scorer is nearly binary.** 28 of its 36 scores were 10. In `keep_best_n` that means the pick comes from tie-break order, not judgment: the tied top sets contained unfaithful glosses for 4 of the 6 claims.
- **Jev's graded scores make better rankings.** Its top pick was a unique faithful gloss for 5 of 6 claims.
- **They catch different things.** The LLM rejected one "only if" reversal (0) but accepted a near-identical one (10). Jev accepted both (0.81, 0.83). Rejecting when *either* scorer objects (Jev < 0.70 or LLM < 7) catches 6/9 unfaithful with 1 false reject. This too is post-hoc.
- **Both caught a subtle one:** `textAgree && scalarAgree == false`, which operator precedence turns into a different condition. Jev scored it 0.20 ("contradicts"); the LLM scored it 0.
- **Rewrites turned into instructions.** For the "only if" claim, 4 of the 6 rewrites became commands ("don't commit unless…") rather than descriptions. Both scorers accepted them.

## Results: Arm B (counting)

- **Jev's all-correct check didn't work.** Every correct table scored 0.40–0.45 and was rejected.
- **Its error count was mostly noise.** It correlated 0.67 with the true number of errors (Spearman), but 0.70 with the table's total, so it's probably tracking how big the numbers are. Three identical correct tables got 2.38, 2.57 and 2.57 "errors".
- **Useful signal: Jev knew it didn't know.** Its confidence on the error count was 0–0.24. So Gemini's "route low-confidence judgments elsewhere" idea did its job here, even though Jev's stated confidence was high while it was wrong in Arm A.
- **Conclusion:** counting scores in GoT stay in code (`scoring_function`).

**Correction (same day):** Arm B was run through Cowork's device bridge, which delivered `context` as a JSON string rather than an object. A re-run with a proper object context (`studies/transport-rerun-2026-09-22`) gave the same conclusion:

- correct tables scored 0.42–0.50 on the all-correct check (1 of 3 accepted at 0.5)
- the error count's Spearman was 0.64 against true errors and 0.58 against table total
- confidence was 0–0.17

See `studies/claim-router-2026-09-22/README.md`, "The transport finding".

## Prediction scorecard

About 1.5 of 6 were right, at stated confidence of 55–75%. That's overconfident.

| Prediction | Result |
| --- | --- |
| p1: 30–50% unfaithful, mostly headline and 10-year-old | Missed: 28%, and no 10-year-old gloss was unfaithful |
| p2: Jev accuracy ≥ 80% | Missed: 78.1% |
| p3: LLM more lenient than Jev | Wrong: the LLM was stricter |
| p4: Jev has more false rejects | Wrong: Jev 0, LLM 1 |
| p5: both pick a faithful best-of-6 on ≥ 5/6 claims | Met for Jev; vacuous for the LLM, whose picks came from ties |
| p6: counting near chance | Mixed: the correctness check was useless; the error count had a confounded rank signal |

## GoT / bridge problems found

**Status 2026-09-22 (later that day):** items 1, 2, 3 and 6 are fixed in `auto-graph-of-thoughts`, uncommitted. That repo is the one the MCP config runs; `auto-graph-of-thoughts-mcp` is an older, abandoned attempt from Aug 2025.

- There are 10 new regression tests, and 37/37 pass.
- A live check ran the patched code from a scratch environment. It scored the two rewrites 2 and 10, with a real cost of $0.0006.
- Items 4 and 5 are in the Cowork bridge, not GoT, and are documented in GoT's SKILL.md.
- The running server needs a restart to load the fixes.

The original findings:

1. **Output cap vs reasoning model.** The GoT server's model is a reasoning model with a 1024-token output cap. When its thinking hits the cap, content comes back empty. That caused 8 of about 45 score calls and 3 generate calls to fail.
   - A failed score call crashes the run (`'NoneType' object has no attribute 'replace'` / `expected string ... got 'NoneType'`).
   - A failed generate call *silently* produces a `current: null` thought, which is worse.
   - Fix: raise `max_tokens`, or turn reasoning off for score steps, and make empty content an explicit error.
2. **`generate_type: "list"` splits on commas inside JSON strings.** It turned 6 rewrites into 10 fragments. Use `"json"`.
3. **The score parser accepted `1010.0` on a 0–10 scale.** Scores need to be clamped or rejected when out of range.
4. **The device bridge times out at 60 s.** Any graph with more than about 2 reasoning calls fails from Cowork, although the server keeps running it in the background (operation ids advanced).
5. **The bridge drops a parameter.** `add_got_operation` loses its `session_id` argument through the bridge, so pydantic reports it missing. The stateful session tools are unusable from here.
6. **Cost is always `0.0`,** so it isn't measured.

## What this means for the Gemini MCTS idea

- Jev as a value/prune function over *meaning* is plausible only as a **ranker combined with a second scorer**. It is not a gate.
- Its misses are logical-form errors: reversed conditionals, dropped clauses, and statements made stronger than the original. Tree-search pruning would need exactly those.
- The graded output is a real advantage over an LLM that answers 10 or 0. For search that needs a gradient, that counts.

## Limits

- One labeller (Claude) and one generator model.
- 6 claims were authored by Claude, and one of them (C4) was itself ambiguous.
- Each score is a single draw.
- 32 labelled items is small: one item changes accuracy by about 3 points.
- The GoT model was `deepseek/deepseek-v4-flash` (read from the server's .env afterwards).

## Files

- `glosses.py`: the glosses and labels
- `jev_scores.json`, `llm_scores.json`, `llm_failures.json`: the scores and the GoT failures
- `analyze_a.py`, `results_a.json`: Arm A analysis
- `make_b.py`, `arm_b.json`, `analyze_b.py`, `results_b.json`: Arm B
- Jev runs: `ca65654c`, `762bc57d` (Arm A) and `e49a576e` (Arm B), with outcomes attached
