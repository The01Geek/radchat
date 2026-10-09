import { describe, expect, it, vi } from 'vitest';
import {
  BLOCKS_MESSAGE,
  ChatController,
  TYPING_MESSAGE,
  USER_ATTACHMENTS_MESSAGE,
  answerToMessages,
  createKitAdapters,
  defaultFormatError,
  sourcesToMarkdown,
  transcriptToMessages,
  type ControllerHost,
  type KitMessage,
} from './ChatController';
import { BUILT_IN_COMMANDS } from '../commands/registry';
import type { ChatDataSource } from '../types';

function setup(dataSource: ChatDataSource, overrides: Partial<ControllerHost> = {}) {
  let state: { messages: KitMessage[] } = { messages: [] };
  const host: ControllerHost = {
    dataSource,
    commands: BUILT_IN_COMMANDS,
    unknownCommands: 'error',
    formatError: defaultFormatError,
    onNewConversation: vi.fn(),
    onOpenHistory: vi.fn(() => false),
    onConversationIdChange: vi.fn(),
    ...overrides,
  };
  const controller = new ChatController(() => host);
  controller.bind((updater) => {
    state = updater(state as never) as typeof state;
  });
  return { controller, host, messages: () => state.messages };
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('answerToMessages', () => {
  it('joins plain text blocks into one Markdown message with sources', () => {
    const [msg, ...rest] = answerToMessages(
      [
        { type: 'text', content: 'One' },
        { type: 'text', content: 'Two' },
      ],
      [{ title: 'Guide', heading: 'Intro', url: 'https://example.com' }],
    );
    expect(rest).toHaveLength(0);
    expect(msg.type).toBe('bot');
    expect(msg.message).toContain('One\n\nTwo');
    expect(msg.message).toContain('[**Guide**](https://example.com) › Intro');
  });

  it('uses the block renderer for tables, charts, custom and labelled blocks', () => {
    for (const block of [
      { type: 'table', headers: [], rows: [] },
      { type: 'chart', data: [] },
      { type: 'ticket', id: 1 },
      { type: 'text', content: 'select 1', label: 'Executed SQL' },
    ]) {
      const [msg] = answerToMessages([block]);
      expect(msg.type).toBe(BLOCKS_MESSAGE);
    }
  });

  it('returns nothing for an empty answer', () => {
    expect(answerToMessages([])).toEqual([]);
    expect(answerToMessages(undefined as never)).toEqual([]);
  });
});

describe('sourcesToMarkdown', () => {
  it('dedupes, escapes and drops unsafe links', () => {
    const md = sourcesToMarkdown([
      { title: 'A*b', url: 'javascript:alert(1)' },
      { title: 'A*b', url: 'javascript:alert(1)' },
      { title: '' },
    ]);
    expect(md).toBe('**Sources:**\n- **A\\*b**');
  });
});

describe('transcriptToMessages', () => {
  it('converts stored turns, including attachments', () => {
    const out = transcriptToMessages([
      { role: 'user', text: 'Hi', attachments: [{ type: 'image', name: 'a.png' }] },
      { role: 'assistant', text: 'Hello' },
      { role: 'user', text: 'Table?' },
      { role: 'assistant', blocks: [{ type: 'table', headers: ['a'], rows: [['1']] }] },
    ]);
    expect(out.map((m) => m.type)).toEqual([USER_ATTACHMENTS_MESSAGE, 'bot', 'user', BLOCKS_MESSAGE]);
  });
});

describe('defaultFormatError', () => {
  it('maps status codes and network failures to safe text', () => {
    expect(defaultFormatError({ status: 401 })).toMatch(/sign in/);
    expect(defaultFormatError({ status: 429 })).toMatch(/Too many/);
    expect(defaultFormatError(new TypeError('Failed to fetch'))).toMatch(/couldn't reach/);
    expect(defaultFormatError(new Error('SQL syntax near users'))).not.toMatch(/SQL/);
  });
});

describe('ChatController', () => {
  it('shows a typing indicator, then the answer', async () => {
    const reply = deferred<{ blocks: { type: 'text'; content: string }[] }>();
    const { controller, messages } = setup({ sendMessage: () => reply.promise });

    const turn = controller.sendTurn('hello');
    await Promise.resolve();
    await Promise.resolve();
    expect(messages().some((m) => m.type === TYPING_MESSAGE)).toBe(true);

    reply.resolve({ blocks: [{ type: 'text', content: 'hi there' }] });
    await turn;
    expect(messages().map((m) => m.message)).toEqual(['hi there']);
  });

  it('serializes turns and reuses the returned conversation ID', async () => {
    const calls: Array<string | null> = [];
    const { controller, host } = setup({
      sendMessage: async ({ conversationId }) => {
        calls.push(conversationId);
        return { conversationId: 'c-1', blocks: [{ type: 'text', content: 'ok' }] };
      },
    });
    await Promise.all([controller.sendTurn('a'), controller.sendTurn('b')]);
    expect(calls).toEqual([null, 'c-1']);
    expect(host.onConversationIdChange).toHaveBeenCalledWith('c-1');
  });

  it('aborts in-flight requests and drops late answers on new conversation', async () => {
    let signal: AbortSignal | undefined;
    const reply = deferred<{ blocks: { type: 'text'; content: string }[] }>();
    const { controller, messages, host } = setup({
      sendMessage: (req) => {
        signal = req.signal;
        return reply.promise;
      },
    });
    const turn = controller.sendTurn('slow');
    await Promise.resolve();
    controller.newConversation();
    expect(signal?.aborted).toBe(true);
    expect(host.onNewConversation).toHaveBeenCalled();

    reply.resolve({ blocks: [{ type: 'text', content: 'late' }] });
    await turn;
    expect(messages().some((m) => m.message === 'late')).toBe(false);
  });

  it('shows an apology for an empty answer', async () => {
    const { controller, messages } = setup({ sendMessage: async () => ({ blocks: [] }) });
    await controller.sendTurn('?');
    expect(messages()[0].message).toMatch(/wasn't able to produce an answer/);
  });

  it('falls back to the default error text when formatError throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { controller, messages } = setup(
      { sendMessage: async () => Promise.reject({ status: 403 }) },
      {
        formatError: () => {
          throw new Error('bad formatter');
        },
      },
    );
    await controller.sendTurn('x');
    expect(messages()[0].message).toMatch(/sign in/);
  });

  it('takes staged attachments with the next turn and notifies listeners', async () => {
    const sendMessage = vi.fn(async () => ({ blocks: [{ type: 'text' as const, content: 'ok' }] }));
    const { controller } = setup({ sendMessage });
    const listener = vi.fn();
    controller.onAttachmentsReset(listener);
    controller.setAttachments([{ id: '1', type: 'file', name: 'a.csv', data: 'data:text/csv;base64,', size: 1 }]);

    await controller.sendTurn('see file');
    expect((sendMessage.mock.calls[0] as unknown as [{ attachments: unknown[] }])[0].attachments).toHaveLength(1);
    expect(listener).toHaveBeenCalledWith([]);
    expect(controller.attachments).toHaveLength(0);
  });

  it('routes unknown commands to the data source when configured', async () => {
    const sendMessage = vi.fn(async () => ({ blocks: [{ type: 'text' as const, content: 'ok' }] }));
    const { controller } = setup({ sendMessage }, { unknownCommands: 'send' });
    await controller.runCommandInput('/whatever 1');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('reports a failing command without breaking the chat', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { controller, messages } = setup(
      { sendMessage: vi.fn() },
      {
        commands: [
          {
            name: 'boom',
            description: 'Throws',
            run: () => {
              throw new Error('x');
            },
          },
        ],
      },
    );
    await controller.runCommandInput('/boom');
    expect(messages()[0].message).toMatch(/failed/);
  });

  it('/history replies when history is unavailable', async () => {
    const { controller, messages } = setup({ sendMessage: vi.fn() });
    await controller.runCommandInput('/history');
    expect(messages()[0].message).toMatch(/not available/);
  });
});

describe('createKitAdapters', () => {
  it('ignores the no-argument construction react-chatbot-kit uses for detection', () => {
    const { controller } = setup({ sendMessage: vi.fn() });
    const bind = vi.spyOn(controller, 'bind');
    const { ActionProvider } = createKitAdapters(controller);
    new ActionProvider();
    expect(bind).not.toHaveBeenCalled();
    new ActionProvider(null, () => undefined);
    expect(bind).toHaveBeenCalledTimes(1);
  });
});
