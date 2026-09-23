"""Arm A analysis: Jev formalization_fidelity vs GoT LLM scorer against Claude's pre-scoring labels."""
import json
from collections import defaultdict

rows = json.load(open("glosses_labelled.json"))
jev = json.load(open("jev_scores.json"))
llm = json.load(open("llm_scores.json"))
JEV_T, LLM_T = 0.6, 7  # pre-registered operating points


def auc(pos, neg):
    """P(random faithful scores higher than random unfaithful); ties count 0.5."""
    if not pos or not neg:
        return None
    s = sum((p > n) + 0.5 * (p == n) for p in pos for n in neg)
    return s / (len(pos) * len(neg))


out = {}
lab = [r for r in rows if r["label"] in "FU"]
for name, get, thr in [("jev", lambda i: jev[i]["noul"], JEV_T), ("llm", lambda i: llm[i], LLM_T)]:
    tp = fa = fr = tn = 0
    for r in lab:
        acc = get(r["id"]) >= thr
        f = r["label"] == "F"
        tp += acc and f; fa += acc and not f; fr += (not acc) and f; tn += (not acc) and not f
    pos = [get(r["id"]) for r in lab if r["label"] == "F"]
    neg = [get(r["id"]) for r in lab if r["label"] == "U"]
    out[name] = dict(accuracy=round((tp + tn) / len(lab), 3), faithful_accepted=f"{tp}/{tp+fr}",
                     unfaithful_rejected=f"{tn}/{tn+fa}", false_accepts=fa, false_rejects=fr, auc=round(auc(pos, neg), 3))
# best-of-6 per claim (what keep_best_n(1) would pick), ties -> list all tied
best = {}
by = defaultdict(list)
for r in rows:
    by[r["claim_id"]].append(r)
for c, rs in by.items():
    for name, get in [("jev", lambda i: jev[i]["noul"]), ("llm", lambda i: llm[i])]:
        m = max(get(r["id"]) for r in rs)
        top = [r for r in rs if get(r["id"]) == m]
        best.setdefault(c, {})[name] = {"top": [t["id"].split("_", 1)[1] for t in top], "labels": [t["label"] for t in top]}
out["best_of_6"] = best
out["unfaithful_detail"] = [{"id": r["id"], "note": r["note"], "jev": jev[r["id"]]["noul"], "jev_rel": jev[r["id"]]["rel"], "llm": llm[r["id"]]} for r in rows if r["label"] == "U"]
out["ambiguous_detail"] = [{"id": r["id"], "jev": jev[r["id"]]["noul"], "llm": llm[r["id"]]} for r in rows if r["label"] == "A"]
out["llm_score_distribution"] = {str(k): sum(1 for v in llm.values() if v == k) for k in sorted(set(llm.values()))}
out["jev_min_max_on_F"] = [min(jev[r["id"]]["noul"] for r in lab if r["label"] == "F"), max(jev[r["id"]]["noul"] for r in lab if r["label"] == "F")]
json.dump(out, open("results_a.json", "w"), indent=1)
print(json.dumps({k: out[k] for k in ("jev", "llm", "llm_score_distribution", "jev_min_max_on_F")}, indent=1))
for d in out["unfaithful_detail"]:
    print(d)
print(out["ambiguous_detail"])
for c, b in best.items():
    print(c, b)
