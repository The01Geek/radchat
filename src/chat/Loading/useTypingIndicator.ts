/** Message type used for the typing indicator placeholder in the transcript. */
export const TYPING_INDICATOR_WIDGET = 'radchatTypingIndicator';

/** Payload marker for identifying typing indicator messages. */
export interface TypingIndicatorPayload {
  isTypingIndicator: true;
}

/** True when a chat message is the typing indicator placeholder. */
export function isTypingIndicator(message: { type?: string; widget?: string; payload?: unknown }): boolean {
  const payload = message.payload as Partial<TypingIndicatorPayload> | undefined;
  return (
    message.type === TYPING_INDICATOR_WIDGET ||
    message.widget === TYPING_INDICATOR_WIDGET ||
    payload?.isTypingIndicator === true
  );
}
