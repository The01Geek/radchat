/**
 * ChatWidget smoke tests with the real react-chatbot-kit and the mock data source.
 */
import { Activity, createRef, StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatWidget } from './ChatWidget';
import { createMockDataSource } from '../data/mock/createMockDataSource';
import type { ChatDataSource, ChatWidgetHandle, ChatWidgetOptions } from '../types';

// Plotly needs a real browser; charts are covered by the block tests' error boundary instead.
vi.mock('../blocks/ChartBlock', () => ({
  ChartBlock: () => <div data-testid="chart">chart</div>,
  default: () => <div data-testid="chart">chart</div>,
}));

function renderWidget(options: Partial<ChatWidgetOptions> = {}) {
  const ref = createRef<ChatWidgetHandle>();
  const dataSource = options.dataSource ?? createMockDataSource({ latencyMs: 0 });
  const utils = render(<ChatWidget ref={ref} initialOpen dataSource={dataSource} {...options} />);
  return { ...utils, ref, dataSource };
}

const input = () => document.querySelector<HTMLInputElement>('.react-chatbot-kit-chat-input')!;

async function send(text: string) {
  const user = userEvent.setup();
  await user.clear(input());
  await user.type(input(), text);
  await user.click(document.querySelector('.react-chatbot-kit-chat-btn-send')!);
}

