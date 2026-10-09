import { describe, expect, it, vi } from 'vitest';
import { createFetchDataSource, HttpError } from './createFetchDataSource';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

describe('createFetchDataSource', () => {
  it('posts the message and normalizes the response', async () => {
    const fetchMock = vi.fn(async () => json({ conversationId: 'c1', blocks: [{ type: 'text', content: 'hi' }] }));
    const source = createFetchDataSource({
      baseUrl: 'https://api.example.com/chat/',
      fetch: fetchMock,
      headers: async () => ({ Authorization: 'Bearer test-token' }),
    });
    const signal = new AbortController().signal;
    const result = await source.sendMessage({
      conversationId: null,
      text: 'hello',
      attachments: [{ id: 'x', type: 'file', name: 'a.txt', data: 'data:text/plain;base64,YQ==', size: 1, mimeType: 'text/plain' }],
      signal,
    });

    expect(result).toEqual({ conversationId: 'c1', blocks: [{ type: 'text', content: 'hi' }], sources: undefined });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/chat/messages');
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(signal);
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(headers.get('Content-Type')).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      conversationId: null,
      text: 'hello',
      attachments: [{ type: 'file', name: 'a.txt', mimeType: 'text/plain', size: 1, data: 'data:text/plain;base64,YQ==' }],
    });
  });

  it('throws HttpError with the status for non-2xx responses', async () => {
    const source = createFetchDataSource({
      baseUrl: '/api',
      fetch: async () => new Response('denied', { status: 401, statusText: 'Unauthorized' }),
    });
    const error = await source
      .sendMessage({ conversationId: null, text: 'x', attachments: [], signal: new AbortController().signal })
      .catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
    expect(error.body).toBe('denied');
  });

  it('rejects responses without a blocks array', async () => {
    const source = createFetchDataSource({ baseUrl: '/api', fetch: async () => json({ answer: 'hi' }) });
    await expect(
      source.sendMessage({ conversationId: null, text: 'x', attachments: [], signal: new AbortController().signal }),
    ).rejects.toThrow(/blocks/);
  });

  it('reads conversations and pages', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('?') ? json({ items: [{ id: 'a', preview: 'p', lastMessageAt: null, messageCount: 2 }], total: 7 }) : json({ messages: [{ role: 'user', text: 'q' }] }),
    );
    const source = createFetchDataSource({ baseUrl: '/api', fetch: fetchMock as unknown as typeof fetch });

    expect(await source.getConversation!('id/1')).toEqual([{ role: 'user', text: 'q' }]);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/conversations/id%2F1');

    const page = await source.listConversations!(2, 10);
    expect(page.total).toBe(7);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/conversations?page=2&pageSize=10');
  });

  it('omits history methods when history is false and supports custom paths', async () => {
    const fetchMock = vi.fn(async () => json({ blocks: [] }));
    const source = createFetchDataSource({
      baseUrl: '/api',
      history: false,
      paths: { message: 'ask' },
      fetch: fetchMock,
    });
    expect(source.getConversation).toBeUndefined();
    expect(source.listConversations).toBeUndefined();
    await source.sendMessage({ conversationId: 'c', text: 'x', attachments: [], signal: new AbortController().signal });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/ask');
  });

  it('requires a baseUrl', () => {
    expect(() => createFetchDataSource({ baseUrl: '' })).toThrow(/baseUrl/);
  });
});
