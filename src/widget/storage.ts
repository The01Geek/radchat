/**
 * Small localStorage wrapper. Keys are `${prefix}:${name}`. Every access is
 * guarded because storage can be unavailable (privacy modes, sandboxed
 * iframes, quota). With `prefix === false` nothing is read or written.
 */
export interface WidgetStorage {
  get(name: string): string | null;
  set(name: string, value: string): void;
  remove(name: string): void;
  getJSON<T>(name: string): T | null;
  setJSON(name: string, value: unknown): void;
}

const NOOP_STORAGE: WidgetStorage = {
  get: () => null,
  set: () => undefined,
  remove: () => undefined,
  getJSON: () => null,
  setJSON: () => undefined,
};

export function createStorage(prefix: string | false | undefined): WidgetStorage {
  if (prefix === false) return NOOP_STORAGE;
  const base = prefix || 'radchat';
  const key = (name: string) => `${base}:${name}`;

  const get = (name: string): string | null => {
    try {
      return window.localStorage.getItem(key(name));
    } catch {
      return null;
    }
  };
  const set = (name: string, value: string) => {
    try {
      window.localStorage.setItem(key(name), value);
    } catch {
      // Storage unavailable or full; preferences simply do not persist.
    }
  };
  const remove = (name: string) => {
    try {
      window.localStorage.removeItem(key(name));
    } catch {
      // ignore
    }
  };

  return {
    get,
    set,
    remove,
    getJSON<T>(name: string): T | null {
      const raw = get(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setJSON(name: string, value: unknown) {
      set(name, JSON.stringify(value));
    },
  };
}
