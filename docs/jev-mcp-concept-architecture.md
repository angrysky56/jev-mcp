# Jev MCP: conceptual inquiry architecture

## The proposition

Build an MCP that gives an exploring agent a disciplined inquiry loop. The LLM
supplies imagination, language, and alternative hypotheses. Jev supplies fast,
structured comparisons at bounded points in the loop. A blackboard retains the
current state of inquiry. The outside world supplies evidence that can confirm,
weaken, or falsify a claim.

The aim is not to manufacture a final answer. It is to make the next step of
inquiry more useful: discover a credible hypothesis, derive a way it could
fail, and select the most informative next observation.

~~~mermaid
flowchart LR
    P[Problem or surprise] --> A[Abduction: LLM generates explanations]
    A --> J[Jev assessment: fit, integrity, feasibility, novelty]
    J --> D[Deduction: derive distinct predictions]
    D --> X[Observation or experiment]
    X --> I[Induction: update belief support]
    I --> B[Inquiry blackboard]
    B --> A
    J --> C[Challenge path: seek counter-explanation]
    C --> D
~~~

## The intellectual structure expressed mechanically

| Source concept | Runtime meaning | Required record |
| --- | --- | --- |
| Abduction | Generate several explanations for a surprise, including a mundane counter-explanation. | Hypothesis, scope, assumptions, target, defeaters. |
| Deduction | Derive observations that differ between the leading explanations. | Prediction, observation method, expected result under each hypothesis. |
| Induction | Compare predictions with observations and revise support. | Observation, source, reliability, update rationale, confidence before and after. |
| Meta-advancement | Select the question type needed next: purpose, dimensions, method, constraints, alternatives, feedback, or adaptation. | Inquiry stage, transition reason, outstanding question. |
| Baldwin effect | Separate rapid local learning from slow framework changes. | Run-level state updates; offline, versioned framework changes. |
| LAP | Make conceptualization, representation, facts, scrutiny, derivation, rules, model, and semantic formalization visible. | Typed artefact or an explicit not-applicable reason for every stage. |

The LAP formula is useful as an inquiry checklist, not a claim that all thought
must take one linear path. A transition can return to an earlier stage when new
evidence changes the problem definition.

## The blackboard is an epistemic state, not a compressed transcript

The proposed Markov tuple becomes useful only when it keeps the variables
needed for the next decision. It needs a compact working state *and* links to
an append-only ledger. The compact state makes each agent turn efficient; the
ledger prevents compaction from concealing why the state exists.

~~~json
{
  "inquiry_id": "inq_…",
  "purpose": "Explain the surprising observation",
  "stage": "deduction",
  "problem_class": {"label": "epistemic", "confidence": 0.71},
  "active_hypotheses": ["hyp_1", "hyp_2"],
  "leading_prediction": "pred_4",
  "constraints": ["preserve uncertainty", "do not act without approval"],
  "unresolved_claims": ["claim_7"],
  "contradictions": ["contradiction_2"],
  "cycle_state": {"consecutive_prunes": 1, "visited_signatures": ["…"]},
  "next_question": "Which observation would best distinguish hyp_1 from hyp_2?",
  "ledger_ref": "inquiry://records/inq_…"
}
~~~

Every claim in the ledger has a source, an evidence status, a confidence
bracket, and possible defeaters. The system must retain contradictions rather
than average them into a reassuring score.

## Jev's role: a panel of narrow sensors

Jev should not return one opaque quality number. For each candidate hypothesis,
thought path, question, or action, it returns typed, separately inspectable
signals.

| Sensor | What it asks | Interpretation |
| --- | --- | --- |
| Relevance | Does this address the active purpose and surprise? | Ranking signal. |
| Evidential integrity | Does it rely on unsupported, contradicted, or conflated claims? | Blocks unsupported promotion. |
| Discriminative value | Would the next observation distinguish real alternatives? | Favors informative tests. |
| Feasibility | Can the observation be completed under the constraints? | Ranking signal. |
| Reversibility | Is the next action safe to try and easy to undo? | Favors low-cost exploration. |
| Anomaly | Does new input challenge the current model or reveal a contradiction? | Forces scrutiny, not rejection. |
| Principle compliance | Does it violate a declared non-negotiable constraint? | A gate, never a compensable score. |

The controller owns the aggregation formula and exposes it in the record. A
high relevance score cannot compensate for an integrity failure or constraint
violation.

## Controlled emergence, not unrestricted self-modification

The LLM may propose new questions and rubrics, but it cannot make them active
silently. A **question compiler** turns a proposal into a versioned rubric
candidate with its target, definitions, allowed outputs, evidence requirements,
and expiry. The controller can then:

1. select an existing reviewed rubric;
2. run a candidate rubric in shadow mode alongside the active one; or
3. send it to a human for review before activation.

This retains the meta-advancement idea of reframing an inquiry without letting
prompt drift quietly rewrite evaluation policy.

## Search and the meaning of value

The system can use a tree, but it is not MCTS merely because it branches. True
MCTS needs a state transition model, repeated simulations, a reward, and
backpropagation. The first version is a **semantic beam search**:

