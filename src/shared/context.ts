import { createContext, useContext, type ReactNode } from 'react';
import type { CustomBlock, LinkClickEvent } from '../types';

/** Presentation settings shared by every message and block in one widget. */
export interface RadChatRenderContext {
  locale: string;
  currency: string;
  blockRenderers?: Record<string, (block: CustomBlock) => ReactNode>;
  onLinkClick?: (event: LinkClickEvent) => void;
}

export const DEFAULT_RENDER_CONTEXT: RadChatRenderContext = {
  locale: 'en-US',
  currency: 'USD',
};

export const RenderContext = createContext<RadChatRenderContext>(DEFAULT_RENDER_CONTEXT);

export function useRenderContext(): RadChatRenderContext {
  return useContext(RenderContext);
}
