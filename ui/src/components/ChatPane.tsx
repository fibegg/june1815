import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageList, type RenderedMessage } from './MessageList.js';
import { MessageInput } from './MessageInput.js';
import {
  interrupt as apiInterrupt,
  queueMessage,
  steerMessage,
  streamMessage,
} from '@/lib/api.js';
import type { AttachmentInput, SseEvent } from '@/lib/types.js';

interface ChatPaneProps {
  conversationId: string | null;
}

interface InFlight {
  messageId: string;
  controller: AbortController;
}

function newMessageId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatPane({ conversationId }: ChatPaneProps): JSX.Element {
  const [messages, setMessages] = useState<readonly RenderedMessage[]>([]);
  const [inFlight, setInFlight] = useState<InFlight | null>(null);
  const inFlightRef = useRef<InFlight | null>(null);

  // Reset transcript when the conversation changes.
  useEffect(() => {
    setMessages([]);
    if (inFlightRef.current) {
      inFlightRef.current.controller.abort();
      inFlightRef.current = null;
      setInFlight(null);
    }
  }, [conversationId]);

  const appendUser = useCallback(
    (text: string, attachments: number): RenderedMessage => {
      const msg: RenderedMessage = {
        kind: 'user',
        text,
        attachments,
        messageId: newMessageId(),
      };
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    [],
  );

  const handleEvent = useCallback(
    (turnId: string, e: SseEvent): void => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        switch (e.type) {
          case 'text_delta': {
            if (last && last.kind === 'assistant' && last.messageId === turnId) {
              const merged: RenderedMessage = { ...last, text: last.text + e.text };
              return [...prev.slice(0, -1), merged];
            }
            return [...prev, { kind: 'assistant', text: e.text, messageId: turnId }];
          }
          case 'reasoning_delta': {
            if (last && last.kind === 'reasoning' && last.messageId === turnId) {
              const merged: RenderedMessage = { ...last, text: last.text + e.text };
              return [...prev.slice(0, -1), merged];
            }
            return [...prev, { kind: 'reasoning', text: e.text, messageId: turnId }];
          }
          case 'tool_use':
            return [
              ...prev,
              {
                kind: 'tool_use',
                name: e.name,
                ...(e.summary !== undefined ? { summary: e.summary } : {}),
                messageId: turnId,
              },
            ];
          case 'usage':
            return [
              ...prev,
              {
                kind: 'usage',
                inputTokens: e.inputTokens,
                outputTokens: e.outputTokens,
                messageId: turnId,
              },
            ];
          case 'permission_prompt':
            return [
              ...prev,
              { kind: 'permission', question: e.question, messageId: turnId },
            ];
          case 'error':
            return [
              ...prev,
              { kind: 'error', code: e.code, text: e.message, messageId: turnId },
            ];
          default:
            return prev;
        }
      });
    },
    [],
  );

  const startStream = useCallback(
    async (text: string, attachments: readonly AttachmentInput[]): Promise<void> => {
      if (!conversationId) return;
      appendUser(text, attachments.length);
      const controller = new AbortController();
      const turnId = newMessageId();
      inFlightRef.current = { messageId: turnId, controller };
      setInFlight(inFlightRef.current);
      try {
        await streamMessage(
          conversationId,
          { text, ...(attachments.length > 0 ? { attachments: [...attachments] } : {}) },
          (e) => handleEvent(turnId, e),
          controller.signal,
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        handleEvent(turnId, {
          type: 'error',
          code: 'stream_failed',
          message: (err as Error).message,
        });
      } finally {
        if (inFlightRef.current?.messageId === turnId) {
          inFlightRef.current = null;
          setInFlight(null);
        }
      }
    },
    [conversationId, appendUser, handleEvent],
  );

  const handleQueue = useCallback(
    async (text: string, attachments: readonly AttachmentInput[]): Promise<void> => {
      if (!conversationId) return;
      appendUser(text, attachments.length);
      try {
        await queueMessage(conversationId, {
          text,
          ...(attachments.length > 0 ? { attachments: [...attachments] } : {}),
        });
      } catch (err) {
        handleEvent(newMessageId(), {
          type: 'error',
          code: 'queue_failed',
          message: (err as Error).message,
        });
      }
    },
    [conversationId, appendUser, handleEvent],
  );

  const handleSteer = useCallback(
    async (text: string): Promise<void> => {
      if (!conversationId) return;
      appendUser(`[steer] ${text}`, 0);
      try {
        await steerMessage(conversationId, text);
      } catch (err) {
        handleEvent(newMessageId(), {
          type: 'error',
          code: 'steer_failed',
          message: (err as Error).message,
        });
      }
    },
    [conversationId, appendUser, handleEvent],
  );

  const handleInterrupt = useCallback(async (): Promise<void> => {
    if (!conversationId) return;
    try {
      await apiInterrupt(conversationId);
      inFlightRef.current?.controller.abort();
      inFlightRef.current = null;
      setInFlight(null);
    } catch (err) {
      handleEvent(newMessageId(), {
        type: 'error',
        code: 'interrupt_failed',
        message: (err as Error).message,
      });
    }
  }, [conversationId, handleEvent]);

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          {conversationId ? (
            <p className="truncate font-mono text-sm">{conversationId}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No conversation selected</p>
          )}
        </div>
      </header>
      <MessageList messages={messages} />
      <MessageInput
        busy={inFlight !== null}
        disabled={conversationId === null}
        onSend={(text, attachments) => void startStream(text, attachments)}
        onQueue={(text, attachments) => void handleQueue(text, attachments)}
        onSteer={(text) => void handleSteer(text)}
        onInterrupt={() => void handleInterrupt()}
      />
    </main>
  );
}
