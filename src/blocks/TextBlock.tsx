import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SafeLink } from '../shared/SafeLink';

interface TextBlockProps {
  content: string;
  label?: string; // When set, renders as a collapsible section
}

/**
 * TextBlock — renders plain text or markdown content with proper message styling.
 * Used by BlockRenderer when displaying text alongside structured blocks (tables, charts).
 * Applies same styling as regular bot messages for visual consistency.
 * When `label` is provided, wraps content in a collapsible disclosure widget.
 */
const REMARK_PLUGINS = [remarkGfm];

export function TextBlock({ content, label }: TextBlockProps) {
  const [open, setOpen] = useState(false);

  const markdownContent = (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      components={{
        // Preserve whitespace in paragraphs
        p: ({ children }) => (
          <p style={{ margin: '0 0 4px 0', whiteSpace: 'pre-wrap' }}>
            {children}
          </p>
        ),
        // Links open in a new tab unless the host's onLinkClick intercepts them.
        a: ({ href, children }) => (
          <SafeLink
            href={href}
            style={{
              color: 'var(--radchat-primary-color, #3b82f6)',
              textDecoration: 'none',
              fontWeight: 500,
              borderBottom: '1px solid transparent',
            }}
          >
            {children}
          </SafeLink>
        ),
        // Fenced code blocks: pre wraps code for multiline display
        pre: ({ children }) => (
          <pre style={{
            background: 'var(--radchat-background-tertiary, #e2e8f0)',
            padding: '8px 10px',
            borderRadius: '6px',
            overflowX: 'auto',
            maxWidth: '100%',
            margin: '4px 0',
            fontSize: '12px',
            lineHeight: '1.4',
            whiteSpace: 'pre',
          }}>
            {children}
          </pre>
        ),
        // Inline code vs block code (inside pre)
        code: ({ children, className }) => {
          // className is set for fenced blocks (e.g. "language-sql")
          if (className) {
            return (
              <code style={{
                fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
                fontSize: '12px',
              }}>
                {children}
              </code>
            );
          }
          // Inline code
          return (
            <code style={{
              background: 'var(--radchat-background-tertiary, #e2e8f0)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
              fontSize: '13px',
            }}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  // Collapsible wrapper when label is provided
  if (label) {
    return (
      <div className="radchat-block-text" style={{
        background: 'var(--radchat-background-color, #f8fafc)',
        color: 'var(--radchat-text-color, #1e293b)',
        borderRadius: '12px',
        borderTopLeftRadius: '4px',
        marginBottom: '8px',
        maxWidth: '100%',
        fontSize: '13px',
        lineHeight: '1.5',
        overflow: 'hidden',
      }}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: '100%',
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--radchat-text-color, #1e293b)',
            textAlign: 'left',
          }}
        >
          <span style={{
            display: 'inline-block',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            fontSize: '10px',
          }}>
            &#9654;
          </span>
          {label}
        </button>
        {open && (
          <div style={{
            padding: '0 12px 8px',
            wordBreak: 'break-word',
          }}>
            {markdownContent}
          </div>
        )}
      </div>
    );
  }

  // Default non-collapsible rendering
  return (
    <div className="radchat-block-text" style={{
      background: 'var(--radchat-background-color, #f8fafc)',
      color: 'var(--radchat-text-color, #1e293b)',
      padding: '8px 12px',
      borderRadius: '12px',
      borderTopLeftRadius: '4px',
      marginBottom: '8px',
      width: 'fit-content',
      maxWidth: '100%',
      fontSize: '13px',
      lineHeight: '1.5',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {markdownContent}
    </div>
  );
}
