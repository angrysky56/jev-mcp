"""Arm B analysis: does Jev track true counting errors?"""
import json
d=json.load(open("arm_b.json"))
j={"k00":{"noul":0.45,"score":2.57,"conf":0},"k01":{"noul":0.43,"score":2.38,"conf":0},"k02":{"noul":0.4,"score":2.57,"conf":0},"k03":{"noul":0.46,"score":2.24,"conf":0},"k04":{"noul":0.46,"score":2.36,"conf":0},"k05":{"noul":0.52,"score":2.48,"conf":0},"k06":{"noul":0.44,"score":2.7,"conf":0},"k07":{"noul":0.5,"score":2.5,"conf":0},"k08":{"noul":0.4,"score":2.81,"conf":0.01},"k09":{"noul":0.4,"score":2.77,"conf":0},"k10":{"noul":0.32,"score":3.09,"conf":0.24},"k11":{"noul":0.4,"score":2.76,"conf":0}}
json.dump(j,open("jev_arm_b.json","w"))
def rank(x):
    s=sorted(range(len(x)),key=lambda i:x[i]); r=[0]*len(x); i=0
    while i<len(s):
        k=i
        while k+1<len(s) and x[s[k+1]]==x[s[i]]: k+=1
        for m in range(i,k+1): r[s[m]]=(i+k)/2+1
        i=k+1
    return r
def spearman(a,b):
    ra,rb=rank(a),rank(b); n=len(a); ma,mb=sum(ra)/n,sum(rb)/n
    cov=sum((x-ma)*(y-mb) for x,y in zip(ra,rb)); va=sum((x-ma)**2 for x in ra)**.5; vb=sum((y-mb)**2 for y in rb)**.5
    return cov/(va*vb)
t=[c["true_errors"] for c in d["candidates"]]; ids=[c["id"] for c in d["candidates"]]
sc=[j[i]["score"] for i in ids]; no=[j[i]["noul"] for i in ids]
res={"spearman_score_vs_true_errors":round(spearman(sc,t),3),"spearman_noul_vs_true_errors":round(spearman(no,t),3),
     "noul_on_correct_tables":[j[i]["noul"] for i,e in zip(ids,t) if e==0],"noul_on_wrong_tables_range":[min(n for n,e in zip(no,t) if e>0),max(n for n,e in zip(no,t) if e>0)],
     "all_correct_accepted_at_0.5":sum(1 for n,e in zip(no,t) if e==0 and n>=0.5),"wrong_rejected_at_0.5":sum(1 for n,e in zip(no,t) if e>0 and n<0.5),
     "score_confidence_range":[min(j[i]["conf"] for i in ids),max(j[i]["conf"] for i in ids)]}
json.dump(res,open("results_b.json","w"),indent=1); print(json.dumps(res,indent=1))
