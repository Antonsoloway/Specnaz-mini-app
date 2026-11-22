import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../worker/src/private-snapshot-cache.js', import.meta.url), 'utf8')
  .replace('GITHUB_ATTEMPT_TIMEOUT_MS = 1_800', 'GITHUB_ATTEMPT_TIMEOUT_MS = 20')
  .replace('GITHUB_RETRY_DELAY_MS = 220', 'GITHUB_RETRY_DELAY_MS = 1')
  .replace('CACHE_OPERATION_TIMEOUT_MS = 250', 'CACHE_OPERATION_TIMEOUT_MS = 15')
  .replace('export async function loadPrivateSnapshotCached', 'async function loadPrivateSnapshotCached');
const env = {DATA_REPO:'fixture/private', GITHUB_TOKEN:'fixture-only'};
const never = () => new Promise(() => {});
function runtime(fetch, caches) {
  const ctx = {fetch, caches, AbortController, Request, Response, Headers, setTimeout, clearTimeout,
    Date, Promise, Error, encodeURIComponent, console:{warn(){}}};
  vm.createContext(ctx);
  vm.runInContext(source + '\nthis.load = loadPrivateSnapshotCached;', ctx);
  return ctx.load;
}
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_,reject) => {
    timer=setTimeout(() => reject(new Error('test detected unbounded startup dependency')), 180);
  })]); } finally { clearTimeout(timer); }
}

test('a response with headers but a stalled body times out, retries, and releases inFlight', async () => {
  let calls=0, healthy=false;
  const load=runtime(async () => {
    calls++;
    return healthy ? new Response('{"participants":[]}') : {ok:true,text:never};
  });
  await assert.rejects(bounded(load(env)), /snapshot request timed out/);
  assert.equal(calls,2);
  healthy=true;
  assert.ok(Array.isArray((await bounded(load(env))).participants));
  assert.equal(calls,3);
});

test('a stalled edge-cache lookup cannot prevent GitHub recovery', async () => {
  const load=runtime(async () => new Response('{"participants":[]}'),
    {default:{match:never,put:async()=>{}}});
  assert.ok(Array.isArray((await bounded(load(env))).participants));
});

test('a stalled edge-cache write cannot hold a completed authenticated data load', async () => {
  const load=runtime(async () => new Response('{"participants":[]}'),
    {default:{match:async()=>null,put:never}});
  assert.ok(Array.isArray((await bounded(load(env))).participants));
});

test('a usable bounded stale snapshot survives a stalled origin body', async () => {
  const storedAt=Date.now()-90_000;
  const load=runtime(async () => ({ok:true,text:never}), {default:{
    match:async()=>new Response('{"participants":[{"name":"fixture"}]}', {
      headers:{'X-Royal-Snapshot-Stored-At':String(storedAt)}}), put:async()=>{}
  }});
  assert.equal((await bounded(load(env))).participants[0].name,'fixture');
});
