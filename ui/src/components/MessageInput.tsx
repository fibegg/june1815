import {
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { ImagePlus, Paperclip, Send, Square, GitFork, ListPlus, X } from 'lucide-react';
import { Button } from './ui/Button.js';
import { Textarea } from './ui/Textarea.js';
import { cn } from '@/lib/cn.js';
import type { AttachmentInput } from '@/lib/types.js';

export interface MessageInputProps {
  busy: boolean;
  onSend(text: string, attachments: readonly AttachmentInput[]): void;
  onQueue(text: string, attachments: readonly AttachmentInput[]): void;
  onSteer(text: string): void;
  onInterrupt(): void;
  disabled?: boolean;
}

interface Pending {
  id: string;
  name: string;
  preview: string;
  contentType: string;
  dataUrl: string;
  kind: 'image' | 'file';
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export function MessageInput({
  busy,
  onSend,
  onQueue,
  onSteer,
  onInterrupt,
  disabled,
}: MessageInputProps): JSX.Element {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<readonly Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reset = (): void => {
    setText('');
    setPending([]);
    setError(null);
  };

  const buildAttachments = (): AttachmentInput[] =>
    pending.map((p) => ({
      kind: p.kind,
      dataUrl: p.dataUrl,
      contentType: p.contentType,
      name: p.name,
    }));

  const handleAddFiles = async (files: FileList | File[]): Promise<void> => {
    setError(null);
    const accepted: Pending[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setError(`${f.name}: file exceeds ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB cap`);
        continue;
      }
      const dataUrl = await readFileAsDataUrl(f);
      const kind: 'image' | 'file' = f.type.startsWith('image/') ? 'image' : 'file';
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: f.name,
        contentType: f.type || 'application/octet-stream',
        dataUrl,
        kind,
        preview: kind === 'image' ? dataUrl : '',
      });
    }
    if (accepted.length > 0) {
      setPending((prev) => [...prev, ...accepted]);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void handleAddFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void handleAddFiles(files);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter to send (Shift+Enter / Cmd+Enter for newline)
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed.length === 0 && pending.length === 0) return;
      if (busy) {
        // While the model is responding, Enter steers; only text is sent
        // since steering with attachments isn't supported by claude TUI's
        // steer affordance.
        onSteer(trimmed.length > 0 ? trimmed : '(continue)');
      } else {
        onSend(trimmed, buildAttachments());
      }
      reset();
    }
  };

  const handleQueueClick = (): void => {
    const trimmed = text.trim();
    if (trimmed.length === 0 && pending.length === 0) return;
    onQueue(trimmed, buildAttachments());
    reset();
  };

  const removePending = (id: string): void => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div
      className={cn(
        'border-t border-border bg-card p-3',
        dragging && 'ring-2 ring-primary ring-inset',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {pending.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {pending.map((p) => (
            <li
              key={p.id}
              className="group relative flex items-center gap-2 rounded-md border border-border bg-secondary/50 p-1 pr-2 text-xs"
            >
              {p.kind === 'image' ? (
                <img src={p.preview} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded bg-secondary">
                  <Paperclip className="h-4 w-4" />
                </span>
              )}
              <span className="max-w-[14rem] truncate">{p.name}</span>
              <button
                type="button"
                onClick={() => removePending(p.id)}
                className="ml-1 rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                aria-label={`remove ${p.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      <div className="flex items-end gap-2">
        <Textarea
          placeholder={
            disabled
              ? 'select a conversation to send messages'
              : busy
                ? 'Enter to steer · Esc to interrupt · Shift+Enter for newline'
                : 'Message claude · Enter to send · Shift+Enter for newline'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled === true}
          rows={3}
          className="flex-1"
        />
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => fileRef.current?.click()}
            disabled={disabled === true}
            aria-label="attach image or file"
            title="attach image or file"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          {busy ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={onInterrupt}
                aria-label="interrupt"
                title="interrupt"
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={handleQueueClick}
                disabled={disabled === true}
                aria-label="queue for next turn"
                title="queue for next turn"
              >
                <ListPlus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                onClick={() => {
                  const trimmed = text.trim();
                  if (trimmed.length === 0) return;
                  onSteer(trimmed);
                  reset();
                }}
                disabled={disabled === true || text.trim().length === 0}
                aria-label="steer current turn"
                title="steer current turn"
              >
                <GitFork className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={() => {
                const trimmed = text.trim();
                if (trimmed.length === 0 && pending.length === 0) return;
                onSend(trimmed, buildAttachments());
                reset();
              }}
              disabled={disabled === true}
              aria-label="send"
              title="send"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
