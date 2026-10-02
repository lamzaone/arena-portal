import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';

// Never load dotenv: integration tests only accept an explicitly isolated fixture.
export function validateCasinoTestUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/casino_test') {
    throw new Error('Casino fixture requires a loopback casino_test database.');
  }
  return value;
}
export async function casinoFixture(value: string) {
  const pool = mysql.createPool({ uri: validateCasinoTestUrl(value), connectionLimit: 8, timezone: 'Z', supportBigNumbers: true, bigNumberStrings: true });
  const control = { random: (maximum: number) => maximum - 1, failLedger: false, failPayout: false, beforeCommit: null as null | (() => Promise<void>), profiles: async (_ids: string[]) => new Map<string, import('../steam/profiles.ts').SteamProfile>() };
  const injectedPool = {
    query: pool.query.bind(pool), execute: pool.execute.bind(pool),
    async getConnection() {
      const connection = await pool.getConnection();
      await connection.query("SET time_zone = '+00:00'");
      return new Proxy(connection, { get(target, name) {
        if (name === 'commit') return async () => { if (control.beforeCommit) await control.beforeCommit(); return target.commit(); };
        if (name === 'execute') return async (query: string, args: unknown[]) => {
          if (control.failLedger && query.includes('INSERT INTO portal_token_ledger')) throw new Error('injected ledger failure');
          if (control.failPayout && query.includes('INSERT INTO portal_token_ledger') && args.includes('casino_payout')) throw new Error('injected payout failure');
          return target.execute(query, args as Parameters<typeof target.execute>[1]);
        };
        const member = Reflect.get(target, name);
        return typeof member === 'function' ? member.bind(target) : member;
      } });
    },
  };
  Object.assign(globalThis, { __casinoTestPool: injectedPool, __casinoTestRandom: (maximum: number) => control.random(maximum), __casinoTestProfiles: (ids: string[]) => control.profiles(ids) });
  function moduleUrl(path: string) {
    const file = (extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, resolve(path, 'index.ts')]).find(existsSync);
    return file ? pathToFileURL(file).href : null;
  }
  const hooks = registerHooks({ resolve(specifier, context, next) {
    const stubs: Record<string, string> = {
      'server-only': 'export {};',
      '../steam/profiles.ts': 'export function getSteamProfiles(ids){return globalThis.__casinoTestProfiles(ids)}',
      '@/lib/data/database-pools': 'export function getGameDatabasePool(){return globalThis.__casinoTestPool} export function getPortalDatabasePool(){return globalThis.__casinoTestPool}',
      '@/lib/data/identity-catalogue': 'export async function ensureIdentityCatalogue(){} export async function getIdentityCatalogueStatus(){} export async function syncIdentityCatalogue(){}',
      '@/lib/data/staff-vip-memberships': 'export class StaffVipMembershipError extends Error {}',
      '@/lib/data/vip-membership-activation-saga': 'export async function activateVipMembershipItemWithSaga(){}',
    };
    if (specifier === 'node:crypto' && context.parentURL?.endsWith('/casino-repository.ts')) {
      return { url: 'data:text/javascript,export {createHash,randomUUID} from "node:crypto"; export function randomInt(maximum){return globalThis.__casinoTestRandom(maximum)}', shortCircuit: true };
    }
    if (stubs[specifier]) return { url: `data:text/javascript,${stubs[specifier]}`, shortCircuit: true };
    if (specifier === 'next/server') return { url: pathToFileURL(resolve('node_modules/next/server.js')).href, shortCircuit: true };
    const url = specifier.startsWith('@/') ? moduleUrl(resolve(specifier.slice(2)))
      : specifier.startsWith('.') && context.parentURL?.startsWith('file:') ? moduleUrl(fileURLToPath(new URL(specifier, context.parentURL))) : null;
    return url ? { url, shortCircuit: true } : next(specifier, context);
  } });
  return { pool, control, async close() { hooks.deregister(); await pool.end(); } };
}
