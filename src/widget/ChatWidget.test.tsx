/**
 * ChatWidget smoke tests with the real react-chatbot-kit and the mock data source.
 */
import { createRef } from 'react';
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
});
