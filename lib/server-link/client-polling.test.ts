import assert from "node:assert/strict";
import test from "node:test";

import { createVisiblePoller, type PollingEnvironment } from "./client-polling.ts";

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function fakeEnvironment(initiallyVisible = true) {
  let visible = initiallyVisible;
  let visibilityListener: (() => void) | null = null;
  let nextTimer = 1;
  const timers = new Map<unknown, { callback: () => void; delay: number }>();
  let unsubscribed = false;

  const environment: PollingEnvironment = {
    isVisible: () => visible,
    subscribeVisibility(listener) {
      visibilityListener = listener;
      return () => {
        unsubscribed = true;
        visibilityListener = null;
      };
    },
    setTimer(callback, delay) {
      const timer = nextTimer++;
      timers.set(timer, { callback, delay });
      return timer;
    },
    clearTimer(timer) {
      timers.delete(timer);
    },
  };

  return {
    environment,
    timers,
    setVisible(value: boolean) {
      visible = value;
      visibilityListener?.();
    },
    runTimer(delay: number) {
      const timer = [...timers.entries()].find(([, candidate]) => candidate.delay === delay);
      assert.ok(timer, `Expected a ${delay}ms timer.`);
      timers.delete(timer[0]);
      timer[1].callback();
    },
    wasUnsubscribed: () => unsubscribed,
  };
}

test("poller aborts its active request and releases visibility resources on cleanup", () => {
  const fake = fakeEnvironment();
  const request = deferred<string>();
  const activeSignal: { value?: AbortSignal } = {};
  const poller = createVisiblePoller({
    environment: fake.environment,
    intervalMs: 10_000,
    requestTimeoutMs: 5_000,
    request(signal) {
      activeSignal.value = signal;
      return request.promise;
    },
    onSuccess() {},
    onFailure() {},
  });

  poller.dispose();

  assert.equal(activeSignal.value?.aborted, true);
  assert.equal(fake.timers.size, 0);
  assert.equal(fake.wasUnsubscribed(), true);
});

test("poller waits while hidden and refreshes immediately when visibility returns", async () => {
  const fake = fakeEnvironment(false);
  const requests: Array<Deferred<number>> = [];
  const poller = createVisiblePoller({
    environment: fake.environment,
    intervalMs: 10_000,
    requestTimeoutMs: 5_000,
    request() {
      const request = deferred<number>();
      requests.push(request);
      return request.promise;
    },
    onSuccess() {},
    onFailure() {},
  });

  assert.equal(requests.length, 0);
  fake.setVisible(true);
  assert.equal(requests.length, 1);
  requests[0].resolve(1);
  await requests[0].promise;
  await Promise.resolve();
  assert.equal(fake.timers.size, 1);

  fake.setVisible(false);
  assert.equal(fake.timers.size, 0);
  poller.dispose();
});

test("poller reports a request failure and retains the normal interval", async () => {
  const fake = fakeEnvironment();
  const request = deferred<string>();
  const failures: unknown[] = [];
  const poller = createVisiblePoller({
    environment: fake.environment,
    intervalMs: 10_000,
    requestTimeoutMs: 5_000,
    request: () => request.promise,
    onSuccess() {},
    onFailure(error) {
      failures.push(error);
    },
  });

  const failure = new Error("network unavailable");
  request.reject(failure);
  await assert.rejects(request.promise, /network unavailable/);
  await Promise.resolve();

  assert.deepEqual(failures, [failure]);
  assert.equal(fake.timers.size, 1);
  poller.dispose();
});

test("poller aborts a hung request at its deadline and continues polling", async () => {
  const fake = fakeEnvironment();
  const signals: AbortSignal[] = [];
  const failures: unknown[] = [];
  const poller = createVisiblePoller({
    environment: fake.environment,
    intervalMs: 10_000,
    requestTimeoutMs: 5_000,
    request(signal) {
      signals.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
    onSuccess() {},
    onFailure(error) {
      failures.push(error);
    },
  });

  fake.runTimer(5_000);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(signals[0].aborted, true);
  assert.equal(failures.length, 1);
  fake.runTimer(10_000);
  assert.equal(signals.length, 2);
  poller.dispose();
});
