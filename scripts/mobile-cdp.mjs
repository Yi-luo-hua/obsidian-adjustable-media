import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { setTimeout as expireCall, clearTimeout as cancelExpiry } from "node:timers";

const adb = "dist/mobile-tools/platform-tools/adb.exe";
const device = process.env.VML_ANDROID_SERIAL ?? "2UCUT23C27043063";
const port = process.env.VML_ANDROID_PORT ?? "18709";
const vaultName = process.env.VML_MOBILE_VAULT ?? "adjustable-media-mobile-test";
const pid = execFileSync(adb, ["-s", device, "shell", "pidof", "md.obsidian"], { encoding: "utf8" }).trim();
if (!/^\d+$/.test(pid)) throw new Error("Open Obsidian on the Android test device");
execFileSync(adb, ["-s", device, "forward", `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`]);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
const target = targets.find(item => item.type === "page" && item.url === "http://localhost/");
if (!target) throw new Error("Obsidian WebView target missing");
const socket = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(), errors = [];
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
  const request = pending.get(message.id);
  if (request) { pending.delete(message.id); cancelExpiry(request.timer); message.error ? request.reject(message.error) : request.resolve(message.result); }
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const key = ++id, timer = expireCall(() => { pending.delete(key); reject(new Error(method + " timed out: phone may be paused")); }, 55000);
  pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }));
});
try {
  await call("Runtime.enable");
  const vault = await call("Runtime.evaluate", { expression: "app.vault.getName()", returnByValue: true });
  if (!["adjustable-media-mobile-test", "adjustable-media-tablet-test"].includes(vaultName)
    || vault.result.value !== vaultName) throw new Error("Dedicated mobile test vault required");
  const result = await call("Runtime.evaluate", { expression: await readFile(process.argv[2], "utf8"), awaitPromise: true, returnByValue: true, includeCommandLineAPI: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  if (process.env.VML_CDP_LISTENERS) {
    await call("Debugger.enable");
    const nodes = await call("Runtime.evaluate", { expression: process.env.VML_CDP_LISTENERS });
    const listeners = await call("DOMDebugger.getEventListeners", { objectId: nodes.result.objectId, depth: 0 });
    for (const listener of listeners.listeners.filter(item => /touch|pointer|click/.test(item.type))) {
      if (!listener.handler) {
        const script = await call("Debugger.getScriptSource", { scriptId: listener.scriptId });
        console.error(JSON.stringify({ ...listener, source: script.scriptSource.split("\n")[listener.lineNumber].slice(Math.max(0,listener.columnNumber-100),listener.columnNumber+7000) }));
        continue;
      }
      const source = await call("Runtime.callFunctionOn", { objectId: listener.handler.objectId, functionDeclaration: "function(){return this.toString()}", returnByValue: true });
      console.error(JSON.stringify({ type: listener.type, capture: listener.useCapture, passive: listener.passive, source: source.result.value }));
    }
  }
  // Optional native CDP input sequence, after the script has verified/prepared the test fixture.
  if (process.env.VML_CDP_ACTIONS) {
    const actions = process.env.VML_CDP_ACTIONS === "@result" ? result.result.value.actions
      : JSON.parse(await readFile(process.env.VML_CDP_ACTIONS, "utf8"));
    for (const action of actions) {
      await call(action.method, action.params);
    }
  }
  if (process.argv[3]) {
    const shot = await call("Page.captureScreenshot", { format: "png" }); await writeFile(process.argv[3], Buffer.from(shot.data, "base64"));
  }
  process.stdout.write(JSON.stringify({ result: result.result.value, errors }, null, 2) + "\n");
} finally { socket.close(); }
