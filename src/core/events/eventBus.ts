import { EventEmitter } from './eventEmitter';
import { EventType, EventPayloads } from './eventType';

export class EventBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
  }

  public clear(): void {
    this.emitter.clear();
  }

  public emit<T extends EventType>(event: T, payload?: EventPayloads[T]): void {
    this.emitter.emit(event, payload);
  }

  public on<T extends EventType>(
    event: T,
    callback: (payload?: EventPayloads[T]) => void,
  ): void {
    this.emitter.on(event, callback);
  }

  public off<T extends EventType>(
    event: T,
    callback: (payload?: EventPayloads[T]) => void,
  ): void {
    this.emitter.off(event, callback);
  }
}
