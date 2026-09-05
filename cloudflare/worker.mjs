// Use this entry point for future OpenNext deployments (after opennext build).
import worker from '../.open-next/worker.js';
import { createRequestDatabaseScope } from './request-database-scope.mjs';
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from '../.open-next/worker.js';

const databaseScope = createRequestDatabaseScope();
export default { ...worker, fetch: databaseScope.wrapFetch(worker.fetch) };
