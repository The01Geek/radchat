import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Newer Node versions define their own global `localStorage`, which can shadow
 * jsdom's and is unusable without a backing file. Install a small in-memory
 * Storage when the global one is missing or broken.
 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

function storageWorks(): boolean {
  try {
    const s = globalThis.localStorage;
    if (!s) return false;
    s.setItem('__radchat_probe__', '1');
    s.removeItem('__radchat_probe__');
    return true;
  } catch {
    return false;
  }
}

if (!storageWorks()) {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true, writable: true });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom does not implement these; react-chatbot-kit and the widget call them.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
