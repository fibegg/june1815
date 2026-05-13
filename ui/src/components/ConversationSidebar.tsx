import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button.js';
import { Input } from './ui/Input.js';
import { Badge } from './ui/Badge.js';
import { cn } from '@/lib/cn.js';
import {
  createConversation,
  deleteConversation,
  listConversations,
} from '@/lib/api.js';
import type { ConversationSummary } from '@/lib/types.js';

export interface ConversationSidebarProps {
  selectedId: string | null;
  onSelect(id: string | null): void;
}

export function ConversationSidebar({
  selectedId,
  onSelect,
}: ConversationSidebarProps): JSX.Element {
  const [items, setItems] = useState<readonly ConversationSummary[]>([]);
  const [cwd, setCwd] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    try {
      const data = await listConversations();
      setItems(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearInterval(t);
    };
  }, []);

  const handleCreate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = cwd.trim();
    if (trimmed.length === 0) {
      setError('cwd is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const conv = await createConversation({ cwd: trimmed });
      setCwd('');
      await refresh();
      onSelect(conv.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await deleteConversation(id);
      if (selectedId === id) onSelect(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
            CONVERSATIONS
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refresh()}
            aria-label="refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-2">
          <Input
            placeholder="cwd e.g. /Users/you/project"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            disabled={busy}
          />
          <Button type="submit" disabled={busy} size="sm">
            <Plus className="h-4 w-4" />
            New conversation
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">no conversations yet</p>
        )}
        <ul className="flex flex-col gap-1">
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  'group flex w-full items-start gap-2 rounded-md p-2 text-left text-sm transition-colors',
                  selectedId === c.id
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/60 hover:text-accent-foreground',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{c.id.slice(0, 12)}</p>
                  <p className="truncate text-xs text-muted-foreground" title={c.cwd}>
                    {c.cwd}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={stateVariant(c.state)}>{c.state}</Badge>
                    {c.pendingCount > 0 && (
                      <Badge variant="outline">{c.pendingCount} queued</Badge>
                    )}
                  </div>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(c.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDelete(c.id);
                    }
                  }}
                  className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                  aria-label={`delete ${c.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function stateVariant(state: ConversationSummary['state']):
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline' {
  switch (state) {
    case 'ready':
      return 'default';
    case 'busy':
      return 'secondary';
    case 'killed':
      return 'destructive';
    default:
      return 'outline';
  }
}
