// Each provider iframe owns a WebGL context. Keep room for the full inspector
// and release offscreen thumbnails instead of exceeding the browser's limit.
export function createPreviewBudget(limit: number) {
  const requests = new Map<symbol, (active: boolean) => void>();
  const update = () => {
    let index = 0;
    for (const callback of requests.values()) callback(index++ < limit);
  };
  return {
    register(id: symbol, callback: (active: boolean) => void) {
      requests.set(id, callback); update();
      return () => { requests.delete(id); update(); };
    },
    prioritize(id: symbol) {
      const callback = requests.get(id);
      if (!callback) return;
      const other = [...requests].filter(([key]) => key !== id);
      requests.clear(); requests.set(id, callback);
      for (const [key, value] of other) requests.set(key, value);
      update();
    },
  };
}
export const weaponPreviewBudget = createPreviewBudget(8);
