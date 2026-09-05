import { AsyncLocalStorage } from 'node:async_hooks';

/** Keep mysql2 sockets owned by the request that created them, including SSR streams. */
export function createRequestDatabaseScope(target = globalThis) {
  const requests = new AsyncLocalStorage();
  Object.defineProperty(target, '__arenaDatabasePoolRegistry', {
    configurable: true,
    get() { return requests.getStore()?.registry; },
    set(registry) {
      const request = requests.getStore();
      if (!request) throw new Error('Database pools require an active Worker request.');
      request.registry = registry;
    },
  });

  return {
    wrapFetch(handler) {
      return function fetch(request, env, ctx) {
        const owner = this;
        const state = { registry: { pools: new Map() } };
        return requests.run(state, async () => {
          let cleanup;
          function closePools() {
            cleanup ??= (async () => {
              const pools = [...new Set(state.registry.pools.values())];
              state.registry.pools.clear();
              const results = await Promise.allSettled(pools.map(pool => Promise.resolve().then(() => pool.end())));
              for (const result of results) {
                if (result.status === 'rejected') {
                  console.error(JSON.stringify({ event: 'database-pool-cleanup-failed', code: result.reason?.code ?? 'UNKNOWN' }));
                }
              }
            })();
            return cleanup;
          }
          try {
            const response = await handler.call(owner, request, env, ctx);
            if (!response.body) {
              ctx.waitUntil(closePools());
              return response;
            }
            const stream = new TransformStream();
            // Do not close sockets at response-header time: Next may still be
            // querying the database while streaming the remainder of the page.
            const completion = response.body.pipeTo(stream.writable).then(closePools, closePools);
            ctx.waitUntil(completion);
            return new Response(stream.readable, response);
          } catch (error) {
            ctx.waitUntil(closePools());
            throw error;
          }
        });
      };
    },
  };
}
