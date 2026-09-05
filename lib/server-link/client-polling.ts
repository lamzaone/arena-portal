export type PollingEnvironment = {
  isVisible(): boolean;
  subscribeVisibility(listener: () => void): () => void;
  setTimer(callback: () => void, delay: number): unknown;
  clearTimer(timer: unknown): void;
};

export type VisiblePollerOptions<T> = {
  environment: PollingEnvironment;
  intervalMs: number;
  requestTimeoutMs: number;
  request(signal: AbortSignal): Promise<T>;
  onSuccess(value: T): void;
  onFailure(error: unknown): void;
};

export function browserPollingEnvironment(): PollingEnvironment {
  return {
    isVisible: () => document.visibilityState === "visible",
    subscribeVisibility(listener) {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
    clearTimer: (timer) => window.clearTimeout(timer as number),
  };
}

export function createVisiblePoller<T>(options: VisiblePollerOptions<T>) {
  let disposed = false;
  let timer: unknown;
  let requestNumber = 0;
  let active: {
    number: number;
    controller: AbortController;
    deadline: unknown;
    cancelled: boolean;
  } | null = null;

  const clearTimer = () => {
    if (timer === undefined) return;
    options.environment.clearTimer(timer);
    timer = undefined;
  };

  const abortActive = () => {
    if (active) {
      active.cancelled = true;
      options.environment.clearTimer(active.deadline);
      active.controller.abort();
    }
    active = null;
  };

  const schedule = () => {
    clearTimer();
    if (disposed || !options.environment.isVisible()) return;
    timer = options.environment.setTimer(() => {
      timer = undefined;
      start();
    }, options.intervalMs);
  };

  const start = () => {
    if (disposed || active || !options.environment.isVisible()) return;
    const controller = new AbortController();
    const current = {
      number: ++requestNumber,
      controller,
      deadline: options.environment.setTimer(
        () => controller.abort(new Error("Request deadline exceeded.")),
        options.requestTimeoutMs,
      ),
      cancelled: false,
    };
    active = current;
    void options.request(current.controller.signal).then(
      (value) => {
        if (!disposed && active?.number === current.number) options.onSuccess(value);
      },
      (error) => {
        if (!disposed && active?.number === current.number && !current.cancelled) {
          options.onFailure(error);
        }
      },
    ).finally(() => {
      options.environment.clearTimer(current.deadline);
      if (active?.number !== current.number) return;
      active = null;
      schedule();
    });
  };

  const unsubscribe = options.environment.subscribeVisibility(() => {
    clearTimer();
    if (!options.environment.isVisible()) {
      abortActive();
      return;
    }
    start();
  });
  start();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimer();
      abortActive();
      unsubscribe();
    },
  };
}
