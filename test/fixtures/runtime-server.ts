/** Inspector-only deterministic server. Production src/server.ts has no mock switch. */
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { join } from 'node:path';
import { RuntimeStore } from '../../src/runtime-store.ts';
import { CapabilityRuntime } from '../../src/capability-runtime.ts';
import { createMcpServer } from '../../src/mcp-server.ts';
import type { Answer } from '../../src/types.ts';

if(!process.env.JEV_INSPECTOR_TEST_DIR)throw new Error('Inspector test directory required.');
const store=new RuntimeStore(join(process.env.JEV_INSPECTOR_TEST_DIR,'fixture.sqlite'));
const runtime=new CapabilityRuntime(store,{apiKey:'fixture-not-a-real-key',caller:async(_,request)=>{
  const answers:Record<string,Answer>={};
  for(const [id,q]of Object.entries(request.questions)){
    if(q.type!=='noul')throw new Error('Inspector fixture handles Noul questions only.');
    answers[id]={type:'noul',noul:0.9};
  }
  return {attempts:1,response:{model:'jev-inspector-fixture',answers,usage:{input_tokens:0,output_tokens:0,cost:0}}};
}});
await createMcpServer(runtime).connect(new StdioServerTransport());
