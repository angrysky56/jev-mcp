import { test } from 'node:test';
import assert from 'node:assert/strict';
import { root, readJson } from '../src/io.ts';
import { defaultModels } from '../src/provider.ts';
import { buildMethodRequest, composeMethodWorkflow } from '../src/skill-methods.ts';
import type { MethodFragment, MethodTask, MethodFit } from '../src/skill-methods.ts';

const catalog = await readJson<MethodFragment[]>(`${root}/studies/skill-methods/catalog.json`);
const cases = await readJson<MethodTask[]>(`${root}/studies/skill-methods/cases.json`);
const kiln = cases.find(c=>c.id==='kiln')!;
const fits: Record<string,MethodFit> = {separate:'adapt',hypothesize:'adapt',experiment:'adapt'};

test('source-only judgment excludes gold labels and hand-authored planner contracts',()=>{
  const request = buildMethodRequest(kiln,catalog,defaultModels.openrouter,'canonical');
  assert.ok(!JSON.stringify(request).includes(kiln.gold.reason));
  const state = request.state as {fragments:Record<string,unknown>[]};
  assert.ok(state.fragments.every(f=>!('requires' in f)&&!('provides' in f)&&'parentBoundaries' in f));
  assert.equal(Object.keys(request.questions).length,catalog.length);
});

test('composition orders dependent methods, preserves sources, and claims no execution',()=>{
  const proposal = composeMethodWorkflow(kiln,[...catalog].reverse(),fits);
  assert.equal(proposal.status,'proposed');
  assert.deepEqual(proposal.steps.map(s=>s.id),['separate','hypothesize','experiment']);
  assert.deepEqual(proposal.observedArtifacts,['raw_notes']);
  assert.ok(proposal.steps.every(s=>s.excerpt&&s.boundaries&&s.source&&s.startLine>0));
  assert.match(proposal.steps[2].boundaries,/design-only/);
});

test('missing evidence and dependency cycles remain incomplete',()=>{
  const missing = composeMethodWorkflow({...kiln,available:[]},catalog,fits);
  assert.equal(missing.status,'incomplete'); assert.equal(missing.steps.length,0);
  assert.ok(missing.blocked.some(b=>b.missing.includes('raw_notes')));
  const cyclic = catalog.map(c=>c.id==='separate'?{...c,requires:['test_protocol']}:c);
  assert.equal(composeMethodWorkflow(kiln,cyclic,fits).status,'incomplete');
});

test('a workflow must satisfy its checking obligations as well as its primary output',()=>{
  const library = cases.find(c=>c.id==='library')!;
  const task = {...library,additionalGoals:['verification_plan']};
  const proposal = composeMethodWorkflow(task,catalog,{pilot:'adapt',verify:'adapt'});
  assert.equal(proposal.status,'proposed');
  assert.deepEqual(proposal.steps.map(s=>s.id),['pilot','verify']);
  assert.equal(composeMethodWorkflow(task,catalog,{pilot:'adapt'}).status,'incomplete');
  assert.equal(composeMethodWorkflow({...task,available:['pilot_plan']},catalog,{}).status,'no_match');
});

test('no-match, uncertainty, existing artifact, and provider failure are distinct',()=>{
  assert.equal(composeMethodWorkflow(kiln,catalog,{}).status,'no_match');
  assert.equal(composeMethodWorkflow(kiln,catalog,{experiment:'need_context'}).status,'incomplete');
  assert.equal(composeMethodWorkflow({...kiln,available:['test_protocol']},catalog,{}).status,'already_available');
  assert.equal(composeMethodWorkflow(kiln,catalog).status,'provider_error');
  assert.equal(composeMethodWorkflow({...kiln,goal:null},catalog,fits).status,'incomplete');
});
