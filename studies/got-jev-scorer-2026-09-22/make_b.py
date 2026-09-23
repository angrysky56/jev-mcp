"""Arm B: counting control. Deterministic text + candidate count tables with known error counts."""
import json, random
random.seed(7)
countries = ["France","Peru","Kenya","Japan","Norway","Chile"]
templates = ["Traders from {a} met buyers from {b}.","A ship left {a} bound for {b}.","The festival in {a} drew visitors from {b} and {c}.",
             "Prices in {a} rose while {b} held steady.","A delegation from {a} toured {b}."]
sents=[]
for _ in range(10):
    t=random.choice(templates); picks=[random.choice(countries) for _ in range(3)]
    sents.append(t.format(a=picks[0],b=picks[1],c=picks[2]))
text=" ".join(sents)
true={c:text.count(c) for c in countries}
cands=[]
for i,nerr in enumerate([0,0,0,1,1,1,2,2,2,3,4,4]):
    d=dict(true); wrong=random.sample(countries,nerr)
    for c in wrong: d[c]=max(0,d[c]+random.choice([-2,-1,1,2]))
    errs=sum(1 for c in countries if d[c]!=true[c])
    cands.append({"id":f"k{i:02d}","counts":d,"true_errors":errs})
random.shuffle(cands)
json.dump({"text":text,"true":true,"candidates":cands},open("arm_b.json","w"),indent=1)
print(text); print(true, sum(true.values())); print([(c["id"],c["true_errors"]) for c in cands])
