import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import { thumbnailSignature, type WeaponThumbnail } from "./weapon-thumbnail.ts";

export type ThumbnailTicket = { key: string; status: "ready" | "queued" | "busy" | "unavailable"; retryAfterMs: number };
type Options = { directory: string; render: (item: WeaponThumbnail) => Promise<Buffer>; groupForItem?: (item: WeaponThumbnail) => string; renderLanes?: 1 | 2; laneForItem?: (item: WeaponThumbnail) => number; maxPending?: number; retryMs?: number; maxBytes?: number; maxNewPerHour?: number };
type Job = { item: WeaponThumbnail; owner: string; requestedAt: number; lane: number };
type QueuedJob = [string, Job];
export function createThumbnailCache({ directory, render, groupForItem, renderLanes = 1, laneForItem, maxPending = 128, retryMs = 60000, maxBytes = 512 * 1024 * 1024, maxNewPerHour = 240 }: Options) {
  if (renderLanes !== 1 && renderLanes !== 2) throw new Error("Thumbnail render lanes must be 1 or 2");
  const jobs = new Map<string, Job>();
  const failures = new Map<string,number>();
  const owners = new Map<string,{since:number;count:number}>();
  const waiters = new Map<string, Set<() => void>>();
  const workers: Array<Promise<void> | undefined> = Array(renderLanes).fill(undefined);
  let diskIndex: Map<string,{size:number;time:number}> | undefined;
  let diskBytes = 0;
  async function reserveDisk(bytes:number) {
    if(bytes>maxBytes)throw new Error("Thumbnail exceeds cache budget");
    if(!diskIndex) {
      const index = new Map<string, { size: number; time: number }>();
      let bytes = 0;
      for(const name of await readdir(directory)) {
        if(!/^[a-f0-9]{64}\.webp$/.test(name))continue;
        const info=await stat(join(directory,name)).catch(()=>null);
        if(info){index.set(name.slice(0,-5),{size:info.size,time:info.mtimeMs});bytes+=info.size;}
      }
      diskIndex=index; diskBytes=bytes;
    }
    if (diskBytes+bytes>maxBytes) {
      for(const [key,file] of [...diskIndex].sort((a,b)=>a[1].time-b[1].time)) {
        if(diskBytes+bytes<=maxBytes)break;
        await unlink(pathFor(key)).catch(error=>{if(error.code!=="ENOENT")throw error;});
        diskIndex.delete(key); diskBytes-=file.size;
      }
    }
  }
  let publishing = Promise.resolve();
  const pathFor = (key: string) => join(directory, `${key}.webp`);
  async function exists(key: string) { try { return (await stat(pathFor(key))).size > 0; } catch { return false; } }
  function publish(key: string, buffer: Buffer) {
    // Rendering can overlap across lanes; eviction and index/file publication
    // share one disk budget and must commit in order.
    const written = publishing.then(async () => {
      let temporary: string | undefined;
      try {
        await reserveDisk(buffer.length);
        temporary = join(directory, `${key}.${randomUUID()}.tmp`);
        await writeFile(temporary, buffer);
        await rename(temporary, pathFor(key));
        diskBytes += buffer.length - (diskIndex!.get(key)?.size ?? 0);
        diskIndex!.set(key, { size: buffer.length, time: Date.now() });
      } catch (error) {
        if (temporary) await unlink(temporary).catch(() => {});
        throw error;
      }
    });
    publishing = written.catch(() => {});
    return written;
  }
  function removeJob(key: string, job: Job) {
    if (jobs.get(key) !== job) return;
    jobs.delete(key);
    for (const notify of [...(waiters.get(key) ?? [])]) notify();
  }
  function nextBatch(lane: number) {
    // Expired jobs must not choose the leading group or occupy cohort slots.
    for (const [key, job] of jobs) if (job.lane === lane && Date.now() - job.requestedAt > 10000) removeJob(key, job);
    const pending = [...jobs].filter(([, job]) => job.lane === lane).slice(0, 20);
    if (!groupForItem) return pending;
    // Each lane freezes its own oldest cohort. Matching arrivals cannot keep
    // overtaking another bucket or owner, while the other lane stays independent.
    const groups = new Map<string, typeof pending>();
    for (const entry of pending) {
      const group = groupForItem(entry[1].item);
      const members = groups.get(group);
      if (members) members.push(entry);
      else groups.set(group, [entry]);
    }
    return [...groups.values()].flat();
  }
  async function runJob([key, job]: QueuedJob) {
    try {
      if (jobs.get(key) !== job || Date.now() - job.requestedAt > 10000) return;
      // Visible cards can renew their ticket after the cohort is selected.
      if (!await exists(key)) {
        const buffer = await render(job.item);
        if (!buffer.length) throw new Error("Empty thumbnail");
        await publish(key, buffer);
      }
    } catch {
      failures.set(key, Date.now() + retryMs);
      if (failures.size > 2048) failures.delete(failures.keys().next().value!);
    } finally {
      removeJob(key, job);
    }
  }
  async function runLane(lane: number) {
    await mkdir(directory,{recursive:true});
    for (;;) {
      const batch = nextBatch(lane);
      if (!batch.length) return;
      for (const job of batch) await runJob(job);
    }
  }
  function start(lane: number) {
    if (workers[lane]) return;
    workers[lane] = runLane(lane).catch(()=>{
      for (const [key, job] of jobs) if (job.lane === lane) {
        failures.set(key,Date.now()+retryMs);
        removeJob(key, job);
      }
    }).finally(()=>{
      workers[lane]=undefined;
      if ([...jobs.values()].some(job => job.lane === lane)) start(lane);
    });
  }
  return {
    async request(item: WeaponThumbnail, owner: string): Promise<ThumbnailTicket> {
      const key = createHash("sha256").update(thumbnailSignature(item)).digest("hex");
      if (await exists(key)) return { key,status:"ready",retryAfterMs:0 };
      if ((failures.get(key) ?? 0) > Date.now()) return { key,status:"unavailable",retryAfterMs:retryMs };
      const queued=jobs.get(key);
      if (queued) { queued.requestedAt=Date.now(); return { key,status:"queued",retryAfterMs:500 }; }
      if (jobs.size >= maxPending || [...jobs.values()].filter(job=>job.owner===owner).length >= 48) return { key,status:"busy",retryAfterMs:3000 };
      const now=Date.now();
      for(const [id,budget] of owners) if(now-budget.since>=3600000)owners.delete(id);
      const budget=owners.get(owner)??{since:now,count:0};
      if(budget.count>=maxNewPerHour || (!owners.has(owner)&&owners.size>=4096))return {key,status:"busy",retryAfterMs:Math.max(60000,3600000-(now-budget.since))};
      const lane = renderLanes === 1 ? 0 : laneForItem?.(item) ?? 0;
      if (!Number.isInteger(lane) || lane < 0 || lane >= renderLanes) throw new Error("Invalid thumbnail render lane");
      budget.count++;owners.set(owner,budget);
      jobs.set(key,{ item,owner,requestedAt:now,lane }); start(lane);
      return { key,status:"queued",retryAfterMs:500 };
    },
    async read(key: string): Promise<Buffer | null> {
      if (!/^[a-f0-9]{64}$/.test(key)) return null;
      try { return await readFile(pathFor(key)); } catch { return null; }
    },
    waitForAny(keys: readonly string[], signal: AbortSignal, maxWaitMs: number): Promise<void> {
      const unique = [...new Set(keys)];
      const delay = Math.min(5000, Math.max(0, maxWaitMs || 0));
      if (!unique.length || signal.aborted || !delay || unique.some(key => !jobs.has(key))) return Promise.resolve();
      return new Promise(resolve => {
        let finished = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          signal.removeEventListener("abort", finish);
          for (const key of unique) {
            const listeners = waiters.get(key);
            listeners?.delete(finish);
            if (!listeners?.size) waiters.delete(key);
          }
          resolve();
        };
        for (const key of unique) {
          const listeners = waiters.get(key) ?? new Set();
          listeners.add(finish); waiters.set(key, listeners);
        }
        signal.addEventListener("abort", finish, { once: true });
        timeout = setTimeout(finish, delay);
        // Registration and the final state check cover completion/abort races.
        if (signal.aborted || unique.some(key => !jobs.has(key))) finish();
      });
    },
    async drain() { while (workers.some(Boolean)) await Promise.all(workers); },
  };
}
