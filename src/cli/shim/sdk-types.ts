/**
 * Wire-protocol types for the stream-json shim. These mirror the shape
 * that any caller using the official stream-json IPC mode of `claude`
 * expects to read on stdout (and write on stdin). They are intentionally
 * narrow: only the fields the shim produces or consumes are typed. Other
 * fields documented in the canonical SDK are passed through opaquely.
 *
 * No SDK package is depended on — this stays a zero-runtime-dep
 * description of the wire.
 */

/* ─────────────────────────── input shape ─────────────────────────── */

export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface ImageBlockBase64 {
  readonly type: 'image';
  readonly source: {
    readonly type: 'base64';
    readonly media_type: string;
    readonly data: string;
  };
}

export type ContentBlock = TextBlock | ImageBlockBase64 | { readonly type: string };

export interface UserMessageIn {
  readonly type: 'user';
  readonly session_id?: string;
  readonly parent_tool_use_id?: string | null;
  readonly message: {
    readonly role: 'user';
    readonly content: readonly ContentBlock[] | string;
  };
}

/* ─────────────────────────── output shape ─────────────────────────── */

export interface SystemInit {
  readonly type: 'system';
  readonly subtype: 'init';
  readonly cwd: string;
  readonly tools: readonly string[];
  readonly mcp_servers: readonly { readonly name: string; readonly status: string }[];
  readonly model: string;
  readonly permissionMode: string;
  readonly uuid: string;
  readonly session_id: string;
}

/** Inner `event` payload of a `stream_event` message. */
export type StreamInnerEvent =
  | {
      readonly type: 'message_start';
      readonly message: { readonly usage?: Usage };
    }
  | {
      readonly type: 'message_delta';
      readonly usage?: Usage;
    }
  | { readonly type: 'message_stop' }
  | {
      readonly type: 'content_block_start';
      readonly index: number;
      readonly content_block:
        | { readonly type: 'text'; readonly text: string }
        | { readonly type: 'thinking'; readonly thinking: string }
        | {
            readonly type: 'tool_use';
            readonly id: string;
            readonly name: string;
            readonly input: Record<string, unknown>;
          };
    }
  | {
      readonly type: 'content_block_delta';
      readonly index: number;
      readonly delta:
        | { readonly type: 'text_delta'; readonly text: string }
        | { readonly type: 'thinking_delta'; readonly thinking: string }
        | { readonly type: 'input_json_delta'; readonly partial_json: string };
    }
  | { readonly type: 'content_block_stop'; readonly index: number };

export interface StreamEventMessage {
  readonly type: 'stream_event';
  readonly parent_tool_use_id: string | null;
  readonly uuid: string;
  readonly session_id: string;
  readonly event: StreamInnerEvent;
}

export interface Usage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
}

export interface AssistantContentText {
  readonly type: 'text';
  readonly text: string;
}
export interface AssistantContentToolUse {
  readonly type: 'tool_use';
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}
export type AssistantContent = AssistantContentText | AssistantContentToolUse;

export interface AssistantMessage {
  readonly type: 'assistant';
  readonly parent_tool_use_id: string | null;
  readonly uuid: string;
  readonly session_id: string;
  readonly message: {
    readonly id: string;
    readonly type: 'message';
    readonly role: 'assistant';
    readonly model: string;
    readonly content: readonly AssistantContent[];
    readonly stop_reason: string | null;
    readonly stop_sequence: string | null;
    readonly usage: Usage;
  };
}

export interface ResultSuccess {
  readonly type: 'result';
  readonly subtype: 'success';
  readonly duration_ms: number;
  readonly duration_api_ms: number;
  readonly is_error: false;
  readonly num_turns: number;
  readonly result: string;
  readonly stop_reason: string | null;
  readonly total_cost_usd: number;
  readonly usage: Usage;
  readonly modelUsage: Record<string, unknown>;
  readonly permission_denials: readonly unknown[];
  readonly uuid: string;
  readonly session_id: string;
}

export interface ResultError {
  readonly type: 'result';
  readonly subtype: 'error';
  readonly duration_ms: number;
  readonly duration_api_ms: number;
  readonly is_error: true;
  readonly num_turns: number;
  readonly result: string;
  readonly errors: readonly string[];
  readonly usage: Usage;
  readonly modelUsage: Record<string, unknown>;
  readonly permission_denials: readonly unknown[];
  readonly uuid: string;
  readonly session_id: string;
}

export type Result = ResultSuccess | ResultError;

export type OutboundMessage =
  | SystemInit
  | StreamEventMessage
  | AssistantMessage
  | Result;
