export type RefreshCoordinator<T> = {
  run(operation: () => Promise<T>): Promise<T>;
  clear(): void;
};

export function createRefreshCoordinator<T>(): RefreshCoordinator<T> {
  let inFlight: Promise<T> | null = null;
  return {
    run(operation) {
      if (inFlight) return inFlight;
      const request = Promise.resolve().then(operation);
      inFlight = request;
      const clearRequest = () => { if (inFlight === request) inFlight = null; };
      void request.then(clearRequest, clearRequest);
      return request;
    },
    clear() {
      inFlight = null;
    },
  };
}
