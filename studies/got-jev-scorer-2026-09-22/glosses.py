import json
C = {
 "C1": "A claim is committed only if its proof succeeds.",
 "C2": "Every registered agent receives at least one consistency check.",
 "C3": "No formalization whose fidelity was not measured can pass the gate.",
 "C4": "The monitor flags a pair of facets unless both the text channel and the scalar channel agree.",
 "C5": "If the judge is enabled but unreachable, the system raises an error instead of returning a score.",
 "C6": "Not every commit with high stated confidence was later confirmed.",
}
aud = ["logician","code_comment","ten_year_old","headline","manager","skeptic"]
G = {
 "C1": ["For any proposition, being committed to it entails that its proof is successful.",
        "// Do not commit to a claim unless its proof has succeeded.",
        "You should only believe something for real when you have a proof that it works.",
        "No proof success means no commitment.",
        "We should only commit to a claim if its proof succeeds.",
        "If the proof doesn't work, don't commit."],
 "C2": ["∀x (RegisteredAgent(x) → ∃y (ConsistencyCheck(y) ∧ Receives(x, y)))",
        "// Every registered agent must receive at least one consistency check.",
        "Every person who signs up as an agent gets checked at least one time to make sure everything is okay.",
        "Every agent gets a consistency check.",
        "All registered agents are automatically guaranteed at least one consistency check, ensuring no one is missed.",
        "Each registered agent gets one check for consistency."],
 "C3": ["For any formalization, if its fidelity has not been measured, then it cannot pass the gate.",
        "// Only formalizations with measured fidelity may pass the gate.",
        "If you didn't check how well something matches the real thing, it can't go through the gate.",
        "Unmeasured formalization fidelity cannot pass gate.",
        "A formalization can pass the gate only if its fidelity has been measured.",
        "If fidelity wasn't measured, it doesn't pass."],
 "C4": ["The monitor flags a pair of facets if and only if it is not the case that both the text channel and the scalar channel agree.",
        "// Flag the pair unless both text and scalar channels agree. Condition: textAgree && scalarAgree == false.",
        "The monitor gives a warning about two things unless both the word channel and the number channel say the same thing.",
        "Monitor flags facets unless channels agree",
        "The monitor flags a pair of facets only if the text and scalar channels do not agree.",
        "Flags facets only when text and scalar channels disagree."],
 "C5": ["If the judge is enabled but unreachable, the system raises an error rather than returning a score.",
        "// If judge is enabled but unreachable, raise error instead of returning a score.",
        "If the judge robot is turned on but can't be contacted, the computer says 'Error!' instead of giving a score.",
        "Error if judge enabled but unreachable",
        "When a judge is enabled but cannot be reached, the system will raise an error rather than returning a score.",
        "Enabled but unreachable judge? System gives error, not score."],
 "C6": ["It is false that for every commit, if it had high stated confidence then it was later confirmed.",
        "// Not all commits marked with high confidence were later verified; some were false positives.",
        "Not every time you were really sure about something did it turn out you were right.",
        "Not all high-confidence commits later confirmed.",
        "Despite high stated confidence, some commits were never confirmed, so trust but verify.",
        "Some high-confidence commits turned out to be false."],
}
# Labels written by Claude BEFORE any scorer ran. F faithful, U unfaithful, A ambiguous (excluded from primary accuracy).
L = {
 "C1": [("F",""),("F","code-comment imperative describes behaviour; direction preserved"),("A","normative 'should' + believe vs committed"),("F","contrapositive"),("A","normative 'should'"),("A","normative imperative")],
 "C2": [("F",""),("F","code-comment 'must'"),("F","loose but same quantifiers"),("U","drops 'registered': stronger"),("U","mild: adds 'automatically guaranteed' (modal strengthening)"),("U","mild: 'one check' reads as exactly one")],
 "C3": [("F",""),("F","only-measured may pass = pass->measured"),("F","loose"),("F","headline compression, natural reading same"),("F",""),("F","'doesn't' vs 'can't' pass, natural reading same")],
 "C4": [("F","biconditional reading"),("U","code condition parses as textAgree && (scalarAgree==false) by precedence"),("A","source sentence itself ambiguous: agree with each other vs each indicates agreement"),("F","keeps the same ambiguity"),("U","'only if' reverses conditional direction"),("U","'only when' reverses direction")],
 "C5": [("F",""),("F","code-comment imperative"),("F",""),("U","drops 'instead of returning a score': weaker"),("F",""),("F","")],
 "C6": [("F",""),("U","adds 'false positives': not confirmed != false"),("F","loose"),("F",""),("F","adds advice; core claim same"),("U","'turned out to be false' is stronger than unconfirmed")],
}
rows=[]
for c in C:
    for i,(g,(lab,note)) in enumerate(zip(G[c],L[c])):
        rows.append(dict(id=f"{c}_{aud[i]}",claim_id=c,claim=C[c],audience=aud[i],gloss=g,label=lab,note=note,
                         batch="6-per-call" if c in ("C1","C6") else "3-per-call"))
json.dump(rows,open("glosses_labelled.json","w"),indent=1,ensure_ascii=False)
from collections import Counter
print(len(rows),Counter(r["label"] for r in rows))
print(Counter(r["audience"] for r in rows if r["label"]=="U"))
