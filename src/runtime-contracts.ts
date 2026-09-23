import { z } from 'zod';
import type { Answer, Question } from './types.ts';

export const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).refine(s=>!['constructor','prototype','__proto__'].includes(s),'Reserved identifier').describe('Stable identifier, e.g. relevance or source_check.');
const prose = z.string().min(1).max(4000);
export const jsonValue = z.json().describe('JSON data. Use explicit fields and source references; never include API credentials.');
export const questionSchema = z.discriminatedUnion('type',[
  z.object({type:z.literal('noul').describe('Probability that a described condition holds.'),instructions:prose.describe('Complete yes/no judgment, e.g. Does item.text address context.query?'),criteria:z.object({true:prose.describe('Meaning of yes.'),false:prose.describe('Meaning of no.')}).strict().optional().describe('Optional explicit yes/no definitions.')}),
  z.object({type:z.literal('choice').describe('Select one of the supplied labels.'),instructions:prose.describe('Complete judgment to make from state.'),criteria:z.record(identifier,prose).refine(v=>Object.keys(v).length>=2&&Object.keys(v).length<=20,'Use 2–20 choice labels').describe('Labels and their meanings; include a no-match outcome when appropriate.')}),
  z.object({type:z.literal('score').describe('Expected position on ordered criteria.'),instructions:prose.describe('Independent dimension to rate.'),criteria:z.array(prose).min(2).max(8).describe('Ordered definitions from lowest to highest; resulting score ranges from 0 to length minus 1.')}),
]).describe('One typed Jev question. IDs are bookkeeping; put all meaning in instructions and criteria.');
export const questionsSchema = z.record(identifier,questionSchema).refine(v=>Object.keys(v).length>=1&&Object.keys(v).length<=16,'Use 1–16 questions').describe('Independent questions evaluated together over the same state.');
export const answerRuleSchema = z.object({
  stage:identifier.describe('Earlier stage whose answer supplies the value.'),
  question:identifier.describe('Question ID within that stage.'),
  op:z.enum(['eq','gte','lte']).describe('Exact label equality or numeric threshold comparison.'),
  value:z.union([z.string().max(100),z.number().finite()]).describe('Choice label, Noul threshold in [0,1], or Score threshold.'),
  field:z.enum(['value','confidence']).optional().describe("'value' (default) compares the answer. 'confidence' compares how concentrated the answer is, 0–1, with gte/lte: the provider's confidence for Choice/Score, or |2p−1| derived here for a Noul (which has none). Concentration is not the same as being right."),
}).strict();
export const compositeRuleSchema = z.object({
  composite:identifier.describe('Composite score defined in this capability.'),
  op:z.enum(['gte','lte']).describe('Numeric threshold comparison.'),
  value:z.number().min(0).max(1).describe('Composite threshold in [0,1].'),
}).strict();
export const ruleSchema = z.union([answerRuleSchema,compositeRuleSchema]).describe('Condition over one answer (its value or confidence) or over a composite score.');
export const expectationSchema = z.union([answerRuleSchema,compositeRuleSchema,z.object({route:identifier.describe('Expected route ID.')}).strict()]).describe('Expected answer, composite, or route.');
export const compositeSchema = z.object({
  description:z.string().max(1000).optional().describe('What the combined score means.'),
  terms:z.array(z.object({
    stage:identifier,question:identifier,
    weight:z.number().positive().max(100).describe('Relative weight; the composite is the weighted mean of normalised terms, in [0,1].'),
    label:identifier.optional().describe('Choice questions only: use the probability of this label.'),
    invert:z.boolean().optional().describe('Use 1 − value, e.g. so low relevance raises a risk score.'),
  }).strict()).min(1).max(12),
}).strict().describe('Weighted combination computed in code: Noul as is, Score divided by its top level, Choice as the probability of one label.');
export const routeSchema = z.object({
  id:identifier.describe('Route label returned for matching items, e.g. prover or human_review.'),
  when:z.array(ruleSchema).min(1).max(8).optional().describe('All must pass. Omit only on the last route to make it the default.'),
  description:z.string().max(1000).optional().describe('What the host should do with items on this route. The server itself takes no action.'),
}).strict();
export const capabilitySchema = z.object({
  name:identifier.describe('Reusable capability name, e.g. research_relevance.'),
  description:prose.describe('Purpose, intended use, and practical limitations.'),
  stages:z.array(z.object({
    id:identifier.describe('Unique stage ID.'),
    questions:questionsSchema,
    when:z.array(ruleSchema).min(1).max(8).optional().describe('All conditions must pass. Missing/skipped/error answers do not pass.'),
  }).strict()).min(1).max(4).describe('Ordered stages. Each sees item, context, and prior stage answers. Later stages can depend on earlier results.'),
  select:z.array(ruleSchema).min(1).max(8).optional().describe('All conditions must pass to select an item; omitted means all successfully completed items.'),
  composites:z.record(identifier,compositeSchema).refine(v=>Object.keys(v).length<=6,'Use at most 6 composites').optional().describe('Composite scores combining several answers with authored weights (composite-scoring pattern).'),
  routes:z.array(routeSchema).min(1).max(12).optional().describe('Ordered routes; each completed item gets the first route whose rules all pass (intent routing and confidence-gated routing). Rules may test answer confidence and composites.'),
  rank:z.union([
    z.object({stage:identifier,question:identifier,direction:z.enum(['asc','desc']).describe('Numeric sort direction; missing values sort last.')}).strict(),
    z.object({composite:identifier,direction:z.enum(['asc','desc'])}).strict(),
  ]).optional().describe('Optional numeric ranking after all stages, by one answer or by a composite.'),
  notes:z.string().max(4000).optional().describe('Authored assumptions, provenance, or adaptation rationale; not evidence of effectiveness.'),
}).strict();
export type Capability = z.infer<typeof capabilitySchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type AnswerRule = z.infer<typeof answerRuleSchema>;
export type Expectation = z.infer<typeof expectationSchema>;
type Answers = Record<string,Record<string,Answer>>;
export const itemSchema = z.object({id:identifier.describe('Unique stable item ID within a run.'),data:jsonValue}).strict();
export type WorkItem = z.infer<typeof itemSchema>;
export const recordSchema = z.object({
  id:identifier.describe('Stable record ID within its scope.'),
  scope:identifier.describe('Explicit collection or inquiry scope, e.g. skill_methods.'),
  title:z.string().min(1).max(240).describe('Short descriptive title.'),
  text:z.string().min(1).max(12000).describe('Original source passage or record text.'),
  source:z.string().min(1).max(2000).describe('Source URL, document reference, or observation identifier.'),
  kind:identifier.describe('Authored record role, e.g. source, observation, hypothesis, method, plan, concept, intention, or outcome. The supplied role is preserved.'),
  status:z.enum(['active','superseded','cancelled']).default('active').describe('Lifecycle gate; search returns active records only.'),
  metadata:jsonValue.optional().describe('Optional provenance, dates, dependencies, or imported database fields.'),
}).strict();
export type StoredRecord = z.infer<typeof recordSchema>;
export const referenceSchema = {name:identifier.describe('Saved capability name.'),version:z.number().int().positive().optional().describe('Exact version; omit to resolve latest once at the beginning of the call.')};
export const pageSchema = {limit:z.number().int().min(1).max(20).default(5).describe('Maximum results per page.'),cursor:z.string().max(3000).optional().describe('Opaque nextCursor from the same query; omit for first page.')};
export const runOptionsSchema = {
  maxCalls:z.number().int().min(1).max(64).default(32).describe('Hard preflight limit on potential model calls; each may retry once on transient HTTP errors.'),
  useCache:z.boolean().default(false).describe('Reuse successful identical requests for up to one hour; outputs clearly identify cache hits. Disable for fresh evaluation.'),
};