describe('ChatWidget', () => {
  it('shows the launcher when closed and opens on click', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ChatWidget dataSource={createMockDataSource({ latencyMs: 0 })} title="Sales Assistant" onOpenChange={onOpenChange} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Sales Assistant' }));

    const dialog = screen.getByRole('dialog', { name: 'Sales Assistant' });
    expect(within(dialog).getByText(/type/i)).toBeInTheDocument();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
  });

  it('hides the launcher with hideBubble and opens through the ref', async () => {
    const ref = createRef<ChatWidgetHandle>();
    render(<ChatWidget ref={ref} hideBubble dataSource={createMockDataSource({ latencyMs: 0 })} />);
    expect(screen.queryByRole('button', { name: /open/i })).not.toBeInTheDocument();

    act(() => ref.current!.open());
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(ref.current!.isOpen()).toBe(true);

    act(() => ref.current!.close());
    expect(ref.current!.isOpen()).toBe(false);
  });

  it('re-clamps the floating window into the viewport when it opens', () => {
    localStorage.removeItem('clamp-test:geometry');
    const ref = createRef<ChatWidgetHandle>();
    const { container } = render(
      <ChatWidget ref={ref} hideBubble storageKey="clamp-test" dataSource={createMockDataSource({ latencyMs: 0 })} />,
    );
    const float = () => container.querySelector<HTMLElement>('[role="dialog"]')!;
    // jsdom's 1024×768 viewport: the default bottom-right spot fits fine.
    act(() => ref.current!.open());
    expect(parseFloat(float().style.left)).toBeGreaterThan(0);
    act(() => ref.current!.close());

    // Then the viewport shrinks without a resize event — mobile emulation
    // settles the layout viewport late, and a restored geometry may come from
    // a larger window. Opening must not leave the window offscreen.
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    act(() => ref.current!.open());
    expect(float().style.left).toBe('40px'); // fully on screen: 390 − 350 wide
    expect(parseFloat(float().style.top)).toBeLessThanOrEqual(344); // 844 − 500 tall
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  it('re-clamps when only the visual viewport resizes', () => {
    localStorage.removeItem('vv-clamp-test:geometry');
    // jsdom has no visual viewport; the widget treats a missing one as absent.
    const vv = new EventTarget();
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    try {
      const ref = createRef<ChatWidgetHandle>();
      const { container } = render(
        <ChatWidget ref={ref} hideBubble storageKey="vv-clamp-test" dataSource={createMockDataSource({ latencyMs: 0 })} />,
      );
      const float = () => container.querySelector<HTMLElement>('[role="dialog"]')!;
      act(() => ref.current!.open());
      expect(parseFloat(float().style.left)).toBeGreaterThan(0);
      // A window from a larger screen must shrink with the viewport — in CSS,
      // so it fits even when no resize event fires.
      expect(float().style.maxWidth).toBe('100%');

      // The on-screen keyboard or a late-settling mobile viewport: no window
      // resize event, only the visual viewport reports the narrower size.
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
      act(() => vv.dispatchEvent(new Event('resize')));
      expect(float().style.left).toBe('40px'); // fully on screen: 390 − 350 wide
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    } finally {
      Reflect.deleteProperty(window, 'visualViewport');
    }
  });

  it('sends a question and renders a table answer from the data source', async () => {
    renderWidget();
    await send('What are the top products?');

    expect(await screen.findByText('House Blend 1 kg')).toBeInTheDocument();
    expect(screen.getByText('$312,450.50')).toBeInTheDocument();
    expect(screen.getByText('24.8%')).toBeInTheDocument();
    // The typing indicator is gone once the answer arrives.
    expect(screen.queryByRole('status', { name: 'Assistant is thinking' })).not.toBeInTheDocument();
  });

  it('passes the conversation ID from the first answer to the next turn', async () => {
    const sendMessage = vi.fn<ChatDataSource['sendMessage']>(async ({ conversationId }) => ({
      conversationId: conversationId ?? 'conv-1',
      blocks: [{ type: 'text', content: 'ok' }],
    }));
    renderWidget({ dataSource: { sendMessage } });

    await send('first');
    await screen.findByText('ok');
    await send('second');
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));

    expect(sendMessage.mock.calls[0][0].conversationId).toBeNull();
    expect(sendMessage.mock.calls[1][0].conversationId).toBe('conv-1');
  });

  it('shows a friendly message when the data source fails', async () => {
    const error = Object.assign(new Error('boom: internal detail'), { status: 500 });
    renderWidget({ dataSource: { sendMessage: vi.fn().mockRejectedValue(error) } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await send('hello');
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/internal detail/)).not.toBeInTheDocument();
  });

  it('uses formatError when provided', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWidget({
      dataSource: { sendMessage: vi.fn().mockRejectedValue(new Error('x')) },
      formatError: () => 'Custom failure text',
    });
    await send('hello');
    expect(await screen.findByText('Custom failure text')).toBeInTheDocument();
  });

  it('runs /help locally and lists host commands', async () => {
    const sendMessage = vi.fn();
    renderWidget({
      dataSource: { sendMessage },
      commands: [{ name: 'sql', description: 'Run a SQL query' }],
    });
    await send('/help');

    expect(await screen.findByText('Available commands')).toBeInTheDocument();
    expect(screen.getByText('/sql')).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sends pass-through commands to the data source', async () => {
    const dataSource = createMockDataSource({ latencyMs: 0 });
    const spy = vi.spyOn(dataSource, 'sendMessage');
    renderWidget({ dataSource, commands: [{ name: 'sql', description: 'Run SQL' }] });

    await send('/sql select 1');
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0].text).toBe('/sql select 1');
    expect(await screen.findByText(/pass-through command/)).toBeInTheDocument();
  });

  it('runs host commands with run()', async () => {
    const run = vi.fn((ctx) => ctx.reply(`echo: ${ctx.argText}`));
    renderWidget({ commands: [{ name: 'echo', description: 'Echo', run }] });
    await send('/echo hi there');
    expect(await screen.findByText('echo: hi there')).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('reports unknown commands and respects enabledCommands', async () => {
    renderWidget({ enabledCommands: [] });
    await send('/nope');
    expect(await screen.findByText(/Unknown command/)).toBeInTheDocument();
    await send('/clear');
    expect(await screen.findByText(/is not available/)).toBeInTheDocument();
  });

  it('/clear empties the transcript', async () => {
    renderWidget({ welcomeMessage: 'Welcome text' });
    expect(screen.getByText('Welcome text')).toBeInTheDocument();
    await send('/clear');
    await waitFor(() => expect(screen.queryByText('Welcome text')).not.toBeInTheDocument());
  });

  it('starts a new conversation from the header', async () => {
    const user = userEvent.setup();
    renderWidget({ welcomeMessage: 'Welcome text' });
    await send('What are the top products?');
    await screen.findByText('House Blend 1 kg');

    await user.click(screen.getByRole('button', { name: 'New conversation' }));
    await waitFor(() => expect(screen.queryByText('House Blend 1 kg')).not.toBeInTheDocument());
    expect(screen.getByText('Welcome text')).toBeInTheDocument();
  });

  it('calls onNewConversation for every way a new conversation starts', async () => {
    const user = userEvent.setup();
    const onNewConversation = vi.fn();
    const { ref } = renderWidget({ welcomeMessage: 'Welcome text', onNewConversation });
    await send('What are the top products?');
    await screen.findByText('House Blend 1 kg');

    await user.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(onNewConversation).toHaveBeenCalledTimes(1);

    await send('/reset');
    expect(onNewConversation).toHaveBeenCalledTimes(2);

    act(() => ref.current!.newConversation());
    expect(onNewConversation).toHaveBeenCalledTimes(3);

    act(() => ref.current!.open({ startNewConversation: true }));
    expect(onNewConversation).toHaveBeenCalledTimes(4);
  });

  it('calls onNewConversation for a command that starts a new conversation', async () => {
    const onNewConversation = vi.fn();
    renderWidget({
      onNewConversation,
      commands: [{ name: 'fresh', description: 'Start over', run: ({ newConversation }) => newConversation() }],
    });
    await send('/fresh');
    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  it('calls onNewConversation once the fresh transcript is in place', async () => {
    const user = userEvent.setup();
    const oldAnswerSeen: boolean[] = [];
    const { ref } = renderWidget({
      welcomeMessage: 'Welcome text',
      onNewConversation() {
        oldAnswerSeen.push(!!screen.queryByText('House Blend 1 kg'));
        ref.current!.appendBlocks([{ type: 'text', content: 'Added by the host' }]);
      },
    });
    await send('What are the top products?');
    await screen.findByText('House Blend 1 kg');

    await user.click(screen.getByRole('button', { name: 'New conversation' }));

    const added = await screen.findByText('Added by the host');
    expect(oldAnswerSeen).toEqual([false]);
    // The block joins the fresh transcript instead of replacing its welcome.
    const welcome = await screen.findByText('Welcome text');
    expect(welcome.compareDocumentPosition(added) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lands blocks appended from onNewConversation on a widget that was never opened', async () => {
    const ref = createRef<ChatWidgetHandle>();
    render(
      <ChatWidget
        ref={ref}
        hideBubble
        dataSource={createMockDataSource({ latencyMs: 0 })}
        onNewConversation={() => ref.current!.appendBlocks([{ type: 'text', content: 'Added by the host' }])}
      />,
    );

    // Closed: the block waits for the first open.
    act(() => ref.current!.newConversation());
    expect(screen.queryByText('Added by the host')).not.toBeInTheDocument();
    act(() => ref.current!.open());
    expect(await screen.findByText('Added by the host')).toBeInTheDocument();
  });

  it('lands blocks appended from onNewConversation when the same call opens the widget', async () => {
    const ref = createRef<ChatWidgetHandle>();
    render(
      <ChatWidget
        ref={ref}
        hideBubble
        dataSource={createMockDataSource({ latencyMs: 0 })}
        onNewConversation={() => ref.current!.appendBlocks([{ type: 'text', content: 'Added by the host' }])}
      />,
    );

    act(() => ref.current!.open({ startNewConversation: true }));
    expect(await screen.findByText('Added by the host')).toBeInTheDocument();
  });

  it('lands blocks appended from onNewConversation on a widget closed after opening', async () => {
    const onNewConversation = vi.fn();
    const { ref } = renderWidget({
      onNewConversation() {
        onNewConversation();
        ref.current!.appendBlocks([{ type: 'text', content: 'Added by the host' }]);
      },
    });
    act(() => ref.current!.close());

    act(() => ref.current!.newConversation());
    expect(onNewConversation).toHaveBeenCalledTimes(1);
    act(() => ref.current!.open());
    expect(await screen.findByText('Added by the host')).toBeInTheDocument();
  });

  it('reports each reset once under StrictMode, and not on mount', () => {
    const ref = createRef<ChatWidgetHandle>();
    const onNewConversation = vi.fn();
    render(
      <StrictMode>
        <ChatWidget ref={ref} initialOpen dataSource={createMockDataSource({ latencyMs: 0 })} onNewConversation={onNewConversation} />
      </StrictMode>,
    );
    expect(onNewConversation).not.toHaveBeenCalled();

    act(() => ref.current!.newConversation());
    expect(onNewConversation).toHaveBeenCalledTimes(1);

    // Several resets in one update are one new conversation to the host.
    act(() => {
      ref.current!.newConversation();
      ref.current!.newConversation();
    });
    expect(onNewConversation).toHaveBeenCalledTimes(2);
  });

  it('does not report a reset again when a hidden Activity is shown', () => {
    const ref = createRef<ChatWidgetHandle>();
    const onNewConversation = vi.fn();
    const dataSource = createMockDataSource({ latencyMs: 0 });
    const tree = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <ChatWidget ref={ref} initialOpen dataSource={dataSource} onNewConversation={onNewConversation} />
      </Activity>
    );
    const { rerender } = render(tree('visible'));
    act(() => ref.current!.newConversation());
    expect(onNewConversation).toHaveBeenCalledTimes(1);

    rerender(tree('hidden'));
    rerender(tree('visible'));
    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  it('keeps a new conversation started while a saved one is still loading', async () => {
    const saved = await createMockDataSource({ latencyMs: 0 }).getConversation!('demo-conversation-1');
    let finishLoading!: (messages: typeof saved) => void;
    localStorage.setItem('radchat:conversation', 'demo-conversation-1');
    const ref = createRef<ChatWidgetHandle>();
    render(
      <ChatWidget
        ref={ref}
        initialOpen
        dataSource={{
          sendMessage: vi.fn(),
          getConversation: () => new Promise((resolve) => (finishLoading = resolve)),
        }}
        onNewConversation={() => ref.current!.appendBlocks([{ type: 'text', content: 'Added by the host' }])}
      />,
    );

    act(() => ref.current!.newConversation());
    await act(async () => finishLoading(saved));

    expect(await screen.findByText('Added by the host')).toBeInTheDocument();
    expect(screen.queryByText('House Blend 1 kg')).not.toBeInTheDocument();
    expect(localStorage.getItem('radchat:conversation')).toBeNull();
  });

  it('calls the latest onNewConversation after a re-render', () => {
    const ref = createRef<ChatWidgetHandle>();
    const first = vi.fn();
    const second = vi.fn();
    const dataSource = createMockDataSource({ latencyMs: 0 });
    const { rerender } = render(<ChatWidget ref={ref} initialOpen dataSource={dataSource} onNewConversation={first} />);
    rerender(<ChatWidget ref={ref} initialOpen dataSource={dataSource} onNewConversation={second} />);

    act(() => ref.current!.newConversation());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('logs an onNewConversation error and keeps the widget working', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('host bug');
    const ref = createRef<ChatWidgetHandle>();
    const onNewConversation = vi.fn(() => {
      throw failure;
    });
    render(<ChatWidget ref={ref} hideBubble dataSource={createMockDataSource({ latencyMs: 0 })} onNewConversation={onNewConversation} />);

    act(() => ref.current!.open({ startNewConversation: true }));

    expect(ref.current!.isOpen()).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('[RadChat] onNewConversation failed:', failure);

    // Still mounted and still reporting.
    act(() => ref.current!.newConversation());
    expect(onNewConversation).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('does not call onNewConversation when History opens a conversation or /clear empties the display', async () => {
    const user = userEvent.setup();
    const onNewConversation = vi.fn();
    renderWidget({ onNewConversation });

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'History' }));
    await user.click(await screen.findByText('How is revenue defined?'));
    await screen.findByText(/sum of/);

    await send('/clear');
    await waitFor(() => expect(screen.queryByText(/sum of/)).not.toBeInTheDocument());

    expect(onNewConversation).not.toHaveBeenCalled();
  });

  it('switches layout from the menu and remembers it', async () => {
    const user = userEvent.setup();
    renderWidget({ storageKey: 'test-widget' });
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Sidebar' }));

    expect(document.querySelector('.radchat-layout-sidebar')).toBeInTheDocument();
    expect(localStorage.getItem('test-widget:layout')).toBe('sidebar');
  });

  it('does not write to storage when storageKey is false', async () => {
    const user = userEvent.setup();
    renderWidget({ storageKey: false });
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Fullscreen' }));
    expect(localStorage.length).toBe(0);
  });

  it('lists past conversations and opens one', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'History' }));

    const item = await screen.findByText('How is revenue defined?');
    await user.click(item);

    expect(await screen.findByText(/sum of/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Conversation history' })).not.toBeInTheDocument();
    expect(localStorage.getItem('radchat:conversation')).toBe('demo-conversation-2');
  });

  it('hides History when the data source cannot list conversations', async () => {
    const user = userEvent.setup();
    renderWidget({ dataSource: { sendMessage: vi.fn() } });
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.queryByRole('menuitem', { name: 'History' })).not.toBeInTheDocument();
  });

  it('restores the saved conversation on load', async () => {
    localStorage.setItem('radchat:conversation', 'demo-conversation-1');
    renderWidget();
    expect(await screen.findByText('House Blend 1 kg')).toBeInTheDocument();
  });

  it('prefills the input and runs a command through open()', async () => {
    const { ref } = renderWidget({ initialOpen: false });
    act(() => ref.current!.open({ prefillInput: 'Draft question' }));
    await waitFor(() => expect(input().value).toBe('Draft question'));

    act(() => ref.current!.open({ command: '/help' }));
    expect(await screen.findByText('Available commands')).toBeInTheDocument();
  });

  it('applies a validated primary color and ignores invalid ones', () => {
    const { container, rerender } = renderWidget({ primaryColor: '#ff0000' });
    const root = container.querySelector<HTMLElement>('.radchat-widget')!;
    expect(root.style.getPropertyValue('--radchat-primary-color')).toBe('#ff0000');

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rerender(<ChatWidget initialOpen dataSource={createMockDataSource()} primaryColor="red; background: url(x)" />);
    expect(root.style.getPropertyValue('--radchat-primary-color')).toBe('');
  });

  it('omits the attachment picker when attachments is false', async () => {
    renderWidget({ attachments: false });
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByRole('button', { name: /Add attachments/ })).not.toBeInTheDocument();
  });

  it('sends staged attachments with the next message', async () => {
    const sendMessage = vi.fn<ChatDataSource['sendMessage']>(async () => ({ blocks: [{ type: 'text', content: 'got it' }] }));
    renderWidget({ dataSource: { sendMessage } });

    const fileInput = await screen.findByTestId('radchat-document-input');
    const file = new File(['a,b\n1,2'], 'numbers.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByRole('button', { name: 'numbers.csv' })).toBeInTheDocument();

    await send('see attached');
    await screen.findByText('got it');
    const request = sendMessage.mock.calls[0][0];
    expect(request.attachments).toHaveLength(1);
    expect(request.attachments[0]).toMatchObject({ name: 'numbers.csv', type: 'file' });
    expect(request.attachments[0].data.startsWith('data:')).toBe(true);
    // The chip clears and the sent message shows the attachment name.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'numbers.csv' })).not.toBeInTheDocument());
    expect(screen.getByTitle('numbers.csv')).toBeInTheDocument();
  });

  it('rejects unsupported document types with an inline message', async () => {
    renderWidget();
    const fileInput = await screen.findByTestId('radchat-document-input');
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'run.exe')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/not supported/);
  });

  it('keeps two widgets independent', async () => {
    const a = createMockDataSource({ latencyMs: 0 });
    const b = { sendMessage: vi.fn(async () => ({ blocks: [{ type: 'text' as const, content: 'from B' }] })) };
    render(
      <>
        <ChatWidget initialOpen dataSource={a} title="A" storageKey="a" />
        <ChatWidget initialOpen dataSource={b} title="B" storageKey="b" />
      </>,
    );
    const user = userEvent.setup();
    const dialogB = screen.getByRole('dialog', { name: 'B' });
    const inputB = await waitFor(() => {
      const el = dialogB.querySelector<HTMLInputElement>('.react-chatbot-kit-chat-input');
      expect(el).not.toBeNull();
      return el!;
    });
    await user.type(inputB, 'hello');
    await user.click(dialogB.querySelector('.react-chatbot-kit-chat-btn-send')!);

    expect(await within(dialogB).findByText('from B')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'A' })).queryByText('from B')).not.toBeInTheDocument();
  });

  describe('appendBlocks', () => {
    it('buffers appends made before the first open and shows them on open', () => {
      const ref = createRef<ChatWidgetHandle>();
      render(<ChatWidget ref={ref} hideBubble initialOpen={false} dataSource={createMockDataSource({ latencyMs: 0 })} />);

      act(() => ref.current!.appendBlocks([{ type: 'text', content: 'buffered card' }, { type: 'text', content: 'second card' }]));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      act(() => ref.current!.open());
      expect(screen.getByText('buffered card')).toBeInTheDocument();
      expect(screen.getByText('second card')).toBeInTheDocument();
    });

    it('appends to the live transcript while the widget is open', async () => {
      const ref = createRef<ChatWidgetHandle>();
      render(<ChatWidget ref={ref} initialOpen dataSource={createMockDataSource({ latencyMs: 0 })} />);
      await screen.findByText(/type/i);

      act(() => ref.current!.appendBlocks([{ type: 'text', content: 'live card' }]));

      expect(screen.getByText('live card')).toBeInTheDocument();
      // The transcript still works after a live append.
      await send('hello');
      expect(await screen.findByText(/SELECT/i)).toBeInTheDocument();
    });

    it('routes custom block types through blockRenderers', () => {
      const ref = createRef<ChatWidgetHandle>();
      render(
        <ChatWidget
          ref={ref}
          initialOpen
          dataSource={createMockDataSource({ latencyMs: 0 })}
          blockRenderers={{ 'raddy-card': (block) => <div data-testid="card">card {String(block.cardId)}</div> }}
        />,
      );

      act(() => ref.current!.appendBlocks([{ type: 'raddy-card', cardId: 'abc' }]));

      expect(screen.getByTestId('card')).toHaveTextContent('card abc');
    });

    it('ignores an empty append', () => {
      const ref = createRef<ChatWidgetHandle>();
      render(<ChatWidget ref={ref} initialOpen dataSource={createMockDataSource({ latencyMs: 0 })} />);

      expect(() => act(() => ref.current!.appendBlocks([]))).not.toThrow();
    });

    it('drops buffered blocks on a new conversation', () => {
      const ref = createRef<ChatWidgetHandle>();
      render(<ChatWidget ref={ref} initialOpen dataSource={createMockDataSource({ latencyMs: 0 })} />);

      act(() => {
        ref.current!.appendBlocks([{ type: 'text', content: 'to be dropped' }]);
        ref.current!.newConversation();
      });

      expect(screen.queryByText('to be dropped')).not.toBeInTheDocument();
    });
  });
});
