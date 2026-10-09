/**
 * AttachmentPicker — paperclip button, Image / Document / Camera menu, and the
 * row of attachment chips above the input.
 *
 * Files are read in the browser as `data:` URIs and staged until the next
 * message is sent. Nothing is uploaded by the picker itself; the data source
 * receives the attachments with the message.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { AttachmentOptions, ChatAttachment } from '../types';
import './AttachmentPicker.css';

/** Default document whitelist, keyed by extension (browsers report inconsistent MIME types). */
export const DEFAULT_DOCUMENT_TYPES: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.zip': ['application/zip', 'application/x-zip-compressed'],
  '.txt': ['text/plain'],
  '.csv': ['text/csv'],
  '.md': ['text/markdown'],
  '.json': ['application/json'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

export const DEFAULT_MAX_ATTACHMENTS = 5;
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/** Lowercased extension including the dot, or '' when there is none. */
export const getExtension = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
};

const formatMegabytes = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

let attachmentCounter = 0;
const generateId = () => `attachment-${Date.now()}-${attachmentCounter++}`;

export interface AttachmentPickerProps {
  options: AttachmentOptions;
  /** Called with the full staged list after every change. */
  onAttachmentsChange: (attachments: ChatAttachment[]) => void;
  /** Subscribe to resets (e.g. after a message takes the attachments). Returns an unsubscribe function. */
  subscribeReset?: (listener: (attachments: ChatAttachment[]) => void) => () => void;
  /** Element above the input form where the chips render. */
  chipContainer: HTMLElement | null;
}

