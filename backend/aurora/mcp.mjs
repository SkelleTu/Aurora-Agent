import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const RESOURCE_URL = String(process.env.MCP_RESOURCE_URL ?? "https://aurora-agent-o9x5.onrender.com").replace(/\/$/, "");
const OAUTH_ISSUER = String(process.env.MCP_OAUTH_ISSUER ?? "https://integrated-system-gzyu.onrender.com").replace(/\/$/, "");
const MCP_SECRET = String(process.env.MCP_OAUTH_SECRET ?? "");
const PORT = String(process.env.PORT ?? process.env.AURORA_PORT ?? "8787");

type Claims = { iss:string; aud:string; sub:string; username?:string; scope?:string; iat:number; exp:number; __token?:string };

function b64(value:string|Buffer){ return Buffer.from(value).toString("base64url"); }
function equal(a:string,b:string){ const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && crypto.timingSafeEqual(x,y); }
function token(req:IncomingMessage){ return String(req.headers.authorization ?? "").replace(/^Bearer\\s+/i,"").trim(); }

function verify(raw:string, scope?:string):Claims|null {
  if(!MCP_SECRET) return null;
  const p=raw.split(".");
  if(p.length!==3) return null;
  let h:any, c:Claims;
  try {
    h=JSON.parse(Buffer.from(p[0],"base64url").toString());
    c=JSON.parse(Buffer.from(p[1],"base64url").toString());
  } catch { return null; }
  const sig=b64(crypto.createHmac("sha256",MCP_SECRET).update(`${p[0]}.${p[1]}`).digest());
  const now=Math.floor(Date.now()/1000);
  const scopes=String(c.scope??"").split(/\\s+/).filter(Boolean);
  if(h?.alg!=="HS256" || h?.typ!=="JWT" || !equal(sig,p[2]) || c.iss!==OAUTH_ISSUER || c.aud!==RESOURCE_URL || !c.sub || c.exp<=now || c.iat>now+120) return null;
  if(scope && !scopes.includes(scope)) return null;
  return {...c,__token:raw};
}

function challenge(res:ServerResponse, scope="aura.read"){
  res.setHeader("WWW-Authenticate",`Bearer resource_metadata="${RESOURCE_URL}/.well-known/oauth-protected-resource", scope="${scope}"`);
}

function auth(req:IncomingMessage,res:ServerResponse,scope="aura.read"){
  const claims=verify(token(req),scope);
  if(!claims){ challenge(res,scope); res.statusCode=401; res.setHeader("content-type","application/json"); res.end(JSON.stringify({error:"unauthorized",error_description:"A valid OAuth access token is required."})); return null; }
  return claims;
}

async function readJson(req:IncomingMessage){
  const chunks:Buffer[]=[];
  for await(const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  if(!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function local(path:string, options:RequestInit={}){
  const response=await fetch(`http://127.0.0.1:${PORT}${path}`,{
    ...options,
    headers:{Accept:"application/json",...(options.headers??{})},
    signal:options.signal??AbortSignal.timeout(30000)
  });
  const text=await response.text();
  let result:any=null;
  try{ result=text?JSON.parse(text):null; }catch{ result={raw:text}; }
  return {ok:response.ok,status:response.status,result};
}

function textResult(value:unknown){ return {content:[{type:"text" as const,text:JSON.stringify(value)}],structuredContent:value}; }

function serverFor(claims:Claims){
  const server=new McpServer(
    {name:"aurora-agent-direct",version:"1.0.0"},
    {instructions:"Direct ChatGPT control surface for Aurora Agent. Read diagnostics before execution. Mutating tools require aura.execute."}
  );

  server.registerTool("get_health",{
    title:"Get Aurora health",
    description:"Read Aurora Agent health and configuration state.",
    inputSchema:{},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true}
  },async()=>textResult(await local("/health")));

  server.registerTool("get_capabilities",{
    title:"Get Aurora capabilities",
    description:"Read Aurora's cognition, audio, vision and creation capabilities.",
    inputSchema:{},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true}
  },async()=>textResult(await local("/api/capabilities")));

  server.registerTool("get_diagnostics",{
    title:"Get Aura bridge diagnostics",
    description:"Read Aurora's direct bridge diagnostics.",
    inputSchema:{traceId:z.string().optional()},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true}
  },async({traceId})=>textResult(await local(traceId?"/api/diagnostics/aurora?traceId="+encodeURIComponent(traceId):"/api/aura/diagnostics")));

  server.registerTool("get_live_diagnostics",{
    title:"Get Aurora live diagnostics",
    description:"Read live-session telemetry and diagnostics.",
    inputSchema:{sessionId:z.string().optional()},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true}
  },async({sessionId})=>textResult(await local(sessionId?"/api/live/diagnostics?sessionId="+encodeURIComponent(sessionId):"/api/live/diagnostics")));

  server.registerTool("chat",{
    title:"Send a message to Aurora",
    description:"Execute Aurora's native chat/agent pipeline directly.",
    inputSchema:{message:z.string().min(1),sessionId:z.string().optional()},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}
  },async({message,sessionId})=>textResult(await local("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message,sessionId})})));

  server.registerTool("execute_capability",{
    title:"Execute Aurora capability",
    description:"Run a native Aurora/Hugging Face capability directly.",
    inputSchema:{task:z.string().min(1),args:z.record(z.unknown()).optional().default({})},
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}
  },async({task,args})=>{
    if(!verify(claims.__token??"","aura.execute")) return {isError:true,content:[{type:"text",text:"aura.execute scope is required."}]};
    return textResult(await local("/api/capability",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({task,...(args??{})})}));
  });

  server.registerTool("execute_action",{
    title:"Execute Aurora action",
    description:"Execute an explicit Aurora action through its native action endpoint.",
    inputSchema:{domain:z.string().min(1),action:z.string().min(1),args:z.record(z.unknown()).optional().default({})},
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false}
  },async({domain,action,args})=>{
    if(!verify(claims.__token??"","aura.execute")) return {isError:true,content:[{type:"text",text:"aura.execute scope is required."}]};
    return textResult(await local("/api/action",{method:"POST",headers:{"content-type":"application/json","authorization:`Bearer ${claims.__token}`},body:JSON.stringify({domain,action,args})}));
  });

  return server;
}

export function registerAuroraMcp(server:any){
  server.get("/.well-known/oauth-protected-resource",(req:any,res:any)=>{
    res.json({resource:RESOURCE_URL,authorization_servers:[OAUTH_ISSUER],scopes_supported:["aura.read","aura.execute"],bearer_methods_supported:["header"],resource_documentation:RESOURCE_URL+"/mcp"});
  });

  server.all("/mcp",async(req:any,res:any)=>{
    if(req.method==="OPTIONS"){res.status(204).end();return;}
    if(req.method!=="POST"){res.setHeader("Allow","POST, OPTIONS");res.status(405).json({error:"method_not_allowed"});return;}
    const claims=auth(req,res,"aura.read");
    if(!claims)return;
    try{
      const body=await readJson(req);
      const mcp=serverFor(claims);
      const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
      await mcp.connect(transport);
      await transport.handleRequest(req,res,body);
      await transport.close();
      await mcp.close();
    }catch(error){
      if(!res.headersSent)res.status(500).json({error:"mcp_request_failed",message:error instanceof Error?error.message:"MCP request failed"});
    }
  });
}
