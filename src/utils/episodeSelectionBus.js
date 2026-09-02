const listeners = new Set();

export const subscribeEpisodeSelection = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const emitEpisodeSelection = (payload) => {
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (e) {
      // Ignore individual listener errors
    }
  });
};

