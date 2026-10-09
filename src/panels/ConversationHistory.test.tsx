import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConversationHistory, formatConversationDate } from './ConversationHistory';
import type { ChatDataSource, ConversationSummary } from '../types';

const item = (i: number): ConversationSummary => ({
  id: `c${i}`,
  preview: `Question ${i}`,
  lastMessageAt: '2026-01-01T10:00:00Z',
  messageCount: i,
});

describe('ConversationHistory', () => {
  it('loads pages and marks the current conversation', async () => {
    const listConversations = vi.fn(async (page: number) => ({
      items: page === 1 ? [item(1), item(2)] : [item(3)],
      total: 3,
    }));
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ConversationHistory
        dataSource={{ sendMessage: vi.fn(), listConversations } as ChatDataSource}
        onClose={onClose}
        onSelectConversation={onSelect}
        currentConversationId="c1"
      />,
    );

    expect(await screen.findByText('Question 2')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('1 message')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Question 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();

    await user.click(screen.getByText('Question 2'));
    expect(onSelect).toHaveBeenCalledWith('c2');
    await user.click(screen.getByText('Question 1'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a generic error and retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const listConversations = vi
      .fn()
      .mockRejectedValueOnce(new Error('SELECT * FROM secret'))
      .mockResolvedValueOnce({ items: [], total: 0 });
    const user = userEvent.setup();
    render(
      <ConversationHistory
        dataSource={{ sendMessage: vi.fn(), listConversations } as ChatDataSource}
        onClose={vi.fn()}
        onSelectConversation={vi.fn()}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your past conversations");
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No past conversations yet.')).toBeInTheDocument();
  });
});

describe('formatConversationDate', () => {
  const now = new Date(2026, 5, 10, 12, 0, 0);
  it('formats relative days', () => {
    expect(formatConversationDate(new Date(2026, 5, 9, 9).toISOString(), 'en-US', now)).toBe('Yesterday');
    expect(formatConversationDate(new Date(2026, 5, 7, 9).toISOString(), 'en-US', now)).toBe('Sunday');
    expect(formatConversationDate(new Date(2026, 0, 2).toISOString(), 'en-US', now)).toBe('Jan 2');
    expect(formatConversationDate(null)).toBe('');
    expect(formatConversationDate('not a date')).toBe('');
  });
});
