import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './io.ts';
import { RuntimeStore } from './runtime-store.ts';
import { CapabilityRuntime } from './capability-runtime.ts';
import { createMcpServer } from './mcp-server.ts';

// A host that launches this server may pass only a minimal environment, so an
// exported key never reaches it. Real environment variables always win; the
// project .env only fills gaps, and a missing or unreadable file is ignored.
const envFile=join(root,'.env');
if(existsSync(envFile))try{process.loadEnvFile(envFile);}catch{}

const provider=process.env.JEV_PROVIDER??'openrouter';
if(provider!=='openrouter'&&provider!=='typesafe')throw new Error('JEV_PROVIDER must be openrouter or typesafe.');
const store=new RuntimeStore(join(process.env.JEV_DATA_DIR??join(root,'.jev'),'jev.sqlite'));
const runtime=new CapabilityRuntime(store,{provider,model:process.env.JEV_MODEL,apiKey:process.env[provider==='openrouter'?'OPENROUTER_API_KEY':'TYPESAFE_API_KEY']});
const server=createMcpServer(runtime);
await server.connect(new StdioServerTransport());
// SDK owns stdin/stdout and process shutdown; no diagnostic output enters stdout.
