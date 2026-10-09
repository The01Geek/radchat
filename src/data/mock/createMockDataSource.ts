/**
 * An in-memory data source with canned answers, for demos, tests and UI work
 * without a backend. It recognizes a few keywords (chart/trend, top products,
 * definition, error) and keeps conversations so History works.
 */
import type {
  Block,
  ChatDataSource,
  ChatMessage,
  ConversationSummary,
  SendMessageRequest,
  SendMessageResponse,
} from '../../types';
import {
  DEMO_SOURCES,
  definitionAnswer,
  helpAnswer,
  ordersTableAnswer,
  revenueTrendAnswer,
  topProductsAnswer,
} from './fixtures';

export interface MockDataSourceOptions {
  /** Simulated response time in milliseconds. Default 600. */
  latencyMs?: number;
  /** Add two sample past conversations so History has content. Default true. */
  seedConversations?: boolean;
  /**
   * Keep conversations in localStorage under this key so they survive a page
   * reload (useful in demos). Default: memory only.
   */
  persistKey?: string;
  /** Replace the canned answers. Return `undefined` to fall back to the defaults. */
  respond?(request: SendMessageRequest): SendMessageResponse | Block[] | undefined | Promise<SendMessageResponse | Block[] | undefined>;
}

interface StoredConversation {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

/** Error with an HTTP-like status, matching what real adapters throw. */
class MockError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MockError';
  }
}

const abortError = () => {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
  }
};

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

let idCounter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** The canned answer for a message. Exported for tests. */
export function cannedAnswer(request: Pick<SendMessageRequest, 'text' | 'attachments'>): SendMessageResponse {
  const text = request.text.trim();
  const lower = text.toLowerCase();

  if (lower.includes('error') || lower.includes('fail')) {
    throw new MockError('Simulated server error', 500);
  }

  if (lower.startsWith('/sql')) {
    const query = text.slice(4).trim() || 'select * from orders';
    return {
      blocks: [
        { type: 'text', content: `The data source received the pass-through command and ran:` },
        { type: 'text', label: 'Executed SQL', content: '```sql\n' + query + '\n```' },
        ...ordersTableAnswer(),
      ],
    };
  }

  const prefix: Block[] = [];
  if (request.attachments.length > 0) {
    const names = request.attachments.map((a) => `\`${a.name}\``).join(', ');
    prefix.push({
      type: 'text',
      content: `I received ${request.attachments.length === 1 ? 'one attachment' : `${request.attachments.length} attachments`}: ${names}. (The demo does not read file contents.)`,
    });
  }

  if (/(chart|trend|plot|graph)/.test(lower)) return { blocks: [...prefix, ...revenueTrendAnswer()] };
  if (/(top|best|product)/.test(lower)) return { blocks: [...prefix, ...topProductsAnswer()] };
  if (/(defin|mean|what is)/.test(lower)) {
    return { blocks: [...prefix, { type: 'text', content: definitionAnswer() }], sources: DEMO_SOURCES };
  }
  if (/(help|hello|hi\b|hey)/.test(lower)) return { blocks: [...prefix, { type: 'text', content: helpAnswer() }] };

  return {
    blocks: [
      ...prefix,
      {
        type: 'text',
        content: `This is a mock answer to "${text.slice(0, 120)}". Connect a real data source to get answers from your backend.\n\n${helpAnswer()}`,
      },
    ],
  };
}

function seed(): StoredConversation[] {
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const day = 24 * 60 * 60 * 1000;
  return [
    {
      id: 'demo-conversation-1',
      createdAt: iso(day + 3600_000),
      updatedAt: iso(day),
      messages: [
        { role: 'user', text: 'What are the top products?' },
        { role: 'assistant', blocks: topProductsAnswer() },
      ],
    },
    {
      id: 'demo-conversation-2',
      createdAt: iso(4 * day),
      updatedAt: iso(4 * day - 600_000),
      messages: [
        { role: 'user', text: 'How is revenue defined?' },
        { role: 'assistant', text: definitionAnswer(), sources: DEMO_SOURCES },
      ],
    },
  ];
}

export function createMockDataSource(options: MockDataSourceOptions = {}): ChatDataSource {
  const latency = Math.max(0, options.latencyMs ?? 600);

  const load = (): Map<string, StoredConversation> => {
    if (options.persistKey) {
      try {
        const raw = window.localStorage.getItem(options.persistKey);
        if (raw) {
          const list = JSON.parse(raw) as StoredConversation[];
          if (Array.isArray(list)) return new Map(list.map((c) => [c.id, c]));
        }
      } catch {
        // fall through to a fresh store
      }
    }
    const initial = options.seedConversations === false ? [] : seed();
    return new Map(initial.map((c) => [c.id, c]));
  };

  const conversations = load();
  const save = () => {
    if (!options.persistKey) return;
    try {
      window.localStorage.setItem(options.persistKey, JSON.stringify([...conversations.values()]));
    } catch {
      // ignore quota errors in the demo store
    }
  };

  return {
    async sendMessage(request) {
      await delay(latency, request.signal);

      let response: SendMessageResponse | undefined;
      const custom = await options.respond?.(request);
      if (Array.isArray(custom)) response = { blocks: custom };
      else if (custom) response = custom;
      response ??= cannedAnswer(request);

      const now = new Date().toISOString();
      let conversation = request.conversationId ? conversations.get(request.conversationId) : undefined;
      if (!conversation) {
        conversation = { id: newId('conv'), messages: [], createdAt: now, updatedAt: now };
        conversations.set(conversation.id, conversation);
      }
      conversation.messages.push(
        {
          role: 'user',
          text: request.text,
          attachments: request.attachments.map((a) => ({ type: a.type, name: a.name })),
          createdAt: now,
        },
        { role: 'assistant', blocks: response.blocks, sources: response.sources, createdAt: now },
      );
      conversation.updatedAt = now;
      save();

      return { ...response, conversationId: conversation.id };
    },

    async getConversation(id, opts) {
      await delay(Math.min(latency, 300), opts?.signal);
      const conversation = conversations.get(id);
      if (!conversation) throw new MockError('Conversation not found', 404);
      return conversation.messages.map((m) => ({ ...m }));
    },

    async listConversations(page, pageSize, opts) {
      await delay(Math.min(latency, 300), opts?.signal);
      const all = [...conversations.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const start = Math.max(0, (page - 1) * pageSize);
      const items: ConversationSummary[] = all.slice(start, start + pageSize).map((c) => ({
        id: c.id,
        preview: c.messages.find((m) => m.role === 'user')?.text ?? null,
        lastMessageAt: c.updatedAt,
        messageCount: c.messages.length,
      }));
      return { items, total: all.length };
    },
  };
}
