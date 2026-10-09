/**
 * Places the AttachmentPicker inside react-chatbot-kit's input form.
 *
 * The kit owns the form markup, so this component creates two elements in it —
 * a wrapper before the text input for the paperclip, and a chips row above the
 * form — and renders into them with portals. Both are found inside this
 * widget's root, so several widgets can share a page.
 */
import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AttachmentPicker, type AttachmentPickerProps } from './AttachmentPicker';

interface AttachmentPickerIntegrationProps extends Omit<AttachmentPickerProps, 'chipContainer'> {
  rootRef: RefObject<HTMLElement | null>;
  /** Changes when the chat remounts (new conversation) so the elements are re-created. */
  resetKey?: number;
}

interface Targets {
  wrapper: HTMLElement;
  chips: HTMLElement;
}

export function AttachmentPickerIntegration({ rootRef, resetKey = 0, ...pickerProps }: AttachmentPickerIntegrationProps) {
  const [targets, setTargets] = useState<Targets | null>(null);

  useEffect(() => {
    let created: Targets | null = null;
    let attempts = 0;

    const tryAttach = () => {
      const form = rootRef.current?.querySelector<HTMLFormElement>('.react-chatbot-kit-chat-input-form');
      if (!form) return false;

      const wrapper = document.createElement('div');
      wrapper.className = 'radchat-attachment-picker-wrapper';
      form.insertBefore(wrapper, form.firstChild);

      const chips = document.createElement('div');
      chips.className = 'radchat-attachment-chips-row';
      form.parentElement?.insertBefore(chips, form);

      created = { wrapper, chips };
      setTargets(created);
      return true;
    };

    let interval: ReturnType<typeof setInterval> | undefined;
    if (!tryAttach()) {
      interval = setInterval(() => {
        attempts++;
        if (tryAttach() || attempts >= 50) clearInterval(interval);
      }, 100);
    }

    return () => {
      if (interval) clearInterval(interval);
      const toRemove = created as Targets | null;
      setTargets(null);
      if (toRemove) {
        // Let React remove the portal content before the containers go away.
        setTimeout(() => {
          toRemove.wrapper.remove();
          toRemove.chips.remove();
        }, 0);
      }
    };
  }, [rootRef, resetKey]);

  if (!targets) return null;
  return createPortal(<AttachmentPicker {...pickerProps} chipContainer={targets.chips} />, targets.wrapper);
}
