// src/starme/state/events.ts
// Single event channel, replacing the Kotlin Channel<StarEvent>. The host
// subscribes once and turns events into navigation / snackbars.
export type StarEvent =
  | { type: 'Toast'; message: string }
  | { type: 'Error'; message: string }
  | { type: 'SubscribeComplete' }
  | { type: 'OrderCreated' }
  | { type: 'RenderComplete' }
  | { type: 'RetakeRequested' }
  | { type: 'CreditsToppedUp' }
  | { type: 'AccessGranted' }
  | { type: 'SessionExpired' }
  | { type: 'ConsentRequired' };

type Listener = (e: StarEvent) => void;
const listeners = new Set<Listener>();

export const emitStarEvent = (e: StarEvent) => {
  for (const l of listeners) l(e);
};

export const onStarEvent = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
