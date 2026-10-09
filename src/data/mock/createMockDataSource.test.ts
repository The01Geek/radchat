import { describe, expect, it } from 'vitest';
import { cannedAnswer, createMockDataSource } from './createMockDataSource';

const req = (text: string) => ({ conversationId: null, text, attachments: [], signal: new AbortController().signal });

describe('cannedAnswer', () => {
  it('returns a chart for trend questions', () => {
    const types = cannedAnswer(req('show the revenue trend')).blocks.map((b) => b.type);
    expect(types).toContain('chart');
  });

  it('returns a table for top products', () => {
    expect(cannedAnswer(req('top products')).blocks.some((b) => b.type === 'table')).toBe(true);
  });

  it('throws a status error when asked to fail', () => {
    expect(() => cannedAnswer(req('simulate an error'))).toThrow(expect.objectContaining({ status: 500 }));
  });
});

describe('createMockDataSource', () => {
  it('creates a conversation and lists it first', async () => {
    const source = createMockDataSource({ latencyMs: 0 });
    const first = await source.sendMessage(req('top products'));
    expect(first.conversationId).toBeTruthy();

    const page = await source.listConversations!(1, 10);
    expect(page.total).toBe(3);
    expect(page.items[0]).toMatchObject({ id: first.conversationId, preview: 'top products', messageCount: 2 });

    const transcript = await source.getConversation!(first.conversationId!);
    expect(transcript.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('rejects unknown conversations with 404 and supports no seed data', async () => {
    const source = createMockDataSource({ latencyMs: 0, seedConversations: false });
    expect((await source.listConversations!(1, 10)).total).toBe(0);
    await expect(source.getConversation!('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('honours abort signals', async () => {
    const source = createMockDataSource({ latencyMs: 1000 });
    const abort = new AbortController();
    const pending = source.sendMessage({ ...req('hi'), signal: abort.signal });
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('uses a custom respond function', async () => {
    const source = createMockDataSource({ latencyMs: 0, respond: () => [{ type: 'text', content: 'custom' }] });
    const result = await source.sendMessage(req('anything'));
    expect(result.blocks).toEqual([{ type: 'text', content: 'custom' }]);
  });

  it('persists conversations when persistKey is set', async () => {
    const a = createMockDataSource({ latencyMs: 0, persistKey: 'mock-test' });
    const { conversationId } = await a.sendMessage(req('top products'));
    const b = createMockDataSource({ latencyMs: 0, persistKey: 'mock-test' });
    expect(await b.getConversation!(conversationId!)).toHaveLength(2);
  });
});
