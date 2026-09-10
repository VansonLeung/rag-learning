import { EventEmitter } from 'node:events';
export function createApplicationEventBus() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);
  return {
    publishChange(type: string, payload: unknown = {}) {
      emitter.emit('change', { type, payload });
    },
    subscribeToChanges(listener: (event: { type: string; payload: unknown }) => void) {
      emitter.on('change', listener);
      return () => emitter.off('change', listener);
    },
  };
}
export type ApplicationEventBus = ReturnType<typeof createApplicationEventBus>;
