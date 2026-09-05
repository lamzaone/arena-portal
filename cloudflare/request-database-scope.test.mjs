import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestDatabaseScope } from './request-database-scope.mjs';

function executionContext() {
  const pending = [];
  return { waitUntil(promise) { pending.push(promise); }, async finish() { await Promise.all(pending); } };
}

test('concurrent requests never reuse another request database pool', async () => {
  const target = {};
  const scope = createRequestDatabaseScope(target);
  const seen = [];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const handler = scope.wrapFetch(async request => {
    const registry = target.__arenaDatabasePoolRegistry ??= { pools: new Map() };
    registry.pools.set('database', { owner: request.url, async end() {} });
    seen.push(registry);
    if (seen.length === 2) release();
    await barrier;
    assert.equal(target.__arenaDatabasePoolRegistry.pools.get('database').owner, request.url);
    return new Response('ok');
  });
  const a = executionContext(), b = executionContext();
  const responses = await Promise.all([handler(new Request('https://test/a'), {}, a), handler(new Request('https://test/b'), {}, b)]);
  await Promise.all(responses.map(r => r.text()));
  await Promise.all([a.finish(), b.finish()]);
  assert.notEqual(seen[0], seen[1]);
});

test('keeps pools alive through streamed rendering then closes once', async () => {
  const target = {};
  const scope = createRequestDatabaseScope(target);
  const ctx = executionContext();
  let streamController, closed = 0;
  const handler = scope.wrapFetch(async () => {
    (target.__arenaDatabasePoolRegistry ??= { pools: new Map() }).pools.set('db', { async end() { closed++; } });
    return new Response(new ReadableStream({ start(c) { streamController = c; } }), { status: 201, headers: { 'set-cookie': 'session=test; HttpOnly', 'x-check': 'kept' } });
  });
  const response = await handler(new Request('https://test'), {}, ctx);
  assert.equal(closed, 0);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('set-cookie'), 'session=test; HttpOnly');
  const text = response.text();
  streamController.enqueue(new TextEncoder().encode('rendered'));
  streamController.close();
  assert.equal(await text, 'rendered');
  await ctx.finish();
  assert.equal(closed, 1);
});

test('closes pools when handler throws without replacing the original error', async () => {
  const target = {}, ctx = executionContext();
  const scope = createRequestDatabaseScope(target);
  let closed = 0;
  const failure = new Error('render failed');
  const handler = scope.wrapFetch(async () => {
    (target.__arenaDatabasePoolRegistry ??= { pools: new Map() }).pools.set('db', { async end() { closed++; } });
    throw failure;
  });
  await assert.rejects(handler(new Request('https://test'), {}, ctx), error => error === failure);
  await ctx.finish();
  assert.equal(closed, 1);
});

test('redirect without body preserves headers and closes pools', async () => {
  const target = {}, ctx = executionContext();
  const scope = createRequestDatabaseScope(target);
  let closed = 0;
  const response = await scope.wrapFetch(async () => {
    (target.__arenaDatabasePoolRegistry ??= { pools: new Map() }).pools.set('db', { async end() { closed++; } });
    return new Response(null, { status: 307, headers: { location: '/players/test', 'set-cookie': 'session=test; Secure; HttpOnly' } });
  })(new Request('https://test'), {}, ctx);
  await ctx.finish();
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), '/players/test');
  assert.equal(response.headers.get('set-cookie'), 'session=test; Secure; HttpOnly');
  assert.equal(closed, 1);
});

test('client cancellation closes database pools', async () => {
  const target = {}, ctx = executionContext();
  const scope = createRequestDatabaseScope(target);
  let closed = 0, cancelled = false;
  const response = await scope.wrapFetch(async () => {
    target.__arenaDatabasePoolRegistry.pools.set('db', { async end() { closed++; } });
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  })(new Request('https://test'), {}, ctx);
  await response.body.cancel();
  await ctx.finish();
  assert.equal(cancelled, true);
  assert.equal(closed, 1);
});

test('delayed stream rendering retains the originating request registry', async () => {
  const target = {}, ctx = executionContext();
  const scope = createRequestDatabaseScope(target);
  let releaseRender, closed = 0;
  const gate = new Promise(resolve => { releaseRender = resolve; });
  const response = await scope.wrapFetch(async () => {
    target.__arenaDatabasePoolRegistry.pools.set('db', { owner: 'original', async end() { closed++; } });
    return new Response(new ReadableStream({ async pull(controller) {
      await gate;
      assert.equal(closed, 0);
      controller.enqueue(new TextEncoder().encode(target.__arenaDatabasePoolRegistry.pools.get('db').owner));
      controller.close();
    } }));
  })(new Request('https://test'), {}, ctx);
  const text = response.text();
  releaseRender();
  assert.equal(await text, 'original');
  await ctx.finish();
  assert.equal(closed, 1);
});

test('stream failure reaches the client and still closes pools', async () => {
  const target = {}, ctx = executionContext();
  const scope = createRequestDatabaseScope(target);
  const failure = new Error('stream rendering failed');
  let closed = 0;
  const response = await scope.wrapFetch(async () => {
    target.__arenaDatabasePoolRegistry.pools.set('db', { async end() { closed++; } });
    return new Response(new ReadableStream({ pull(controller) { controller.error(failure); } }));
  })(new Request('https://test'), {}, ctx);
  await assert.rejects(response.text(), error => error === failure);
  await ctx.finish();
  assert.equal(closed, 1);
});
