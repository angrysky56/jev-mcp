# Continuity study: development — live

Created 2026-09-20T03:06:22.922Z. Provider openrouter; requested typesafe/jev-1.13; returned typesafe/jev-1.13-20260917.
Validated 54/54 requests; errors 0; unattempted 0.
Reported cost: $0.00322283. Median successful call: 202 ms. Input tokens: 76734.

| Function | Cases | Lexical baseline | Recent baseline | Jev canonical | Jev all variants |
| --- | ---: | ---: | ---: | ---: | ---: |
| wake | 6 | 0/6 | n/a | 6/6 | 18/18 |
| packet | 6 | 0/6 | 0/6 | 6/6 | 18/18 |
| method | 6 | 0/6 | 0/6 | 6/6 | 18/18 |

Success means matching the author-specified reminder category, or retrieving every designated required card while excluding designated forbidden cards. Other retrieved items are not necessarily irrelevant; card-level precision is not established. Variants are repeated presentations of the same six cases, not independent samples.

## Individual results

| Case | Variant | Expected | Returned | Match |
| --- | --- | --- | --- | --- |
| w1 | canonical | wake | wake | yes |
| w1 | paraphrase | wake | wake | yes |
| w1 | reversed | wake | wake | yes |
| w2 | canonical | wait | wait | yes |
| w2 | paraphrase | wait | wait | yes |
| w2 | reversed | wait | wait | yes |
| w3 | canonical | wait | wait | yes |
| w3 | paraphrase | wait | wait | yes |
| w3 | reversed | wait | wait | yes |
| w4 | canonical | wait | wait | yes |
| w4 | paraphrase | wait | wait | yes |
| w4 | reversed | wait | wait | yes |
| w5 | canonical | wake | wake | yes |
| w5 | paraphrase | wake | wake | yes |
| w5 | reversed | wake | wake | yes |
| w6 | canonical | review | review | yes |
| w6 | paraphrase | review | review | yes |
| w6 | reversed | review | review | yes |
| p1 | canonical | P1K0, P1K1 | P1K0, P1K1 | yes |
| p1 | paraphrase | P1K0, P1K1 | P1K0, P1K1 | yes |
| p1 | reversed | P1K0, P1K1 | P1K0, P1K1 | yes |
| p2 | canonical | P2K0, P2K1 | P2K1, P2K0 | yes |
| p2 | paraphrase | P2K0, P2K1 | P2K1, P2K0 | yes |
| p2 | reversed | P2K0, P2K1 | P2K1, P2K0 | yes |
| p3 | canonical | P3K0, P3K1 | P3K1, P3K0 | yes |
| p3 | paraphrase | P3K0, P3K1 | P3K1, P3K0 | yes |
| p3 | reversed | P3K0, P3K1 | P3K1, P3K0 | yes |
| p4 | canonical | P4K0, P4K1 | P4K0, P4K1 | yes |
| p4 | paraphrase | P4K0, P4K1 | P4K0, P4K1 | yes |
| p4 | reversed | P4K0, P4K1 | P4K0, P4K1 | yes |
| p5 | canonical | P5K0, P5K1 | P5K0, P5K1, P5D2 | yes |
| p5 | paraphrase | P5K0, P5K1 | P5K0, P5K1, P5D2 | yes |
| p5 | reversed | P5K0, P5K1 | P5K0, P5K1, P5D2 | yes |
| p6 | canonical | P6K0, P6K1 | P6K1, P6K0 | yes |
| p6 | paraphrase | P6K0, P6K1 | P6K1, P6K0 | yes |
| p6 | reversed | P6K0, P6K1 | P6K0, P6K1 | yes |
| m1 | canonical | M1 | M1, M8 | yes |
| m1 | paraphrase | M1 | M1, M6 | yes |
| m1 | reversed | M1 | M1, M6 | yes |
| m2 | canonical | M2 | M2 | yes |
| m2 | paraphrase | M2 | M2 | yes |
| m2 | reversed | M2 | M2 | yes |
| m3 | canonical | M3 | M3 | yes |
| m3 | paraphrase | M3 | M3 | yes |
| m3 | reversed | M3 | M3, M8 | yes |
| m4 | canonical | M4 | M4 | yes |
| m4 | paraphrase | M4 | M4 | yes |
| m4 | reversed | M4 | M4, M8 | yes |
| m5 | canonical | M5 | M5, M4 | yes |
| m5 | paraphrase | M5 | M5, M4 | yes |
| m5 | reversed | M5 | M4, M5 | yes |
| m6 | canonical | M6 | M6, M1 | yes |
| m6 | paraphrase | M6 | M6, M1 | yes |
| m6 | reversed | M6 | M6, M7 | yes |

## Limits

This is a same-author synthetic stress test, intentionally challenging recency and keyword matching. No independent reviewer, real conversation distribution, downstream agent continuation, belief update, self-awareness, or successful execution was measured. No claims about consciousness are inferred from an operational capability record.

Three-card packets and two-card method suggestions preserve source text, role, scope, and lifecycle. Character counts measure selected record text only, excluding references and metadata; they are not token savings. Eligibility, pins, and dependency closure are identical in all selection conditions. Incompatible scopes and superseded records are excluded by code, so those successes cannot be credited to Jev.

No memory archive was deleted, no action was executed, and no native host context was replaced. Same-source pointers can always recover omitted material. Policy and cases were frozen before inference; no threshold was tuned on these results.
