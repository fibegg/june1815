import { useEffect, useRef } from 'react';
import { Bot, User, Wrench, BarChart3, AlertCircle, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/cn.js';

export type RenderedMessage =
  | { kind: 'user'; text: string; attachments: number; messageId: string }
  | { kind: 'assistant'; text: string; messageId: string }
  | { kind: 'reasoning'; text: string; messageId: string }
  | { kind: 'tool_use'; name: string; summary?: string; messageId: string }
  | { kind: 'usage'; inputTokens: number; outputTokens: number; messageId: string }
  | { kind: 'permission'; question: string; messageId: string }
  | { kind: 'error'; code: string; text: string; messageId: string };

export interface MessageListProps {
  messages: readonly RenderedMessage[];
}

export function MessageList({ messages }: MessageListProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-6">
      {messages.length === 0 && (
        <p className="m-auto text-sm text-muted-foreground">
          Pick a conversation or start a new one to begin.
        </p>
      )}
      {messages.map((m, i) => (
        <MessageRow key={`${m.messageId}-${i}`} m={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageRow({ m }: { m: RenderedMessage }): JSX.Element {
  switch (m.kind) {
    case 'user':
      return (
        <Row icon={<User className="h-4 w-4" />} align="right" tint="primary">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">{m.text}</pre>
          {m.attachments > 0 && (
            <p className="mt-1 text-xs opacity-80">
              {m.attachments} attachment{m.attachments === 1 ? '' : 's'}
            </p>
          )}
        </Row>
      );
    case 'assistant':
      return (
        <Row icon={<Bot className="h-4 w-4" />} align="left" tint="card">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">{m.text}</pre>
        </Row>
      );
    case 'reasoning':
      return (
        <Row icon={<Bot className="h-4 w-4" />} align="left" tint="muted">
          <pre className="reasoning">{m.text}</pre>
        </Row>
      );
    case 'tool_use':
      return (
        <Row icon={<Wrench className="h-4 w-4" />} align="left" tint="muted">
          <p className="text-sm">
            <span className="font-medium">{m.name}</span>
            {m.summary && (
              <span className="ml-2 text-muted-foreground">{m.summary}</span>
            )}
          </p>
        </Row>
      );
    case 'usage':
      return (
        <Row icon={<BarChart3 className="h-3.5 w-3.5" />} align="left" tint="muted">
          <p className="text-xs text-muted-foreground">
            {m.inputTokens} in / {m.outputTokens} out
          </p>
        </Row>
      );
    case 'permission':
      return (
        <Row icon={<ShieldQuestion className="h-4 w-4" />} align="left" tint="muted">
          <p className="text-sm">{m.question}</p>
        </Row>
      );
    case 'error':
      return (
        <Row icon={<AlertCircle className="h-4 w-4" />} align="left" tint="destructive">
          <p className="text-sm font-medium">{m.code}</p>
          <p className="text-xs opacity-90">{m.text}</p>
        </Row>
      );
  }
}

interface RowProps {
  icon: React.ReactNode;
  align: 'left' | 'right';
  tint: 'primary' | 'card' | 'muted' | 'destructive';
  children: React.ReactNode;
}

const TINT_CLASSES: Record<RowProps['tint'], string> = {
  primary: 'bg-primary/10 border-primary/20 text-foreground',
  card: 'bg-card border-border',
  muted: 'bg-muted border-border',
  destructive: 'bg-destructive/10 border-destructive/30 text-destructive',
};

function Row({ icon, align, tint, children }: RowProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex w-full items-start gap-2',
        align === 'right' ? 'justify-end' : 'justify-start',
      )}
    >
      {align === 'left' && (
        <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          {icon}
        </span>
      )}
      <div
        className={cn(
          'max-w-[80ch] rounded-lg border px-3 py-2 shadow-sm',
          TINT_CLASSES[tint],
        )}
      >
        {children}
      </div>
      {align === 'right' && (
        <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          {icon}
        </span>
      )}
    </div>
  );
}
