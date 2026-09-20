import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readFile } from 'node:fs/promises';
import { root } from '../src/io.ts';

const [operation,inputFile]=process.argv.slice(2);
if(!operation)throw new Error('Usage: node scripts/mcp-call.ts tools/list | resources/read arguments.json | TOOL_NAME arguments.json');
const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));
const transport=new StdioClientTransport({command:process.execPath,args:[`${root}/src/server.ts`],env,stderr:'inherit'});
const client=new Client({name:'jev-script-client',version:'0.2.0'});
try{
  await client.connect(transport);
  const args=inputFile?JSON.parse(await readFile(inputFile,'utf8')):{};
  const result=operation==='tools/list'?await client.listTools():operation==='resources/read'?await client.readResource(args):await client.callTool({name:operation,arguments:args},{timeout:180000});
  console.log(JSON.stringify(result,null,2));
  if('isError' in result&&result.isError)process.exitCode=1;
}finally{await client.close();}
