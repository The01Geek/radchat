/**
 * A minimal HTTP data source built on `fetch`.
 *
 * Endpoints, relative to `baseUrl` (all JSON):
 *
 *   POST {baseUrl}/messages
 *        body:     { conversationId, text, attachments }
 *        response: { conversationId?, blocks, sources? }
 *   GET  {baseUrl}/conversations/{id}
 *        response: { messages: ChatMessage[] }   (or a bare array)
 *   GET  {baseUrl}/conversations?page=1&pageSize=20
 *        response: { items: ConversationSummary[], total }
 *
 * Paths can be changed with `paths`, and history can be turned off with
 * `history: false` when the backend has no conversation endpoints.
 */
import type {
  Block,
  ChatDataSource,
  ChatMessage,
  ConversationPage,
  SendMessageRequest,
  SendMessageResponse,
} from '../../types';

/** Error thrown for non-2xx responses. `status` drives the default user-facing message. */
export class HttpError extends Error {
  readonly status: number;
  /** Response body text, for host-side logging. Never shown to users by RadChat. */
  readonly body: string;

  constructor(status: number, statusText: string, body = '') {
    super(`Request failed with status ${status}${statusText ? ` ${statusText}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

type HeadersValue = HeadersInit | (() => HeadersInit | Promise<HeadersInit>);

export interface FetchDataSourceOptions {
  /** Base URL of the chat API, e.g. `/api/chat` or `https://example.com/chat`. */
  baseUrl: string;
  /**
   * Extra request headers, or a function returning them (called per request,
   * so it can supply a fresh auth token).
   */
  headers?: HeadersValue;
  /** `fetch` credentials mode. Default `same-origin`. */
  credentials?: RequestCredentials;
  /** Custom fetch implementation (tests, polyfills, instrumentation). */
  fetch?: typeof fetch;
  /** Override endpoint paths (relative to `baseUrl`). */
  paths?: {
    message?: string;
    conversation?: (id: string) => string;
    conversations?: string;
  };
  /** Expose `getConversation` and `listConversations`. Default true. */
  history?: boolean;
}

const joinUrl = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

function isResponseBody(value: unknown): value is SendMessageResponse {
  return !!value && typeof value === 'object' && Array.isArray((value as { blocks?: unknown }).blocks);
}

export function createFetchDataSource(options: FetchDataSourceOptions): ChatDataSource {
  if (!options?.baseUrl) throw new Error('createFetchDataSource: baseUrl is required.');
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const paths = {
    message: options.paths?.message ?? 'messages',
    conversation: options.paths?.conversation ?? ((id: string) => `conversations/${encodeURIComponent(id)}`),
    conversations: options.paths?.conversations ?? 'conversations',
  };

  const resolveHeaders = async (): Promise<Headers> => {
    const extra = typeof options.headers === 'function' ? await options.headers() : options.headers;
    const headers = new Headers(extra);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    return headers;
  };

  const request = async <T>(path: string, init: RequestInit & { signal?: AbortSignal }): Promise<T> => {
    const headers = await resolveHeaders();
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await doFetch(joinUrl(options.baseUrl, path), {
      ...init,
      headers,
      credentials: options.credentials ?? 'same-origin',
    });
    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch {
        // ignore unreadable bodies
      }
      throw new HttpError(response.status, response.statusText, body);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };

  const source: ChatDataSource = {
    async sendMessage({ conversationId, text, attachments, signal }: SendMessageRequest) {
      const body = await request<unknown>(paths.message, {
        method: 'POST',
        body: JSON.stringify({
          conversationId,
          text,
          attachments: attachments.map(({ type, name, mimeType, size, data }) => ({ type, name, mimeType, size, data })),
        }),
        signal,
      });
      if (!isResponseBody(body)) {
        throw new Error('The chat API returned an unexpected response (expected an object with a "blocks" array).');
      }
      return {
        conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined,
        blocks: body.blocks as Block[],
        sources: Array.isArray(body.sources) ? body.sources : undefined,
      };
    },
  };

  if (options.history !== false) {
    source.getConversation = async (id, opts) => {
      const body = await request<{ messages?: ChatMessage[] } | ChatMessage[]>(paths.conversation(id), {
        method: 'GET',
        signal: opts?.signal,
      });
      if (Array.isArray(body)) return body;
      return Array.isArray(body?.messages) ? body.messages : [];
    };
    source.listConversations = async (page, pageSize, opts) => {
      const query = `page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`;
      const separator = paths.conversations.includes('?') ? '&' : '?';
      const body = await request<ConversationPage>(`${paths.conversations}${separator}${query}`, {
        method: 'GET',
        signal: opts?.signal,
      });
      const items = Array.isArray(body?.items) ? body.items : [];
      return { items, total: typeof body?.total === 'number' ? body.total : items.length };
    };
  }

  return source;
}
