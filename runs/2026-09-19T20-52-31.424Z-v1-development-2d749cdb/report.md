# Jev v1: development live run

Created: 2026-09-19T20:52:31.426Z. Provider: openrouter. Requested model: typesafe/jev-1.13.
Returned models: typesafe/jev-1.13-20260917.

Valid responses: 18/18. Failures: 0. Unattempted: 0. HTTP attempts: 18.
Validated-response input/output tokens: 13057/1939. Reported cost: $0.00054839. Cost coverage: 18/18 validated responses; failed requests may have unrecorded charges. Median successful request: 214 ms.

## Primary judgments

| Direction | Same-author unaided | Same-author checklist | Jev canonical | Jev all variants | Errors | Label changes | Correct-to-wrong changes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| belief | 6/6 | 6/6 | 6/6 | 6/6 | 0 | 0/0 | 0 |
| question | 6/6 | 6/6 | 6/6 | 6/6 | 0 | 0/0 | 0 |
| adaptation | 6/6 | 6/6 | 5/6 | 5/6 | 0 | 0/0 | 0 |

Counts use predeclared acceptable labels. Equal acceptable alternatives can change labels harmlessly. Auxiliary scores and probabilities remain in events.jsonl; they have no measured accuracy claim or tuned automation threshold.

## Case records

| Case | Variant | Expected | Returned | Confidence | Result |
| --- | --- | --- | --- | --- | --- |
| b01 | canonical | supports | supports | 1.000 | match |
| b02 | canonical | weakens | weakens | 1.000 | match |
| b03 | canonical | unchanged | unchanged | 0.940 | match |
| b04 | canonical | unchanged | unchanged | 0.980 | match |
| b05 | canonical | insufficient | insufficient | 0.990 | match |
| b06 | canonical | weakens | weakens | 1.000 | match |
| q01 | canonical | B | B | 1.000 | match |
| q02 | canonical | B | B | 1.000 | match |
| q03 | canonical | insufficient | insufficient | 1.000 | match |
| q04 | canonical | A | A | 0.990 | match |
| q05 | canonical | B | B | 0.850 | match |
| q06 | canonical | insufficient | insufficient | 0.970 | match |
| a01 | canonical | responsive | responsive | 0.960 | match |
| a02 | canonical | self_sealing | self_sealing | 1.000 | match |
| a03 | canonical | responsive | responsive | 0.990 | match |
| a04 | canonical | insufficient | responsive | 0.550 | MISMATCH |
| a05 | canonical | self_sealing | self_sealing | 0.990 | match |
| a06 | canonical | self_sealing | self_sealing | 1.000 | match |

## Limitations

Illustrative same-author judgments, written after authoring the cases and before any Jev results. They are not blind or independent. The unaided condition means no explicit checklist pass, not absence of exposure to this project's reasoning guidance. Evaluation cases are reserved from rubric revision, not hidden from the case author. Do not use this comparison to claim a causal Jev advantage.

The cases are short synthetic examples. Evaluation labels are reserved from rubric revision, but authored by the same agent. No blinding, calibration study, end-to-end host-agent trial, general truth verification, or formal value-function test is claimed. Development improvements and evaluation results must remain separate. Model scores cannot override constraints.

manifest.json freezes cases, labels, baseline answers, rubric, source hashes, and planned calls before inference. events.jsonl records exact requests, validated answers, redacted raw responses, latency, and failures. source-checks.json contains deterministic provenance checks.
