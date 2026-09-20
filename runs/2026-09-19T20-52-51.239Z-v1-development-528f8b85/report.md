# Jev v1: development live run

Created: 2026-09-19T20:52:51.241Z. Provider: openrouter. Requested model: typesafe/jev-1.13.
Returned models: typesafe/jev-1.13-20260917.

Valid responses: 54/54. Failures: 0. Unattempted: 0. HTTP attempts: 54.
Validated-response input/output tokens: 39225/5817. Reported cost: $0.00164745. Cost coverage: 54/54 validated responses; failed requests may have unrecorded charges. Median successful request: 185 ms.

## Primary judgments

| Direction | Same-author unaided | Same-author checklist | Jev canonical | Jev all variants | Errors | Label changes | Correct-to-wrong changes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| belief | 6/6 | 6/6 | 6/6 | 18/18 | 0 | 0/12 | 0 |
| question | 6/6 | 6/6 | 6/6 | 18/18 | 0 | 0/12 | 0 |
| adaptation | 6/6 | 6/6 | 5/6 | 15/18 | 0 | 0/12 | 0 |

Counts use predeclared acceptable labels. Equal acceptable alternatives can change labels harmlessly. Auxiliary scores and probabilities remain in events.jsonl; they have no measured accuracy claim or tuned automation threshold.

## Case records

| Case | Variant | Expected | Returned | Confidence | Result |
| --- | --- | --- | --- | --- | --- |
| b01 | canonical | supports | supports | 1.000 | match |
| b01 | paraphrase | supports | supports | 1.000 | match |
| b01 | reversed | supports | supports | 1.000 | match |
| b02 | canonical | weakens | weakens | 1.000 | match |
| b02 | paraphrase | weakens | weakens | 1.000 | match |
| b02 | reversed | weakens | weakens | 1.000 | match |
| b03 | canonical | unchanged | unchanged | 0.940 | match |
| b03 | paraphrase | unchanged | unchanged | 0.940 | match |
| b03 | reversed | unchanged | unchanged | 0.900 | match |
| b04 | canonical | unchanged | unchanged | 0.980 | match |
| b04 | paraphrase | unchanged | unchanged | 0.980 | match |
| b04 | reversed | unchanged | unchanged | 0.990 | match |
| b05 | canonical | insufficient | insufficient | 0.990 | match |
| b05 | paraphrase | insufficient | insufficient | 0.990 | match |
| b05 | reversed | insufficient | insufficient | 0.980 | match |
| b06 | canonical | weakens | weakens | 0.990 | match |
| b06 | paraphrase | weakens | weakens | 1.000 | match |
| b06 | reversed | weakens | weakens | 1.000 | match |
| q01 | canonical | B | B | 1.000 | match |
| q01 | paraphrase | B | B | 1.000 | match |
| q01 | reversed | B | B | 1.000 | match |
| q02 | canonical | B | B | 1.000 | match |
| q02 | paraphrase | B | B | 1.000 | match |
| q02 | reversed | B | B | 1.000 | match |
| q03 | canonical | insufficient | insufficient | 1.000 | match |
| q03 | paraphrase | insufficient | insufficient | 1.000 | match |
| q03 | reversed | insufficient | insufficient | 1.000 | match |
| q04 | canonical | A | A | 0.980 | match |
| q04 | paraphrase | A | A | 0.990 | match |
| q04 | reversed | A | A | 1.000 | match |
| q05 | canonical | B | B | 0.870 | match |
| q05 | paraphrase | B | B | 0.910 | match |
| q05 | reversed | B | B | 0.910 | match |
| q06 | canonical | insufficient | insufficient | 0.960 | match |
| q06 | paraphrase | insufficient | insufficient | 0.900 | match |
| q06 | reversed | insufficient | insufficient | 0.930 | match |
| a01 | canonical | responsive | responsive | 0.990 | match |
| a01 | paraphrase | responsive | responsive | 0.890 | match |
| a01 | reversed | responsive | responsive | 0.940 | match |
| a02 | canonical | self_sealing | self_sealing | 1.000 | match |
| a02 | paraphrase | self_sealing | self_sealing | 1.000 | match |
| a02 | reversed | self_sealing | self_sealing | 1.000 | match |
| a03 | canonical | responsive | responsive | 0.990 | match |
| a03 | paraphrase | responsive | responsive | 0.990 | match |
| a03 | reversed | responsive | responsive | 0.990 | match |
| a04 | canonical | insufficient | responsive | 0.490 | MISMATCH |
| a04 | paraphrase | insufficient | responsive | 0.440 | MISMATCH |
| a04 | reversed | insufficient | responsive | 0.750 | MISMATCH |
| a05 | canonical | self_sealing | self_sealing | 0.990 | match |
| a05 | paraphrase | self_sealing | self_sealing | 1.000 | match |
| a05 | reversed | self_sealing | self_sealing | 0.990 | match |
| a06 | canonical | self_sealing | self_sealing | 1.000 | match |
| a06 | paraphrase | self_sealing | self_sealing | 1.000 | match |
| a06 | reversed | self_sealing | self_sealing | 1.000 | match |

## Limitations

Illustrative same-author judgments, written after authoring the cases and before any Jev results. They are not blind or independent. The unaided condition means no explicit checklist pass, not absence of exposure to this project's reasoning guidance. Evaluation cases are reserved from rubric revision, not hidden from the case author. Do not use this comparison to claim a causal Jev advantage.

The cases are short synthetic examples. Evaluation labels are reserved from rubric revision, but authored by the same agent. No blinding, calibration study, end-to-end host-agent trial, general truth verification, or formal value-function test is claimed. Development improvements and evaluation results must remain separate. Model scores cannot override constraints.

manifest.json freezes cases, labels, baseline answers, rubric, source hashes, and planned calls before inference. events.jsonl records exact requests, validated answers, redacted raw responses, latency, and failures. source-checks.json contains deterministic provenance checks.