export class RuntimeError extends Error {
  code: string;
  constructor(code:string,message:string){super(message);this.code=code;}
}

/** Validate references and numeric domains before persisting or making network calls. */
export function validateCapability(value:unknown):Capability {
  const definition = capabilitySchema.parse(value), known = new Map<string,Record<string,Question>>();
  const question = (stage:string,id:string) => {
    const q = known.get(stage)?.[id];
    if(!q) throw new RuntimeError('invalid_reference',`Unknown or forward answer reference: ${stage}.${id}.`);
    return q;
  };
  const composites = definition.composites??{};
  const check = (r:Rule, where:'stage'|'final'='final') => {
    if('composite' in r){
      if(where==='stage')throw new RuntimeError('invalid_rule','Stage conditions cannot use composites; they are computed after all stages.');
      if(!Object.hasOwn(composites,r.composite))throw new RuntimeError('invalid_reference',`Unknown composite: ${r.composite}.`);
      return;
    }
    const q = question(r.stage,r.question);
    if(r.field==='confidence'){
      if(r.op==='eq'||typeof r.value!=='number'||r.value<0||r.value>1)throw new RuntimeError('invalid_rule','Confidence rules use gte/lte with a number in [0,1].');
    } else if(q.type==='choice') {
      if(r.op!=='eq'||typeof r.value!=='string'||!Object.hasOwn(q.criteria,r.value))throw new RuntimeError('invalid_rule','Choice rules must compare an existing label using eq.');
    } else {
      const high=q.type==='noul'?1:q.criteria.length-1;
      if(typeof r.value!=='number'||r.value<0||r.value>high)throw new RuntimeError('invalid_rule',`Numeric threshold must be between 0 and ${high}.`);
    }
  };
  for(const stage of definition.stages){
    if(known.has(stage.id))throw new RuntimeError('duplicate_stage',`Duplicate stage ${stage.id}.`);
    stage.when?.forEach(r=>check(r,'stage'));known.set(stage.id,stage.questions);
  }
  for(const [id,c] of Object.entries(composites))for(const t of c.terms){
    const q=question(t.stage,t.question);
    if(q.type==='choice'&&(!t.label||!Object.hasOwn(q.criteria,t.label)))throw new RuntimeError('invalid_composite',`Composite ${id}: a Choice term needs an existing label.`);
    if(q.type!=='choice'&&t.label)throw new RuntimeError('invalid_composite',`Composite ${id}: label applies only to Choice terms.`);
  }
  definition.select?.forEach(r=>check(r));
  const routes=definition.routes??[];
  if(new Set(routes.map(r=>r.id)).size!==routes.length)throw new RuntimeError('invalid_route','Route IDs must be unique.');
  routes.forEach((r,i)=>{if(!r.when&&i!==routes.length-1)throw new RuntimeError('invalid_route','Only the last route may omit when (the default).');r.when?.forEach(x=>check(x));});
  if(definition.rank){
    if('composite' in definition.rank){if(!Object.hasOwn(composites,definition.rank.composite))throw new RuntimeError('invalid_reference',`Unknown composite: ${definition.rank.composite}.`);}
    else if(question(definition.rank.stage,definition.rank.question).type==='choice')throw new RuntimeError('invalid_rule','Rank needs a numeric (Noul or Score) answer.');
  }
  return definition;
}
/** Check evaluation expectations against a definition without sending them anywhere. */
export function validateExpectations(definition:Capability,expected:Expectation[]):void {
  const routes=new Set((definition.routes??[]).map(r=>r.id));
  const rules=expected.filter((e):e is Rule=>!('route' in e));
  for(const e of expected)if('route' in e&&!routes.has(e.route))throw new RuntimeError('invalid_reference',`Unknown route: ${e.route}.`);
  if(rules.length)validateCapability({...definition,select:rules});
}
export function answerValue(answer?:Answer):string|number|undefined {
  return answer?.type==='choice'?answer.choice:answer?.type==='noul'?answer.noul:answer?.type==='score'?answer.score:undefined;
}
/** Provider confidence for Choice/Score; for Noul (which has none) the decisiveness |2p−1|. */
export function confidenceOf(answer?:Answer):number|undefined {
  if(!answer)return undefined;
  return answer.type==='noul'?Math.abs(2*answer.noul-1):answer.confidence;
}
/** Weighted mean of normalised terms; null when any term is missing (a composite never guesses). */
export function computeComposites(definition:Capability,answers:Answers):Record<string,number|null> {
  const out:Record<string,number|null>={};
  for(const [id,c] of Object.entries(definition.composites??{})){
    let sum=0,weight=0,missing=false;
    for(const t of c.terms){
      const a=answers[t.stage]?.[t.question],q=definition.stages.find(s=>s.id===t.stage)?.questions[t.question];
      let x:number|undefined;
      if(a?.type==='noul')x=a.noul;
      else if(a?.type==='score'&&q?.type==='score')x=a.score/(q.criteria.length-1);
      else if(a?.type==='choice'&&t.label)x=a.probabilities[t.label]??(a.choice===t.label?1:0);
      if(x===undefined||!Number.isFinite(x)){missing=true;break;}
      x=Math.min(1,Math.max(0,x));sum+=t.weight*(t.invert?1-x:x);weight+=t.weight;
    }
    out[id]=missing||!weight?null:sum/weight;
  }
  return out;
}
export function matches(rule:Rule,answers:Answers,composites:Record<string,number|null>={}):boolean {
  if('composite' in rule){
    const v=composites[rule.composite];
    return typeof v==='number'&&(rule.op==='gte'?v>=rule.value:v<=rule.value);
  }
  const answer=answers[rule.stage]?.[rule.question];
  const value=rule.field==='confidence'?confidenceOf(answer):answerValue(answer);
  if(value===undefined)return false;
  if(rule.op==='eq')return value===rule.value;
  return typeof value==='number'&&typeof rule.value==='number'&&(rule.op==='gte'?value>=rule.value:value<=rule.value);
}
/** First route whose rules all pass; a route without rules is the default. */
export function routeFor(definition:Capability,answers:Answers,composites:Record<string,number|null>):string|null {
  for(const r of definition.routes??[])if(!r.when||r.when.every(x=>matches(x,answers,composites)))return r.id;
  return null;
}
