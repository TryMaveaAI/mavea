// Explicit, user-triggered execution for small JavaScript/TypeScript teaching snippets.
//
// Trust boundary:
//   • Generated code is never run automatically.
//   • User code runs in a dedicated, terminable Worker and never in the application window.
//   • The Worker inherits the application's CSP and has network, imports, cross-context messaging,
//     nested workers, IndexedDB, and cache APIs removed before user code starts.
//   • The Worker is destroyed at a hard deadline. Input, output, and concurrency are
//     bounded so a snippet cannot quietly consume the whole tab.
//
// Python execution is intentionally disabled in production. The former Pyodide path ran arbitrary
// Python in the privileged application window, exposing the DOM, storage, same-origin proxies, and
// the UI thread. Python can return only after it has an equally isolated, terminable runtime.

export type SandboxLang = 'js' | 'javascript' | 'ts' | 'typescript' | 'python' | 'py';

export type SandboxResult =
  { ok: true; output: string; elapsed: number } | { ok: false; error: string; elapsed: number };

export const SANDBOX_TIMEOUT_MS = 10_000;
export const MAX_SANDBOX_CODE_BYTES = 128 * 1024;
export const MAX_SANDBOX_OUTPUT_BYTES = 64 * 1024;
const MAX_CONCURRENT_JOBS = 2;
const RUNNABLE_LANGS = new Set<string>(['js', 'javascript', 'ts', 'typescript']);
let activeJobs = 0;

/** Python remains highlightable/copyable, but only the isolated JS/TS runtime is executable. */
export function isRunnableLang(lang: string | undefined): lang is SandboxLang {
  return RUNNABLE_LANGS.has((lang ?? '').toLowerCase().trim());
}

// Strip the small TypeScript subset used by teaching snippets. This is deliberately not a general
// TypeScript compiler: unsupported syntax fails honestly in the worker. Keep every rewrite narrow;
// broad regexes here can silently change executable JavaScript (for example `!`, object literals,
// or comparison operators).
function stripTypes(src: string): string {
  return src
    .replace(/^\s*(export\s+)?(interface|type)\s+\w[^=\n]*(\{[^}]*\}|=[^\n]+;?)/gm, '')
    .replace(/\)\s*:\s*[\w<>[\]|&., ]+(?=\s*\{)/g, ')')
    .replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[\w<>[\]|&., ]+(?=\s*[=;])/g, '$1 $2')
    .replace(/([,(]\s*[A-Za-z_$][\w$]*)\s*\??\s*:\s*[\w<>[\]|&., ]+(?=\s*[,)=])/g, '$1')
    .replace(/\s+as\s+[\w<>[\]|&.]+/g, '')
    .replace(/(function\s+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)\s*<[\w<>[\]|&., ]+>(?=\s*\()/g, '$1')
    .replace(/([A-Za-z_$][\w$]*|\]|\))!(?=\.|\[|\]|\)|,|;|:|\?)/g, '$1')
    .replace(/\breadonly\b\s*/g, '')
    .replace(/\b(public|private|protected|abstract)\s+/g, '');
}

function clipUtf8(value: unknown, maxBytes: number): string {
  const text = typeof value === 'string' ? value : String(value ?? '');
  const encoded = new TextEncoder().encode(text);
  if (encoded.byteLength <= maxBytes) return text;
  return new TextDecoder().decode(encoded.slice(0, maxBytes));
}

