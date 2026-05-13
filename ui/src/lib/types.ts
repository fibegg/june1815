// Client-side mirror of the server's SSE event shape. Kept narrow on
// purpose — the source of truth is `src/server/events.ts` in the package
// root. When that file changes, mirror the additions here.

export type SseEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_use'; name: string; summary?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'interrupted'; at?: 'reasoning' | 'text' | 'tool' }
  | { type: 'done'; messageId: string; sessionId?: string; usage?: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; code: string; message: string }
  | { type: 'auth_required'; url: string; method?: 'oauth' | 'token' }
  | { type: 'permission_prompt'; question: string }
  | { type: 'ping' };

export interface ConversationSummary {
  id: string;
  cwd: string;
  state: 'starting' | 'ready' | 'busy' | 'killed';
  pendingCount: number;
}

export interface CreateConversationInput {
  cwd: string;
  model?: string;
  effort?: string;
  systemPromptAppend?: string;
}

export interface AttachmentInput {
  kind: 'image' | 'file';
  dataUrl: string;
  contentType?: string;
  name?: string;
}

export interface SendMessageInput {
  text: string;
  attachments?: AttachmentInput[];
}

export interface AuthStatus {
  authenticated: boolean;
  source: string;
  envKey?: string;
  path?: string;
  identity?: {
    email?: string;
    orgName?: string;
    subscriptionType?: string;
    authMethod?: string;
  };
}
