# Continuity study: evaluation — live

Created 2026-09-20T03:06:36.352Z. Provider openrouter; requested typesafe/jev-1.13; returned typesafe/jev-1.13-20260917.
Validated 54/54 requests; errors 0; unattempted 0.
Reported cost: $0.00322825. Median successful call: 212 ms. Input tokens: 76863.

| Function | Cases | Lexical baseline | Recent baseline | Jev canonical | Jev all variants |
| --- | ---: | ---: | ---: | ---: | ---: |
| wake | 6 | 1/6 | n/a | 6/6 | 18/18 |
| packet | 6 | 1/6 | 0/6 | 6/6 | 18/18 |
| method | 6 | 0/6 | 0/6 | 6/6 | 18/18 |

Success means matching the author-specified reminder category, or retrieving every designated required card while excluding designated forbidden cards. Other retrieved items are not necessarily irrelevant; card-level precision is not established. Variants are repeated presentations of the same six cases, not independent samples.

## Individual results

| Case | Variant | Expected | Returned | Match |
| --- | --- | --- | --- | --- |
| w7 | canonical | wake | wake | yes |
| w7 | paraphrase | wake | wake | yes |
| w7 | reversed | wake | wake | yes |
| w8 | canonical | wait | wait | yes |
| w8 | paraphrase | wait | wait | yes |
| w8 | reversed | wait | wait | yes |
| w9 | canonical | wake | wake | yes |
| w9 | paraphrase | wake | wake | yes |
| w9 | reversed | wake | wake | yes |
| w10 | canonical | wait | wait | yes |
| w10 | paraphrase | wait | wait | yes |
| w10 | reversed | wait | wait | yes |
| w11 | canonical | wait | wait | yes |
| w11 | paraphrase | wait | wait | yes |
| w11 | reversed | wait | wait | yes |
| w12 | canonical | review | review | yes |
| w12 | paraphrase | review | review | yes |
| w12 | reversed | review | review | yes |
| p7 | canonical | P7K0, P7K1 | P7K1, P7K0 | yes |
| p7 | paraphrase | P7K0, P7K1 | P7K1, P7K0 | yes |
| p7 | reversed | P7K0, P7K1 | P7K1, P7K0 | yes |
| p8 | canonical | P8K0, P8K1 | P8K1, P8K0 | yes |
| p8 | paraphrase | P8K0, P8K1 | P8K1, P8K0, P8D0 | yes |
| p8 | reversed | P8K0, P8K1 | P8K1, P8K0 | yes |
| p9 | canonical | P9K0, P9K1 | P9K0, P9K1 | yes |
| p9 | paraphrase | P9K0, P9K1 | P9K1, P9K0 | yes |
| p9 | reversed | P9K0, P9K1 | P9K0, P9K1 | yes |
| p10 | canonical | P10K0, P10K1 | P10K0, P10K1 | yes |
| p10 | paraphrase | P10K0, P10K1 | P10K1, P10K0 | yes |
| p10 | reversed | P10K0, P10K1 | P10K0, P10K1 | yes |
| p11 | canonical | P11K0, P11K1 | P11K0, P11K1 | yes |
| p11 | paraphrase | P11K0, P11K1 | P11K0, P11K1 | yes |
| p11 | reversed | P11K0, P11K1 | P11K0, P11K1 | yes |
| p12 | canonical | P12K0, P12K1 | P12K1, P12K0 | yes |
| p12 | paraphrase | P12K0, P12K1 | P12K1, P12K0 | yes |
| p12 | reversed | P12K0, P12K1 | P12K1, P12K0 | yes |
| m7 | canonical | M1 | M1 | yes |
| m7 | paraphrase | M1 | M1 | yes |
| m7 | reversed | M1 | M1, M8 | yes |
| m8 | canonical | M2 | M2, M8 | yes |
| m8 | paraphrase | M2 | M2 | yes |
| m8 | reversed | M2 | M2, M4 | yes |
| m9 | canonical | M3 | M3 | yes |
| m9 | paraphrase | M3 | M3 | yes |
| m9 | reversed | M3 | M3 | yes |
| m10 | canonical | M7 | M7, M8 | yes |
| m10 | paraphrase | M7 | M7, M8 | yes |
| m10 | reversed | M7 | M7, M8 | yes |
| m11 | canonical | M8 | M8, M4 | yes |
| m11 | paraphrase | M8 | M8, M4 | yes |
| m11 | reversed | M8 | M8, M4 | yes |
| m12 | canonical | M4 | M4, M8 | yes |
| m12 | paraphrase | M4 | M4, M8 | yes |
| m12 | reversed | M4 | M4, M8 | yes |

## Limits

This is a same-author synthetic stress test, intentionally challenging recency and keyword matching. No independent reviewer, real conversation distribution, downstream agent continuation, belief update, self-awareness, or successful execution was measured. No claims about consciousness are inferred from an operational capability record.

Three-card packets and two-card method suggestions preserve source text, role, scope, and lifecycle. Character counts measure selected record text only, excluding references and metadata; they are not token savings. Eligibility, pins, and dependency closure are identical in all selection conditions. Incompatible scopes and superseded records are excluded by code, so those successes cannot be credited to Jev.

No memory archive was deleted, no action was executed, and no native host context was replaced. Same-source pointers can always recover omitted material. Policy and cases were frozen before inference; no threshold was tuned on these results.
