/**
 * MarkdownMessage — renders assistant text with GitHub-flavored Markdown.
 *
 * Raw HTML in the Markdown is not rendered (react-markdown escapes it), and
 * react-markdown's default URL transform drops unsafe schemes such as
 * `javascript:`. Links open in a new tab unless the host intercepts them.
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SafeLink } from '../shared/SafeLink';
import './MarkdownMessage.css';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

const FENCE_RE = /^\s*(```|~~~)/;

/**
 * Splits inline lists that models often emit on one line ("1. a 2. b",
 * "- a - b") onto separate lines so they render as lists.
 *
 * Lines inside fenced code blocks, table rows, and lines containing inline
 * code are left untouched so SQL such as `a - b` and Markdown tables survive.
 */
export const preprocessMarkdown = (content: string): string => {
  if (!content) return content;

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let inFence = false;

  return lines
    .map((line) => {
      if (FENCE_RE.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || line.trimStart().startsWith('|') || line.includes('`')) return line;

      let processed = line;
      // "1. text 2. text" -> "1. text\n2. text"
      processed = processed.replace(/(\S)\s+(\d+)\.\s+/g, '$1\n$2. ');
      // "- text - text" -> "- text\n- text"
      processed = processed.replace(/(\S)\s+-\s+/g, '$1\n- ');
      // "* text * text" -> "* text\n* text" (not bold markers)
      processed = processed.replace(/(\S)\s+\*\s+(?!\*)/g, '$1\n* ');
      return processed;
    })
    .join('\n');
};

type ChildrenProps = { children?: React.ReactNode };

const markdownComponents = {
  p: ({ children }: ChildrenProps) => <p className="radchat-md-paragraph">{children}</p>,
  ul: ({ children }: ChildrenProps) => <ul className="radchat-md-list radchat-md-list-unordered">{children}</ul>,
  ol: ({ children }: ChildrenProps) => <ol className="radchat-md-list radchat-md-list-ordered">{children}</ol>,
  li: ({ children }: ChildrenProps) => <li className="radchat-md-list-item">{children}</li>,
  strong: ({ children }: ChildrenProps) => <strong className="radchat-md-bold">{children}</strong>,
  em: ({ children }: ChildrenProps) => <em className="radchat-md-italic">{children}</em>,
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isInline = !className;
    return isInline
      ? <code className="radchat-md-code-inline">{children}</code>
      : <code className={`radchat-md-code-block ${className || ''}`}>{children}</code>;
  },
  table: ({ children }: ChildrenProps) => (
    <div className="radchat-md-table-wrapper">
      <table className="radchat-md-table">{children}</table>
    </div>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <SafeLink href={href} className="radchat-md-link">
      {children}
    </SafeLink>
  ),
};

const remarkPlugins = [remarkGfm];

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content, className = '' }) => {
  const processedContent = preprocessMarkdown(content);
  return (
    <div className={`radchat-md-message ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownMessage;
