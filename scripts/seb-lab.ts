// Integration laboratory only: allows a VM and remote automation. Never use this
// configuration as an exam security policy or enable strict mode from its result.
import express from "express";
import { encodeSebConfig } from "../src/server/seb.ts";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "../src/server/app.ts";
import { terminateProcesses } from "../src/server/process.ts";
import { problems } from "../src/server/questions.ts";

const port = Number(process.env.SPARR_SEB_LAB_PORT ?? 4352);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid lab port");
const origin = `http://127.0.0.1:${port}`;
const dir = resolve(".data/seb-lab");
await mkdir(dir, { recursive: true, mode: 0o700 });
const resultsPath = resolve(dir, `results-${Date.now()}.jsonl`);
const ctx = await createApp({ dataDir: resolve(dir, "app-data") });
ctx.store.put("settings", "local", {
  provider: "claude",
  model: "",
  baseUrl: "http://127.0.0.1:11434",
});
const settings: Record<string, string | number | boolean> = {
  startURL: origin + "/__seb_lab",
  quitURL: origin + "/__seb_lab/quit",
  quitURLConfirm: false,
  quitURLRestart: false,
  sebConfigPurpose: 0,
  allowVirtualMachine: true,
  allowScreenSharing: true,
  screenSharingMacEnforceBlocked: false,
  allowScreenCapture: true,
  allowWindowCapture: true,
  blockScreenShotsLegacy: false,
  allowSwitchToApplications: true,
  allowQuit: true,
  allowPreferencesWindow: true,
  detectAccessibilityApps: false,
  detectStoppedProcess: false,
  enableAppSwitcherCheck: false,
  allowWlan: false,
  browserMediaCaptureMicrophone: true,
  browserMediaCaptureCamera: true,
  allowDownUploads: false,
  allowDisplayMirroring: false,
  allowedDisplaysMaxNumber: 1,
  allowedDisplayBuiltinEnforce: false,
  enableJavaScript: true,
  browserWindowWebView: 3,
  sendBrowserExamKey: true,
  enableBrowserWindowToolbar: true,
  browserWindowAllowReload: true,
  browserWindowAllowAddressBar: false,
  allowBrowsingBackForward: true,
  URLFilterEnable: false,
  hashedAdminPassword: "",
  hashedQuitPassword: "",
};
await writeFile(resolve(dir, "sparr-lab.seb"), encodeSebConfig(settings), {
  mode: 0o600,
});
let quitRequested = false;
const events: { at: string; event: string; details: unknown }[] = [];
ctx.app.use("/__seb_lab", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (
    req.method === "POST" &&
    (req.headers["x-sparr-client"] !== "web" ||
      (req.headers.origin && req.headers.origin !== origin))
  )
    return res.status(403).end();
  next();
});
ctx.app.post("/__seb_lab/event", async (req, res) => {
  if (
    typeof req.body?.event !== "string" ||
    JSON.stringify(req.body).length > 12000
  )
    return res.status(400).end();
  const entry = {
    at: new Date().toISOString(),
    event: req.body.event.slice(0, 100),
    details: req.body.details,
  };
  await appendFile(resultsPath, JSON.stringify(entry) + "\n", { mode: 0o600 });
  events.push(entry);
  if (events.length > 200) events.shift();
  res.json({ saved: true });
});
ctx.app.get("/__seb_lab/status", (_req, res) =>
  res.json({ quit: quitRequested, events }),
);
ctx.app.post("/__seb_lab/quit", (req, res) => {
  quitRequested = true;
  res.json({ requested: true });
});
// Reference solutions are exposed ONLY by this development server, never by
// the ordinary application. Match the selected exercise after adaptation.
ctx.app.get("/__seb_lab/reference/:id", (req, res) => {
  const problem = problems.find((p) => p.id === req.params.id);
  if (!problem?.reference?.python)
    return res
      .status(404)
      .json({ error: "No coding fixture for this question" });
  res.json({ code: problem.reference.python });
});
ctx.app.get("/__seb_lab", (_req, res) =>
  res
    .type("html")
    .send(
      `<!doctype html><html><head><meta charset="utf-8"><title>Sparr · SEB integration lab</title><style>body{font:17px system-ui;max-width:850px;margin:45px auto;background:#f5f7ff;color:#17223b}button,a{font:inherit;padding:12px;margin:6px}pre{white-space:pre-wrap;background:white;padding:20px;border-radius:12px}</style></head><body><h1>Sparr · SEB integration lab</h1><p>Development test only. Virtual machines and remote automation are allowed here. This is not a verified strict interview.</p><button id="run">Run coding-agent check</button><button id="media">Check camera and microphone</button><a href="/practice">Open Sparr workspace</a><button id="exit">Finish and exit SEB</button><pre id="output">Checking browser…</pre><script src="/__seb_lab/test.js"></script></body></html>`,
    ),
);
ctx.app.get("/__seb_lab/test.js", (_req, res) =>
  res.type("js").send(`
const output=document.getElementById('output'); let sessionId; let busy=false;
const show=x=>output.textContent=typeof x==='string'?x:JSON.stringify(x,null,2);
const call=async(path,body)=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Sparr-Client':'web'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||r.status);return j};
const event=(event,details)=>call('/__seb_lab/event',{event,details});
const seb=window.SafeExamBrowser;
const record=()=>{const details={userAgent:navigator.userAgent,apiPresent:!!seb,version:seb?.version,configKeyPresent:typeof seb?.security?.configKey==='string'&&seb.security.configKey.length===64,browserExamKeyPresent:typeof seb?.security?.browserExamKey==='string'&&seb.security.browserExamKey.length===64};show(details);event('browser',details).catch(e=>show(e.message))};
if(seb?.security?.updateKeys)seb.security.updateKeys(record);else record();
document.getElementById('run').onclick=async()=>{
  if(busy)return;busy=true;show('Running a real coding exercise and requesting Claude Code feedback…');
  try{
    const started=await call('/api/sessions',{track:'swe',difficulty:'foundation',durationMinutes:10,mode:'practice',stage:'oa'});
    sessionId=started.session.id;
    const fixtureResponse=await fetch('/__seb_lab/reference/'+encodeURIComponent(started.question.id));
    if(!fixtureResponse.ok)throw Error('No coding fixture for '+started.question.id);
    const fixture=await fixtureResponse.json();
    const answer=await call('/api/sessions/'+sessionId+'/answer',{answer:'Synthetic integration check using a reviewed reference implementation. This automated check does not supply a candidate explanation of the invariant or complexity.',code:fixture.code,language:'python',requestId:crypto.randomUUID()});
    const a=answer.session.assessments[0];
    const details={sessionId,questionId:started.question.id,provider:answer.session.provider,passed:a.run?.passed,total:a.run?.total,agentFeedback:a.evidence.some(item=>item.startsWith('AI interpretation:')),feedback:a.feedback,followup:answer.session.messages.at(-1)?.content,providerNotice:answer.providerNotice};
    await event('coding-agent',details);
    const finished=await call('/api/sessions/'+sessionId+'/finish',{});
    await event('session-finished',{sessionId,status:finished.session.status,reportPresent:!!finished.session.report});
    if(!details.total||details.passed!==details.total||!details.agentFeedback||details.providerNotice)throw Error('Coding-agent check failed; inspect the recorded execution and provider evidence.');
    show({check:'passed',...details});
  }catch(e){show(e.message);await event('error',{message:e.message})}finally{busy=false}
};
document.getElementById('media').onclick=async()=>{
  if(busy)return;busy=true;let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
    const details={videoTracks:stream.getVideoTracks().length,audioTracks:stream.getAudioTracks().length};
    await event('media',details);show(details);
  }catch(e){show(e.message);await event('media-error',{name:e.name,message:e.message})}
  finally{if(stream){stream.getTracks().forEach(t=>t.stop());await event('media-released',{states:stream.getTracks().map(t=>({kind:t.kind,state:t.readyState}))})}busy=false}
};
let exiting=false;async function exit(){if(busy||exiting)return;exiting=true;if(sessionId)await call('/api/sessions/'+sessionId+'/finish',{});await event('exit-requested',{sessionId});window.location.assign('/__seb_lab/quit')};document.getElementById('exit').onclick=()=>exit().catch(e=>show(e.message));setInterval(async()=>{try{const s=await(await fetch('/__seb_lab/status')).json();if(s.quit)await exit()}catch{}},1000);
`),
);
ctx.app.use(express.static(resolve("dist/client")));
ctx.app.get("/{*path}", (_req, res) =>
  res.sendFile(resolve("dist/client/index.html")),
);
const server = ctx.app.listen(port, "127.0.0.1", () =>
  console.log(
    `SEB lab: ${origin}/__seb_lab\nConfig: ${resolve(dir, "sparr-lab.seb")}\nResults: ${resultsPath}\nVM exception applies only to this test config.`,
  ),
);
function stop() {
  terminateProcesses();
  server.close(() => {
    ctx.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", terminateProcesses);
