/**
 * TypingIndicator — animated "thinking" dots shown while awaiting a response.
 * Rendered as an assistant message widget and removed once the answer arrives.
 * Respects prefers-reduced-motion (see typing-indicator.css).
 */
import './typing-indicator.css';

export function TypingIndicator() {
  return (
    <div className="radchat-typing-indicator" role="status" aria-label="Assistant is thinking">
      <span />
      <span />
      <span />
    </div>
  );
}