1. generate several hypotheses or next questions;
2. evaluate the defined sensors;
3. preserve high-potential and deliberately dissimilar alternatives;
4. derive predictions for the survivors;
5. seek the observation with the most discriminative value; and
6. update the blackboard from its outcome.

After a domain has repeatable transitions and external outcomes, recorded
history can support a genuine MCTS or bandit experiment. Until then, calling a
Jev score a value function would hide an unproven assumption.

## Missing entities that make the loop work

| Entity | Job | Failure it prevents |
| --- | --- | --- |
| Inquiry controller | Enforces valid stage transitions and chooses when to generate, test, challenge, or pause. | A free-form loop with no accountable state machine. |
| Claim and evidence ledger | Preserves provenance, uncertainty, contradictions, and defeaters. | Context compression turning guesses into facts. |
| Prediction compiler | Converts a hypothesis into observable, discriminating consequences. | Endless explanations with no way to learn. |
| Evidence adapter | Records results from research, tools, experiments, or people with source quality. | Treating model output as ground truth. |
| Challenger | Produces counter-hypotheses, counterexamples, and pre-mortems. | Confirmation bias from generator/evaluator agreement. |
| Diversity keeper | Reserves dissimilar, reversible, or evidence-seeking branches. | Pruning every unusual but valuable line of inquiry. |
| Cycle and deadlock detector | Detects repeated state/action signatures, repeated rejection, and stalled evidence. | Infinite regeneration loops. |
| Constraint registry | Holds explicit prohibitions, approvals, budgets, and domain rules. | A score overriding a hard boundary. |
| Outcome interpreter | Maps an observed result to the predeclared prediction and records ambiguity. | Retrofitting success after the fact. |
| Adaptation supervisor | Evaluates framework changes offline on retained runs, with baselines and rollback. | Self-reinforcing online weight changes. |
| Semantic formalizer | Produces a compact model, definitions, and known limits at major transitions. | Elegant language masking undefined terms. |

## MCP boundary

The server is the auditable control plane. It exposes state, evaluation,
challenge, observation, and review; a host agent still performs ordinary work
through its own tool and approval model.

| Tool | Purpose |
| --- | --- |
| inquiry.start | Create an inquiry with a purpose, initial surprise, constraints, and success definition. |
| inquiry.propose | Record hypotheses, actions, or next questions with explicit assumptions. |
| inquiry.evaluate | Call Jev's fixed sensor panel and return all signals, blockers, and uncertainty. |
| inquiry.challenge | Generate and rank counter-explanations, counterexamples, and discriminating tests. |
| inquiry.record_observation | Attach external evidence to a prediction with provenance and quality. |
| inquiry.advance | Validate a stage transition and write the revised working state. |
| inquiry.get_state | Read the blackboard plus references to the ledger. |
| inquiry.review_adaptation | Compare a proposed framework change against outcomes; never activates it automatically. |

There is no tool for autonomous execution, declaring truth, approving an
action, overwriting history, or directly modifying production weights.

## Learning at two speeds

The Baldwin idea gives the correct distinction.

- **Within an inquiry:** the agent updates the blackboard as observations
  arrive. This is fast, reversible learning about the current problem.
- **Across inquiries:** the system may propose changes to prompts, rubrics,
  selection weights, or state fields. This is slow framework evolution and
  needs a versioned offline comparison with a baseline, held-out cases, a
  recorded rationale, and rollback.

No successful result proves the framework globally correct. It only updates
support for the tested hypothesis and for a framework version in a known
domain.

## First living prototype

Build an **inquiry laboratory** for one recurring class of conceptual problem.
A run starts with a surprise or thesis, produces competing explanations and
discriminating predictions, records evidence, and ends as supported, weakened,
unresolved, or superseded.

The initial success measures are modest and observable:

1. Does the system preserve the source and uncertainty of every consequential
   claim?
2. Does it produce a prediction that could distinguish alternatives?
3. Does the challenger find a material counter-explanation often enough to
   change the selected next step?
4. Does later review agree that the final state follows from recorded evidence?

Only after this works should the project explore more autonomous planning,
dynamic rubrics, or learned selection policies.

## First inquiry: test the central premise

The project should test its own central claim before it treats Jev as a value
function: **does a separate typed evaluator improve the quality of an agent's
inquiry over the same agent working unaided?**

Use a small set of past conceptual or research questions whose evidence and
eventual resolution can be inspected. Compare three runs over the same cases:

| Run | What it isolates |
| --- | --- |
| Host agent alone | Ordinary reasoning baseline. |
| Host agent plus fixed explicit checklist | The value of structure without Jev. |
| Host agent plus the Jev sensor panel | The incremental value of Jev's evaluations. |

Record evidence provenance, number of unsupported consequential claims,
whether a discriminating prediction was produced, whether a challenge changed
the next step, and whether later review supports the final status. Blindly
review the records where practical.

If the checklist achieves the same result as the Jev-assisted run, retain the
checklist and do not invent a model advantage. If Jev improves only speed or
triage, define its value in those terms. A model-specific claim requires a
model-specific measured advantage.
