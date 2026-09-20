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
export const ruleSchema = z.object({
  stage:identifier.describe('Earlier stage whose answer supplies the value.'),
  question:identifier.describe('Question ID within that stage.'),
  op:z.enum(['eq','gte','lte']).describe('Exact label equality or numeric threshold comparison.'),
  value:z.union([z.string().max(100),z.number().finite()]).describe('Choice label, Noul threshold in [0,1], or Score threshold.'),
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
  rank:z.object({stage:identifier,question:identifier,direction:z.enum(['asc','desc']).describe('Numeric sort direction; missing values sort last.')}).strict().optional().describe('Optional numeric ranking after all stages.'),
  notes:z.string().max(4000).optional().describe('Authored assumptions, provenance, or adaptation rationale; not evidence of effectiveness.'),
}).strict();
export type Capability = z.infer<typeof capabilitySchema>;
export type Rule = z.infer<typeof ruleSchema>;
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
  const check = (r:Rule, numericOnly=false) => {
    const q = known.get(r.stage)?.[r.question];
    if(!q) throw new RuntimeError('invalid_reference',`Unknown or forward answer reference: ${r.stage}.${r.question}.`);
    if(q.type==='choice') {
      if(numericOnly||r.op!=='eq'||typeof r.value!=='string'||!Object.hasOwn(q.criteria,r.value))throw new RuntimeError('invalid_rule','Choice rules must compare an existing label using eq.');
    } else {
      const high=q.type==='noul'?1:q.criteria.length-1;
      if(typeof r.value!=='number'||r.value<0||r.value>high)throw new RuntimeError('invalid_rule',`Numeric threshold must be between 0 and ${high}.`);
    }
  };
  for(const stage of definition.stages){
    if(known.has(stage.id))throw new RuntimeError('duplicate_stage',`Duplicate stage ${stage.id}.`);
    stage.when?.forEach(r=>check(r));known.set(stage.id,stage.questions);
  }
  definition.select?.forEach(r=>check(r));
  if(definition.rank)check({...definition.rank,op:'gte',value:0},true);
  return definition;
}
export function answerValue(answer?:Answer):string|number|undefined {
  return answer?.type==='choice'?answer.choice:answer?.type==='noul'?answer.noul:answer?.type==='score'?answer.score:undefined;
}
export function matches(rule:Rule,answers:Record<string,Record<string,Answer>>):boolean {
  const value=answerValue(answers[rule.stage]?.[rule.question]);
  if(value===undefined)return false;
  if(rule.op==='eq')return value===rule.value;
  return typeof value==='number'&&typeof rule.value==='number'&&(rule.op==='gte'?value>=rule.value:value<=rule.value);
}
