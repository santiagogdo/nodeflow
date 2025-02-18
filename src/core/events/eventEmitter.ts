export type CustomEventCallback<T> = (data?: T) => void;

export class EventEmitter {
  private listeners: { [eventName: string]: Array<CustomEventCallback<any>> } = {};

  /**
   * Subscribe to a custom event.
   */
  public on<T>(eventName: string, callback: CustomEventCallback<T>): void {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(callback);
  }

  /**
   * Unsubscribe from a custom event.
   */
  public off<T>(eventName: string, callback: CustomEventCallback<T>): void {
    if (!this.listeners[eventName]) {
      return;
    }
    this.listeners[eventName] = this.listeners[eventName].filter((cb) => cb !== callback);
  }

  /**
   * Emit (trigger) a custom event.
   */
  public emit<T>(eventName: string, data?: T): void {
    if (!this.listeners[eventName]) return;
    for (const callback of this.listeners[eventName]) {
      callback(data);
    }
  }
}
