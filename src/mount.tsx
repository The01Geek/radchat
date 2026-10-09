/**
 * Mount RadChat without writing React code: `mount(element, options)` renders
 * the widget into an element and returns its imperative handle plus
 * `update` and `unmount`.
 */
import { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatWidget } from './widget/ChatWidget';
import type { ChatWidgetHandle, ChatWidgetOptions, LayoutMode, OpenOptions } from './types';

export interface MountedChatWidget extends ChatWidgetHandle {
  /** Re-render with new options (merged over the current ones). */
  update(options: Partial<ChatWidgetOptions>): void;
  /** Remove the widget and abort pending requests. */
  unmount(): void;
}

export function mount(element: Element, options: ChatWidgetOptions): MountedChatWidget {
  if (!element) throw new Error('RadChat.mount: a target element is required.');
  if (!options?.dataSource || typeof options.dataSource.sendMessage !== 'function') {
    throw new Error('RadChat.mount: options.dataSource with a sendMessage function is required.');
  }

  const root = createRoot(element);
  const ref = createRef<ChatWidgetHandle>();
  let current: ChatWidgetOptions = options;
  // Calls made before React attaches the ref are replayed once it is ready.
  const queued: Array<(handle: ChatWidgetHandle) => void> = [];

  const render = () => root.render(<ChatWidget ref={ref} {...current} />);
  render();

  const withHandle = (action: (handle: ChatWidgetHandle) => void) => {
    if (ref.current) {
      action(ref.current);
      return;
    }
    queued.push(action);
    const flush = () => {
      if (!ref.current) {
        setTimeout(flush, 10);
        return;
      }
      queued.splice(0).forEach((fn) => fn(ref.current as ChatWidgetHandle));
    };
    if (queued.length === 1) setTimeout(flush, 0);
  };

  return {
    open: (openOptions?: OpenOptions) => withHandle((h) => h.open(openOptions)),
    close: () => withHandle((h) => h.close()),
    toggle: () => withHandle((h) => h.toggle()),
    isOpen: () => ref.current?.isOpen() ?? false,
    newConversation: () => withHandle((h) => h.newConversation()),
    setLayout: (layout: LayoutMode) => withHandle((h) => h.setLayout(layout)),
    update(next) {
      current = { ...current, ...next };
      render();
    },
    unmount() {
      queued.length = 0;
      root.unmount();
    },
  };
}
