// Event-driven coalescing: no interval, and a continuous event stream cannot postpone a refresh forever.
export function createCityRefreshQueue(
  refresh,
  { delay = 100, onError = () => {} } = {},
) {
  let timer = null,
    running = false,
    requested = false,
    stopped = false;
  function schedule() {
    if (timer !== null || running || stopped || !requested) return;
    timer = setTimeout(async () => {
      timer = null;
      if (stopped) return;
      requested = false;
      running = true;
      try {
        await refresh();
      } catch (error) {
        onError(error);
      } finally {
        running = false;
        schedule();
      }
    }, delay);
  }
  return {
    request() {
      if (stopped) return;
      requested = true;
      schedule();
    },
    cancel() {
      stopped = true;
      requested = false;
      clearTimeout(timer);
      timer = null;
    },
  };
}