function buildWorkerSource(code: string): string {
  const payloadLimit = MAX_SANDBOX_OUTPUT_BYTES - 64;
  return `'use strict';
(function(){
  var emit=self.postMessage.bind(self);
  var NativePromise=Promise;
  var encoder=new TextEncoder();
  var decoder=new TextDecoder();
  var output='';
  var outputBytes=0;
  var truncated=false;
  var PAYLOAD_LIMIT=${payloadLimit};

  function shortPrimitive(value){
    if(value===null)return 'null';
    var type=typeof value;
    if(type==='string')return value.slice(0,8192);
    if(type==='number'||type==='boolean'||type==='bigint'||type==='undefined')return String(value);
    if(type==='function')return '[Function '+(value.name||'anonymous')+']';
    if(type==='symbol')return String(value);
    try{
      if(Array.isArray(value)){
        var items=value.slice(0,40).map(function(item){
          return item&&typeof item==='object'?'[object]':shortPrimitive(item).slice(0,512);
        });
        return '['+items.join(', ')+(value.length>40?', …':'')+']';
      }
      var keys=Object.keys(value).slice(0,30);
      return '{'+keys.map(function(key){
        var item;
        try{item=value[key];}catch(_err){item='[unreadable]';}
        var shown=item&&typeof item==='object'?'[object]':shortPrimitive(item).slice(0,512);
        return key+': '+shown;
      }).join(', ')+(Object.keys(value).length>30?', …':'')+'}';
    }catch(_err){return '[object]';}
  }

  function append(value){
    if(truncated)return;
    var text=(output?'\\n':'')+shortPrimitive(value);
    var bytes=encoder.encode(text);
    var remaining=PAYLOAD_LIMIT-outputBytes;
    if(bytes.byteLength>remaining){
      if(remaining>0)output+=decoder.decode(bytes.slice(0,remaining));
      outputBytes=PAYLOAD_LIMIT;
      truncated=true;
      return;
    }
    output+=text;
    outputBytes+=bytes.byteLength;
  }

  function capture(){
    var parts=[];
    for(var i=0;i<arguments.length;i++)parts.push(shortPrimitive(arguments[i]));
    append(parts.join('\\t'));
  }
  console.log=capture;
  console.info=capture;
  console.warn=capture;
  console.error=capture;
  console.debug=capture;

  // Some of these live on WorkerGlobalScope.prototype rather than on the global object itself, so
  // an own property only SHADOWS them — Object.getPrototypeOf(self).fetch hands the original
  // straight back. Redefine down the whole chain, wherever the name is genuinely defined.
  function lockOn(host,name,value){
    for(var target=host;target;target=Object.getPrototypeOf(target)){
      if(target!==host&&!Object.prototype.hasOwnProperty.call(target,name))continue;
      try{Object.defineProperty(target,name,{value:value,writable:false,configurable:false});}catch(_err){}
    }
  }
  function locked(name,value){lockOn(self,name,value);}
  function blockedNetwork(){throw new Error('Network access is disabled in the code sandbox.');}
  locked('fetch',function(){return NativePromise.reject(new Error('Network access is disabled in the code sandbox.'));});
  locked('XMLHttpRequest',undefined);
  locked('WebSocket',undefined);
  locked('EventSource',undefined);
  locked('WebTransport',undefined);
  locked('BroadcastChannel',undefined);
  locked('Notification',undefined);
  locked('importScripts',function(){throw new Error('Imports are disabled in the code sandbox.');});
  locked('Worker',undefined);
  locked('SharedWorker',undefined);
  locked('indexedDB',undefined);
  locked('caches',undefined);
  locked('postMessage',function(){});
  locked('close',function(){});
  // sendBeacon is egress that isn't a global — it hangs off navigator, and works in workers.
  try{if(self.navigator)lockOn(self.navigator,'sendBeacon',blockedNetwork);}catch(_err){}

  function done(result){
    if(output===''&&result!==undefined)append(result);
    emit({ok:true,output:output+(truncated?'\\n[output truncated]':'')});
  }
  function failed(error){
    var message='Unknown error';
    try{message=error&&error.message?String(error.message):String(error);}catch(_err){}
    emit({ok:false,error:message.slice(0,8192)});
  }

  try{
    var runUserCode=async function(){
${code}
    };
    var result=runUserCode();
    NativePromise.resolve(result).then(done,failed);
  }catch(error){failed(error);}
})();`;
}

function runJs(code: string): Promise<SandboxResult> {
  const t0 = performance.now();

  return new Promise<SandboxResult>((resolve) => {
    let worker: Worker | null = null;
    let workerUrl = '';
    let timerId = 0;
    let settled = false;

    const finish = (result: SandboxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timerId);
      worker?.terminate();
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data.ok !== 'boolean') return;
      const elapsed = Math.round(performance.now() - t0);
      if (data.ok) {
        finish({
          ok: true,
          output: clipUtf8(data.output, MAX_SANDBOX_OUTPUT_BYTES),
          elapsed,
        });
      } else {
        finish({
          ok: false,
          error: clipUtf8(data.error || 'Unknown error', 8192),
          elapsed,
        });
      }
    };

    try {
      workerUrl = URL.createObjectURL(
        new Blob([buildWorkerSource(code)], { type: 'text/javascript' }),
      );
      worker = new Worker(workerUrl, { name: 'mavea-code-sandbox' });
      worker.onmessage = onMessage;
      worker.onerror = () => {
        finish({
          ok: false,
          error: 'The isolated worker could not execute this snippet.',
          elapsed: Math.round(performance.now() - t0),
        });
      };
      timerId = window.setTimeout(() => {
        finish({
          ok: false,
          error: `Timed out after ${SANDBOX_TIMEOUT_MS / 1000}s`,
          elapsed: SANDBOX_TIMEOUT_MS,
        });
      }, SANDBOX_TIMEOUT_MS);
    } catch {
      finish({
        ok: false,
        error: 'This browser could not start the isolated worker.',
        elapsed: Math.round(performance.now() - t0),
      });
    }
  });
}

/** Execute only an explicitly supported language. Always resolves; never throws. */
export async function runInSandbox(code: string, lang: SandboxLang): Promise<SandboxResult> {
  const normalized = lang.toLowerCase().trim() as SandboxLang;
  if (normalized === 'python' || normalized === 'py') {
    return {
      ok: false,
      error: 'Python execution is disabled until it has a fully isolated, terminable runtime.',
      elapsed: 0,
    };
  }
  if (!RUNNABLE_LANGS.has(normalized)) {
    return { ok: false, error: `Execution is not supported for ${lang}.`, elapsed: 0 };
  }
  if (/\bimport\s*\(/.test(code)) {
    return { ok: false, error: 'Dynamic imports are disabled in the code sandbox.', elapsed: 0 };
  }
  if (new TextEncoder().encode(code).byteLength > MAX_SANDBOX_CODE_BYTES) {
    return {
      ok: false,
      error: `Code is too large to run safely (max ${MAX_SANDBOX_CODE_BYTES / 1024} KB).`,
      elapsed: 0,
    };
  }
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    return { ok: false, error: 'Two snippets are already running. Try again shortly.', elapsed: 0 };
  }

  activeJobs++;
  try {
    const source = normalized === 'ts' || normalized === 'typescript' ? stripTypes(code) : code;
    return await runJs(source);
  } finally {
    activeJobs--;
  }
}
