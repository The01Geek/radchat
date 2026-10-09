/**
 * ConversationHistory — lists past conversations from the data source's
 * `listConversations`. Selecting one switches the chat to that conversation.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatDataSource, ConversationSummary } from '../types';
import './ConversationHistory.css';

export const HISTORY_PAGE_SIZE = 20;

interface ConversationHistoryProps {
  dataSource: ChatDataSource;
  locale?: string;
  /** Return to the live chat. */
  onClose: () => void;
  /** Switch to the selected conversation. */
  onSelectConversation: (conversationId: string) => void;
  /** Marks the active conversation in the list. */
  currentConversationId?: string | null;
}

export function formatConversationDate(iso: string | null, locale?: string, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString(locale, { weekday: 'long' });
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function ConversationHistory({
  dataSource,
  locale,
  onClose,
  onSelectConversation,
  currentConversationId,
}: ConversationHistoryProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    (pageToLoad: number) => {
      const list = dataSource.listConversations;
      if (!list) return;
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setLoading(true);
      setError(null);
      list
        .call(dataSource, pageToLoad, HISTORY_PAGE_SIZE, { signal: abort.signal })
        .then((result) => {
          if (abort.signal.aborted) return;
          const items = Array.isArray(result?.items) ? result.items : [];
          setConversations((prev) => {
            if (pageToLoad === 1) return items;
            const seen = new Set(prev.map((c) => c.id));
            return [...prev, ...items.filter((c) => !seen.has(c.id))];
          });
          setTotal(typeof result?.total === 'number' ? result.total : items.length);
          setPage(pageToLoad);
          setLoading(false);
        })
        .catch((err) => {
          if (abort.signal.aborted) return;
          // Details stay in the console; the user sees a generic message.
          console.error('[RadChat] Failed to load conversation history:', err);
          setError("We couldn't load your past conversations. Please try again.");
          setLoading(false);
        });
    },
    [dataSource],
  );

  useEffect(() => {
    // Defer so the initial load does not set state synchronously inside the effect.
    const timer = setTimeout(() => load(1), 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [load]);

  const hasMore = conversations.length < total;

  return (
    <div className="radchat-ch" role="region" aria-label="Conversation history">
      <div className="radchat-ch-header">
        <button type="button" className="radchat-ch-back-btn" onClick={onClose} title="Return to chat">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to chat
        </button>
        <span className="radchat-ch-header-title">History</span>
      </div>

      <div className="radchat-ch-list">
        {error && (
          <div className="radchat-ch-state radchat-ch-error" role="alert">
            {error}{' '}
            <button type="button" className="radchat-ch-retry" onClick={() => load(conversations.length ? page + 1 : 1)}>
              Try again
            </button>
          </div>
        )}
        {!loading && !error && conversations.length === 0 && (
          <div className="radchat-ch-state">No past conversations yet.</div>
        )}
        {conversations.map((conv) => {
          const isCurrent = conv.id === currentConversationId;
          return (
            <button
              type="button"
              key={conv.id}
              className={`radchat-ch-item ${isCurrent ? 'radchat-ch-item-current' : ''}`}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => (isCurrent ? onClose() : onSelectConversation(conv.id))}
            >
              <div className="radchat-ch-item-top">
                <span className="radchat-ch-item-date">{formatConversationDate(conv.lastMessageAt, locale)}</span>
                <span className="radchat-ch-item-count">
                  {conv.messageCount} {conv.messageCount === 1 ? 'message' : 'messages'}
                </span>
              </div>
              <div className="radchat-ch-item-preview">{conv.preview || 'No messages'}</div>
              {isCurrent && <span className="radchat-ch-item-badge">Current</span>}
            </button>
          );
        })}
        {loading && (
          <div className="radchat-ch-state" role="status">
            Loading conversations…
          </div>
        )}
        {!loading && !error && hasMore && (
          <button type="button" className="radchat-ch-more" onClick={() => load(page + 1)}>
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
