# Jev v1: evaluation live run

Created: 2026-09-19T20:54:39.363Z. Provider: openrouter. Requested model: typesafe/jev-1.13.
Returned models: typesafe/jev-1.13-20260917.

Valid responses: 54/54. Failures: 0. Unattempted: 0. HTTP attempts: 54.
Validated-response input/output tokens: 39132/5814. Reported cost: $0.00164354. Cost coverage: 54/54 validated responses; failed requests may have unrecorded charges. Median successful request: 172 ms.

## Primary judgments

| Direction | Same-author unaided | Same-author checklist | Jev canonical | Jev all variants | Errors | Label changes | Correct-to-wrong changes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| belief | 6/6 | 6/6 | 5/6 | 15/18 | 0 | 2/12 | 1 |
| question | 6/6 | 6/6 | 5/6 | 16/18 | 0 | 1/12 | 0 |
| adaptation | 6/6 | 6/6 | 4/6 | 12/18 | 0 | 0/12 | 0 |

Counts use predeclared acceptable labels. Equal acceptable alternatives can change labels harmlessly. Auxiliary scores and probabilities remain in events.jsonl; they have no measured accuracy claim or tuned automation threshold.

## Case records

| Case | Variant | Expected | Returned | Confidence | Result |
| --- | --- | --- | --- | --- | --- |
| b07 | canonical | supports | supports | 1.000 | match |
| b07 | paraphrase | supports | supports | 1.000 | match |
| b07 | reversed | supports | supports | 1.000 | match |
| b08 | canonical | weakens | weakens | 1.000 | match |
| b08 | paraphrase | weakens | weakens | 1.000 | match |
| b08 | reversed | weakens | weakens | 1.000 | match |
| b09 | canonical | unchanged | unchanged | 0.990 | match |
| b09 | paraphrase | unchanged | unchanged | 0.990 | match |
| b09 | reversed | unchanged | unchanged | 0.990 | match |
| b10 | canonical | unchanged | unchanged | 0.940 | match |
| b10 | paraphrase | unchanged | unchanged | 0.940 | match |
| b10 | reversed | unchanged | unchanged | 0.950 | match |
| b11 | canonical | insufficient | insufficient | 0.390 | match |
| b11 | paraphrase | insufficient | unchanged | 0.360 | MISMATCH |
| b11 | reversed | insufficient | insufficient | 0.480 | match |
| b12 | canonical | unchanged | weakens | 0.550 | MISMATCH |
| b12 | paraphrase | unchanged | weakens | 0.520 | MISMATCH |
| b12 | reversed | unchanged | unchanged | 0.380 | match |
| q07 | canonical | A | A | 0.950 | match |
| q07 | paraphrase | A | A | 0.950 | match |
| q07 | reversed | A | A | 0.980 | match |
| q08 | canonical | B | B | 1.000 | match |
| q08 | paraphrase | B | B | 1.000 | match |
| q08 | reversed | B | B | 1.000 | match |
| q09 | canonical | insufficient | insufficient | 0.990 | match |
| q09 | paraphrase | insufficient | insufficient | 0.990 | match |
| q09 | reversed | insufficient | insufficient | 0.990 | match |
| q10 | canonical | A or B | insufficient | 0.310 | MISMATCH |
| q10 | paraphrase | A or B | insufficient | 0.480 | MISMATCH |
| q10 | reversed | A or B | A | 0.420 | match |
| q11 | canonical | B | B | 1.000 | match |
| q11 | paraphrase | B | B | 0.990 | match |
| q11 | reversed | B | B | 1.000 | match |
| q12 | canonical | insufficient | insufficient | 0.860 | match |
| q12 | paraphrase | insufficient | insufficient | 0.870 | match |
| q12 | reversed | insufficient | insufficient | 0.820 | match |
| a07 | canonical | responsive | responsive | 1.000 | match |
| a07 | paraphrase | responsive | responsive | 1.000 | match |
| a07 | reversed | responsive | responsive | 1.000 | match |
| a08 | canonical | self_sealing | self_sealing | 1.000 | match |
| a08 | paraphrase | self_sealing | self_sealing | 1.000 | match |
| a08 | reversed | self_sealing | self_sealing | 1.000 | match |
| a09 | canonical | self_sealing | self_sealing | 0.960 | match |
| a09 | paraphrase | self_sealing | self_sealing | 0.990 | match |
| a09 | reversed | self_sealing | self_sealing | 0.960 | match |
| a10 | canonical | insufficient | self_sealing | 0.660 | MISMATCH |
| a10 | paraphrase | insufficient | self_sealing | 0.730 | MISMATCH |
| a10 | reversed | insufficient | self_sealing | 0.680 | MISMATCH |
| a11 | canonical | responsive | responsive | 1.000 | match |
| a11 | paraphrase | responsive | responsive | 0.990 | match |
| a11 | reversed | responsive | responsive | 1.000 | match |
| a12 | canonical | insufficient | responsive | 0.800 | MISMATCH |
| a12 | paraphrase | insufficient | responsive | 0.700 | MISMATCH |
| a12 | reversed | insufficient | responsive | 0.790 | MISMATCH |

## Limitations

Illustrative same-author judgments, written after authoring the cases and before any Jev results. They are not blind or independent. The unaided condition means no explicit checklist pass, not absence of exposure to this project's reasoning guidance. Evaluation cases are reserved from rubric revision, not hidden from the case author. Do not use this comparison to claim a causal Jev advantage.

The cases are short synthetic examples. Evaluation labels are reserved from rubric revision, but authored by the same agent. No blinding, calibration study, end-to-end host-agent trial, general truth verification, or formal value-function test is claimed. Development improvements and evaluation results must remain separate. Model scores cannot override constraints.

manifest.json freezes cases, labels, baseline answers, rubric, source hashes, and planned calls before inference. events.jsonl records exact requests, validated answers, redacted raw responses, latency, and failures. source-checks.json contains deterministic provenance checks.
