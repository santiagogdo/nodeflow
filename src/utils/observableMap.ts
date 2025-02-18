export type AddEventCallback<Key, Value> = (key: Key, value: Value) => void;
export type UpdateEventCallback<Key, Value> = (key: Key, oldValue: Value, newValue: Value) => void;
export type DeleteEventCallback<Key, Value> = (key: Key, oldValue: Value) => void;
export type ClearEventCallback<Key, Value> = (entries: [Key, Value][]) => void;

type EventType = 'add' | 'update' | 'delete' | 'clear';

export default class ObservableMap<Key, Value> extends Map<Key, Value> {
  private listeners: {
    add?: AddEventCallback<Key, Value>[];
    update?: UpdateEventCallback<Key, Value>[];
    delete?: DeleteEventCallback<Key, Value>[];
    clear?: ClearEventCallback<Key, Value>[];
  } = {};

  // Add event listener
  on(event: 'add', callback: AddEventCallback<Key, Value>): void;
  on(event: 'update', callback: UpdateEventCallback<Key, Value>): void;
  on(event: 'delete', callback: DeleteEventCallback<Key, Value>): void;
  on(event: 'clear', callback: ClearEventCallback<Key, Value>): void;
  on(event: EventType, callback: (...args: any[]) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(callback);
  }

  // Remove event listener
  off(event: 'add', callback: AddEventCallback<Key, Value>): void;
  off(event: 'update', callback: UpdateEventCallback<Key, Value>): void;
  off(event: 'delete', callback: DeleteEventCallback<Key, Value>): void;
  off(event: 'clear', callback: ClearEventCallback<Key, Value>): void;
  off(event: EventType, callback: (...args: any[]) => void): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter((cb) => cb !== callback) as any;
  }

  // Emit events to listeners
  private emit(event: 'add', key: Key, value: Value): void;
  private emit(event: 'update', key: Key, oldValue: Value, newValue: Value): void;
  private emit(event: 'delete', key: Key, oldValue: Value): void;
  private emit(event: 'clear', entries: [Key, Value][]): void;
  private emit(event: EventType, ...args: any[]): void {
    if (this.listeners[event]) {
      this.listeners[event]!.forEach((callback) => (callback as (...args: any[]) => void)(...args));
    }
  }

  // A helper method for deep comparison.
  private deepEqual(a: any, b: any): boolean {
    // Check for strict equality first.
    if (a === b) return true;

    // If either is null or not an object, they are not equal (since !== passed above).
    if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') {
      return false;
    }

    // Handle arrays.
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    // If one is an array and the other isn't, they're not equal.
    if (Array.isArray(a) !== Array.isArray(b)) {
      return false;
    }

    // Compare object keys and values.
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      // Use hasOwnProperty to avoid inherited properties.
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!this.deepEqual(a[key], b[key])) return false;
    }

    return true;
  }

  // Override methods to emit events
  set(key: Key, value: Value): this {
    const hasKey = this.has(key);
    const oldValue = this.get(key);

    super.set(key, value);

    if (!hasKey) {
      this.emit('add', key, value);
    } else if (!this.deepEqual(oldValue, value)) {
      // Only emit an update if the new value is not deeply equal to the old one.
      this.emit('update', key, oldValue!, value);
    }

    return this;
  }

  delete(key: Key): boolean {
    if (this.has(key)) {
      const oldValue = this.get(key);
      const result = super.delete(key);
      this.emit('delete', key, oldValue!);
      return result;
    }
    return false;
  }

  clear(): void {
    const entries = Array.from(this.entries());
    super.clear();
    this.emit('clear', entries);
  }
}
