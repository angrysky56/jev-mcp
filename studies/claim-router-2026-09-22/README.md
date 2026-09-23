# Claim router: the four TypeSafe patterns as one system

September 22, 2026. Claude (Opus 5.5) in Cowork, with Ty.

**What was built:** the four patterns from [docs.typesafe.ai/patterns](https://docs.typesafe.ai/patterns) are now part of how a jev-mcp capability is defined. On top of that sits `claim_router`, which reads a claim and names the check that suits how it was reasoned (Peirce: deduction, induction, abduction).

- The server only labels each claim with a route. The host (Claude) then runs the named check.
- One routed check was run end to end for each of two claims: a proof and a rival-explanation test.

## Runtime changes (jev-mcp, uncommitted)

| Pattern | How it is expressed in a capability |
| --- | --- |
| Speculative fan-out | Already there: every question in a stage goes in one call per item. It is now tested explicitly. |
| Composite scoring | `composites.NAME.terms: [{stage, question, weight, label?, invert?}]`. Each answer is put on a 0–1 scale (Noul as is, Score ÷ its top level, Choice = probability of `label`). The composite is their weighted mean, or `null` if any answer is missing. |
| Confidence-gated routing | Any rule can add `field: "confidence"` (`gte`/`lte`, 0–1). For Choice and Score this is the provider's confidence value, which measures how concentrated the answer is. A Noul has no confidence, so it uses \|2p − 1\|. **Neither is calibrated correctness.** |
| Intent routing | `routes: [{id, when?, description}]`, checked in order; the first match wins, and a last route with no `when` is the default. Rules can test answers, confidence, or composites (`{composite, op, value}`). |

The rest of the change:

- **Results:** each item now carries `composites` and a `route`. The route is `null` if any stage failed. The run summary lists items by route.
- **Ranking and testing:** `rank` can use a composite. `evaluate_capability` can check `{route: ID}` and composite expectations.
- **Validation** rejects each of these before any call is made:
  - a Choice term without a label, or a label on a Noul or Score term
  - a default route that isn't last, or duplicate route IDs
  - a confidence rule using `eq`
  - a composite used in a stage condition
  - references to things that don't exist
- **Transport fix:** some hosts send `context`/`state` as a serialized string. A string that parses to an object or array is now unwrapped (`unwrapJson`).
- **Guide:** `jev://guide` documents all of the above.

**Tests:** 41/41 pass (35 old plus 6 new), and typecheck is clean. `verify:runtime`, `verify:study`, `verify:continuity` and `validate` all still pass.

**The running server needs a restart** to pick these up. Until then, the old schema rejects `composites`/`routes`. The runs below used the new code through `scripts/mcp-call.ts` with a separate data folder (`JEV_DATA_DIR`), because opening the main SQLite file from the sandbox failed with "disk I/O error".

## `claim_router` v1

- **One fan-out stage, one call per claim, six questions:**
  - `mode`: deduction, induction, abduction, recommendation or unsupported
  - `certainty`: how sure the wording sounds
  - `overclaim`, `scope_gap`, `absence_as_evidence`: reused verbatim from `inference_warrant` v3
  - `stakes`: how bad it would be to act on the claim if it were false
- **Input:** each item is `{claim, basis, action?}`, where `action` is what will be done if the claim is believed.
- **Composites:**
  - `warrant_risk` = 0.4·overclaim + 0.3·scope_gap + 0.3·absence
  - `priority` adds stakes; claims are ranked by `priority` so the riskiest get checked first.

**Routes, first match wins:**

1. `ask_for_basis`: mode is unsupported.
2. `search_first`: absence_as_evidence ≥ 0.6.
3. `second_opinion`: mode confidence ≤ 0.45.
4. `accept`: warrant_risk ≤ 0.35 and stakes ≤ 0.8.
5. `prove`: deduction.
6. `check_sample`: induction.
7. `test_rivals`: abduction.
8. `check_reasons`: recommendation.
9. `manual_review`: the default.

The design draws on earlier findings:

- `absence_as_evidence` was the cleanest signal, so it gets a route of its own.
- `overclaim` fires on almost any flat statement, so it only contributes to the composite.
- Jev can't come up with rival explanations, so abductive claims go to `test_rivals`: the host lists the rivals and `evidence_stance` judges them.

## Results

**Routes vs expectations written beforehand** (`belief_ledger/pred_claim_router_1`): **8/10**. I had predicted at least 7/10.

| Case | Expected | Got | Note |
| --- | --- | --- | --- |
| E1 deduction, log message | accept | accept | risk 0.14, stakes 0.20 |
| E2 deduction, remove review step | prove | prove | but absence 0.56–0.58, just under the 0.6 that would have sent it to `search_first` |
| E3 "always" from 3 runs, ship to prod | check_sample | check_sample | risk 0.77, stakes 2.0 |
| E4 "nothing else could explain it" | test_rivals | test_rivals | |
| E5 no basis | ask_for_basis | ask_for_basis | |
| E6 recommendation | check_reasons | check_reasons | mode confidence 0.60 |
| E7 "monitor is blind" (a real past error) | second_opinion | **check_sample** | mode confidence 0.83–0.92 here, not ≤ 0.45 |
| E8 "no errors, I skimmed it" | search_first | search_first | absence 0.96; mode confidence 0.35 would also have tripped the gate |
| E9 "probably passes", start next feature | accept | **check_sample** | Jev rated stakes medium (1.08). This errs toward checking more, which is the safe direction. |
| E10 the tilde dismissal (a real past error) | search_first | search_first | absence 0.76–0.82 |

- **Stability:** two repeat runs gave identical routes, 30/30.
- **Without the `action` field:** E1 moved from `accept` to `prove`, because stakes rose from 0.2 to 1.1. The stakes question needs to be told what's being risked.
- **E7 is still arguably handled.** `check_sample` asks whether measurements of one embedding channel can support a claim about the whole monitor, and that is exactly the error I made.

## Does asking everything at once change the answers?

**Not here.** Using the same E7 claim, sent as a proper JSON object:

| Questions asked in the call | Mode confidence (2 runs each) |
| --- | --- |
| mode alone | 0.91, 0.89 |
| mode + certainty | 0.91, 0.91 |
| all six | 0.89, 0.89 |

## The transport finding

This affects earlier results.

**What the link does.** Through Cowork's link to Ty's computer:

- `context` (for `run_capability`/`evaluate_capability`) and `state` (for `jev_judge`) arrived as **strings**.
- Keys inside items arrived **sorted alphabetically**.

**Key order can change Jev's answers on borderline items.** With basis listed before claim, E7's mode confidence fell to 0.71–0.75, from 0.89–0.91 with claim first.

I first wrote this up as a general effect. Then the router itself, run on my own conclusions, sent that claim to `check_sample`: it rested on one claim. Checking all 10 cases in both orders:

- **The average shift was +0.01.**
- **Clear cases barely moved.** E1–E5, E9: 0.00–0.06.
- **Borderline ones moved 0.1–0.2.** E6 by −0.11, E7 by +0.19.
- **E8 flipped label**, from induction (0.39) to abduction (0.46). It was ambiguous either way.

So the same *borderline* item can route differently depending on which client sends it; clear items don't.

**Runs that had a string context:**

- `evidence_stance` v1 and v2 evaluations
- the counting control (Arm B) in the GoT scorer study

**Re-run with proper objects:**

| Run | Original (string context) | Re-run (object context) |
| --- | --- | --- |
| `evidence_stance` v1 | 7/8, same sprinkler miss | 7/8, same sprinkler miss |
| `evidence_stance` v2 | 6/6 | 6/6 |
| Arm B, correct tables' all-correct score | 0.40–0.45 | 0.42–0.50 (1 of 3 accepted at 0.5) |
| Arm B, error-count Spearman vs true errors | 0.67 | 0.64 |
| Arm B, error-count Spearman vs table total | 0.70 | 0.58 |
| Arm B, confidence | 0–0.24 | 0–0.17 |

The conclusions stand: Jev still can't verify counts.

**Other runs:** the `inference_warrant` runs got items with keys sorted (basis before claim). They weren't re-run, so their mode confidences may be lower than a claim-first client would see.

## The router audits its own author

After the restart, `claim_router` was defined in the main library through the host. I ran it on four of my own conclusions from this session:

| Claim | Route | Why |
| --- | --- | --- |
| Asking several questions in one call doesn't change answers | check_sample | tested on one claim |
| Field order changes answers | check_sample | tested on one claim |
| The earlier conclusions stand after the re-run | second_opinion | mode confidence 0.11, a mixed claim |
| The routes are stable | check_sample | based on 2 repeats of 10 cases |

`overclaim` scored 0.71–0.81 on all four.

I followed through on the field-order route (see above): the claim didn't hold in general and had to be narrowed. The fan-out claim is likewise based on one claim, and is stated here only for that claim.

Note: Cowork's tool list still showed the old `define_capability` schema after the restart, but the server accepted `composites` and `routes`. The bridge sorted the definition's question keys too, so the main-library hash (`0eb1ec6a…`) differs from the sandbox copy (`8b6adbeb…`) for the same content.

## Can it catch overgeneralization? (scope pairs)

Ty pointed out that I often overgeneralize in new, subtle domains. To test whether the router can help, I wrote 8 of today's conclusions two ways, with the same basis each time:

- **G:** the general wording I actually used, such as "field order changes Jev's answers".
- **S:** a rewrite scoped to what was measured, such as "on one claim, basis-first lowered mode confidence from 0.90 to 0.73".

Predictions were stored first (`belief_ledger/pred_scope_pairs_1`); all five were met. Run `aba5016c`:

| | General (G) | Scoped (S) |
| --- | --- | --- |
| warrant_risk | 0.44–0.61 | 0.12–0.37 (lower on 8/8 pairs) |
| scope_gap | 0.41–0.72 | 0.04–0.27 (a 0.35 cut separates all 8) |
| Routes | 6 check_sample, 2 second_opinion, 0 accept | 6 accept, 2 prove |

**What this shows:** narrowing a claim to its sample and conditions moves the router in the right direction, consistently. `scope_gap` is the question that tracks it.

**What it doesn't show:** that the router catches overgeneralizations as they're written. The scoped versions are close restatements of their basis, and I wrote both sides. The false-alarm rate on claims I scope naturally is still unmeasured.

## Routed handlers, run end to end

- **E2 → `prove`.** mcp-logic (Prover9) proved `all x (committed(x) → hasproof(x)), ¬hasproof(c) ⊢ ¬committed(c)`. The converse, "has a proof, so it can be committed", came back **unprovable**. That's the necessary-vs-sufficient mix-up from the Sep 20 session, caught by the prover rather than by a judgment. The prover checks the claim, not whether removing the review step is wise.
- **E4 → `test_rivals`.** I listed five candidate causes and ran `evidence_stance` v2 with the observations in context:
  - provider variable mismatch: 0.84
  - misspelled variable name: 0.77
  - out of credit: 0.21, correctly low, because that failure gives a different error
  - unrelated README date: 0.03
  - "GUI apps don't source ~/.bashrc": 0.80. That is a restatement of the claim itself, not a rival, and Jev can't tell the two apart.
  - Two plausible rivals refute "nothing else could explain it".

## Limits

- Labels and expected routes were written by the same agent that designed the router. The routing thresholds (0.6, 0.45, 0.35, 0.8) are authored guesses, and 10 cases is small.
- Confidence gates rest on a measure of how concentrated the answer is, and the transport and key-order issue can move that measure. Compare runs only when they come from the same client.
- The `claim_router` definition lives in the sandbox's separate data folder, not Ty's main library, until the server is restarted and it is defined there.
- The evaluation-run outcome was recorded twice by accident. The log is append-only, so both copies remain.

## Files

- `define.json`: the capability definition
- `evaluate.json`, `run_same.json`, `run_no_action.json`: the evaluation and repeat runs
- `iso_*.json`: the fan-out isolation and key-order checks
- `handler_test_rivals_E4.json`: the E4 rival test
- `../transport-rerun-2026-09-22/`: the re-runs and their results
