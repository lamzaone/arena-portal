import { validateHeartbeat, type Heartbeat } from "./protocol.ts";

const MAX_BODY_BYTES = 64 * 1024;
const BODY_DEADLINE_MS = 5_000;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

type HeartbeatDependencies = {
  secret: string | undefined;
  serverId: string | undefined;
  save(heartbeat: Heartbeat): Promise<boolean>;
  now: number | (() => number);
};

class BodyReadError extends Error {
  readonly status: 400 | 408 | 413;

  constructor(status: 400 | 408 | 413) {
    super("Heartbeat body could not be read.");
    this.status = status;
  }
}

function json(body: unknown, status: number, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function bearerMatches(header: string | null, secret: string): Promise<boolean> {
  const match = header?.match(/^Bearer ([^\s]+)$/);
  const supplied = match?.[1] ?? "";
  const [suppliedDigest, expectedDigest] = await Promise.all([digest(supplied), digest(secret)]);
  let difference = match ? 0 : 1;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= suppliedDigest[index] ^ expectedDigest[index];
  }
  return difference === 0;
}

async function readWithDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadline: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new BodyReadError(408);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BodyReadError(408)), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) throw new BodyReadError(400);
    if (length > MAX_BODY_BYTES) throw new BodyReadError(413);
  }
  if (!request.body) throw new BodyReadError(400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const deadline = Date.now() + BODY_DEADLINE_MS;
  try {
    while (true) {
      const result = await readWithDeadline(reader, deadline);
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_BODY_BYTES) throw new BodyReadError(413);
      chunks.push(result.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof BodyReadError) throw error;
    throw new BodyReadError(400);
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function handleHeartbeat(
  request: Request,
  dependencies: HeartbeatDependencies,
): Promise<Response> {
  const { secret, serverId, save } = dependencies;
  if (!secret || !serverId) {
    return json({ error: "Heartbeat ingestion unavailable." }, 503);
  }
  if (new URL(request.url).protocol !== "https:") {
    return json({ error: "HTTPS is required." }, 400);
  }
  if (!(await bearerMatches(request.headers.get("authorization"), secret))) {
    return json(
      { error: "Unauthorized." },
      401,
      { "WWW-Authenticate": "Bearer" },
    );
  }

  let input: unknown;
  try {
    const bytes = await readBoundedBody(request);
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof BodyReadError && error.status === 413) {
      return json({ error: "Heartbeat payload too large." }, 413);
    }
    if (error instanceof BodyReadError && error.status === 408) {
      return json({ error: "Heartbeat body timed out." }, 408);
    }
    return json({ error: "Invalid heartbeat." }, 400);
  }

  let heartbeat: Heartbeat;
  try {
    const now = typeof dependencies.now === "function" ? dependencies.now() : dependencies.now;
    heartbeat = validateHeartbeat(input, serverId, now);
  } catch {
    return json({ error: "Invalid heartbeat." }, 400);
  }

  try {
    return json({ accepted: await save(heartbeat) }, 202);
  } catch {
    return json({ error: "Heartbeat storage unavailable." }, 503);
  }
}
