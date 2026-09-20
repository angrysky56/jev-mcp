import { writeFile, mkdir, access } from 'node:fs/promises';
import { root } from '../src/io.ts';
const config={mcpServers:{jev:{command:process.execPath,args:[`${root}src/server.ts`]}}};
async function writeIfMissing(path:string,text:string){
  try{await access(path);console.log(`Preserved existing ${path}`);}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await writeFile(path,text,{flag:'wx',mode:0o600});console.log(`Created ${path}`);}
}
await writeIfMissing(`${root}/.mcp.json`,JSON.stringify(config,null,2)+'\n');
await mkdir(`${root}/.codex`,{recursive:true});
await writeIfMissing(`${root}/.codex/config.toml`,[
  '[mcp_servers.jev]',
  `command = ${JSON.stringify(process.execPath)}`,
  `args = [${JSON.stringify(`${root}src/server.ts`)}]`,
  'env_vars = ["OPENROUTER_API_KEY", "TYPESAFE_API_KEY", "JEV_PROVIDER", "JEV_MODEL"]',
  'startup_timeout_sec = 20',
  'tool_timeout_sec = 180',
  '',
].join('\n'));
console.log('No key values are stored. Codex config forwards named environment variables; other hosts must configure equivalent forwarding.');