export function AttachmentPicker({ options, onAttachmentsChange, subscribeReset, chipContainer }: AttachmentPickerProps) {
  const sources = options.sources ?? ['image', 'document', 'camera'];
  const maxCount = options.maxCount ?? DEFAULT_MAX_ATTACHMENTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  // Keyed by the joined list so a new array with the same entries does not re-create handlers.
  const extensionsKey = (options.documentExtensions ?? Object.keys(DEFAULT_DOCUMENT_TYPES))
    .map((e) => (e.startsWith('.') ? e : `.${e}`).toLowerCase())
    .join(',');
  const documentExtensions = useMemo(() => extensionsKey.split(',').filter(Boolean), [extensionsKey]);
  const documentAccept = documentExtensions
    .flatMap((ext) => [ext, ...(DEFAULT_DOCUMENT_TYPES[ext] ?? [])])
    .join(',');

  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef<ChatAttachment[]>([]);

  const commit = useCallback(
    (next: ChatAttachment[]) => {
      attachmentsRef.current = next;
      setAttachments(next);
      onAttachmentsChange(next);
    },
    [onAttachmentsChange],
  );

  // Errors clear themselves after a few seconds.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  // Clear chips when the controller takes the attachments for a message.
  useEffect(() => {
    if (!subscribeReset) return;
    return subscribeReset((next) => {
      attachmentsRef.current = next;
      setAttachments(next);
    });
  }, [subscribeReset]);

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setIsExpanded(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsExpanded(false);
      }
    };
    const frame = requestAnimationFrame(() => document.addEventListener('mousedown', handleClickOutside));
    document.addEventListener('keydown', handleKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [isExpanded]);

  const addAttachment = useCallback(
    (attachment: ChatAttachment) => {
      const current = attachmentsRef.current;
      if (current.length >= maxCount) {
        setError(`You can attach up to ${maxCount} files.`);
        return;
      }
      commit([...current, attachment]);
    },
    [commit, maxCount],
  );

  const removeAttachment = useCallback(
    (id: string) => commit(attachmentsRef.current.filter((a) => a.id !== id)),
    [commit],
  );

  const readAndAddFile = useCallback(
    (file: File, type: ChatAttachment['type']) => {
      const reader = new FileReader();
      reader.onload = () => {
        addAttachment({
          id: generateId(),
          type,
          name: file.name,
          data: String(reader.result ?? ''),
          size: file.size,
          mimeType: file.type || undefined,
        });
      };
      reader.onerror = () => {
        console.error('[RadChat] Failed to read file:', file.name, reader.error);
        setError(`"${file.name}" could not be read. Please try again.`);
      };
      reader.readAsDataURL(file);
    },
    [addAttachment],
  );

  const handleImageSelect = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          setError('Only images can be added here. Use Document for other files.');
          continue;
        }
        if (file.size > maxBytes) {
          setError(`"${file.name}" is larger than ${formatMegabytes(maxBytes)}.`);
          continue;
        }
        readAndAddFile(file, 'image');
      }
    },
    [maxBytes, readAndAddFile],
  );

  const handleDocumentSelect = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        if (!documentExtensions.includes(getExtension(file.name))) {
          setError(`That file type is not supported. Supported documents: ${documentExtensions.join(', ')}`);
          continue;
        }
        if (file.size > maxBytes) {
          setError(`"${file.name}" is larger than ${formatMegabytes(maxBytes)}.`);
          continue;
        }
        readAndAddFile(file, 'file');
      }
    },
    [maxBytes, readAndAddFile, documentExtensions],
  );

  /** Open an image in a new tab or download a document so the user can check it before sending. */
  const handlePreview = useCallback((attachment: ChatAttachment) => {
    if (attachment.type === 'image') {
      const win = window.open('', '_blank');
      if (win) {
        const img = win.document.createElement('img');
        img.src = attachment.data;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        win.document.body.appendChild(img);
        win.document.title = attachment.name;
      }
      return;
    }
    const a = document.createElement('a');
    a.href = attachment.data;
    a.download = attachment.name;
    a.click();
  }, []);

  const openInput = (ref: React.RefObject<HTMLInputElement | null>) => {
    ref.current?.click();
    setIsExpanded(false);
  };

  // Allow selecting the same file again after removing it.
  const resetInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.target.value = '';
  };

  return (
    <div className="radchat-attachment-picker" ref={pickerRef}>
      <button
        type="button"
        className="radchat-attachment-picker-toggle"
        onClick={() => setIsExpanded((v) => !v)}
        aria-label={attachments.length > 0 ? `Add attachments (${attachments.length} attached)` : 'Add attachments'}
        aria-expanded={isExpanded}
        aria-haspopup="menu"
        title="Add attachments"
      >
        <svg
          className="radchat-attachment-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
        {attachments.length > 0 && (
          <span className="radchat-attachment-count" aria-hidden="true">
            {attachments.length}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="radchat-attachment-menu" role="menu" aria-label="Add attachment">
          <div className="radchat-attachment-menu-header">
            <span>Add attachment</span>
            <button
              type="button"
              className="radchat-attachment-menu-close"
              onClick={() => setIsExpanded(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="radchat-attachment-options">
            {sources.includes('image') && (
              <button type="button" role="menuitem" className="radchat-attachment-option" onClick={() => openInput(fileInputRef)}>
                <span className="radchat-attachment-option-icon" aria-hidden="true">🖼️</span>
                <span className="radchat-attachment-option-label">Image</span>
              </button>
            )}
            {sources.includes('document') && (
              <button type="button" role="menuitem" className="radchat-attachment-option" onClick={() => openInput(documentInputRef)}>
                <span className="radchat-attachment-option-icon" aria-hidden="true">📄</span>
                <span className="radchat-attachment-option-label">Document</span>
              </button>
            )}
            {sources.includes('camera') && (
              <button type="button" role="menuitem" className="radchat-attachment-option" onClick={() => openInput(cameraInputRef)}>
                <span className="radchat-attachment-option-icon" aria-hidden="true">📷</span>
                <span className="radchat-attachment-option-label">Camera</span>
              </button>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        data-testid="radchat-image-input"
        onChange={(e) => {
          handleImageSelect(e.target.files);
          resetInput(e);
        }}
        style={{ display: 'none' }}
      />
      <input
        ref={documentInputRef}
        type="file"
        multiple
        accept={documentAccept}
        data-testid="radchat-document-input"
        onChange={(e) => {
          handleDocumentSelect(e.target.files);
          resetInput(e);
        }}
        style={{ display: 'none' }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          handleImageSelect(e.target.files);
          resetInput(e);
        }}
        style={{ display: 'none' }}
      />

      {chipContainer &&
        (attachments.length > 0 || error) &&
        createPortal(
          <>
            {error && (
              <div className="radchat-attachment-error" role="alert">
                {error}
              </div>
            )}
            {attachments.length > 0 && (
              <div className="radchat-attachment-chips">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="radchat-attachment-chip">
                    {attachment.type === 'image' ? (
                      <img src={attachment.data} alt="" className="radchat-attachment-chip-thumb" />
                    ) : (
                      <span className="radchat-attachment-chip-icon" aria-hidden="true">📄</span>
                    )}
                    {attachment.type === 'file' && getExtension(attachment.name) && (
                      <span className="radchat-attachment-chip-badge">
                        {getExtension(attachment.name).slice(1).toUpperCase()}
                      </span>
                    )}
                    <button
                      type="button"
                      className="radchat-attachment-chip-name"
                      title="Preview"
                      onClick={() => handlePreview(attachment)}
                    >
                      {attachment.name}
                    </button>
                    <button
                      type="button"
                      className="radchat-attachment-chip-remove"
                      onClick={() => removeAttachment(attachment.id)}
                      aria-label={`Remove ${attachment.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>,
          chipContainer,
        )}
    </div>
  );
}
