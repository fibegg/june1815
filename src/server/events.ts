import { z } from 'zod';

/**
 * Schemas for every event the server emits over SSE. Exported as a public
 * subpath (`june15/events`) so consumers can import the zod schemas (or the
 * inferred TS types) without depending on internals.
 */

export const TextDeltaSchema = z.object({
  type: z.literal('text_delta'),
  text: z.string(),
});
export type TextDeltaEvent = z.infer<typeof TextDeltaSchema>;

export const ReasoningDeltaSchema = z.object({
  type: z.literal('reasoning_delta'),
  text: z.string(),
});
export type ReasoningDeltaEvent = z.infer<typeof ReasoningDeltaSchema>;

export const ToolUseSchema = z.object({
  type: z.literal('tool_use'),
  name: z.string(),
  summary: z.string().optional(),
});
export type ToolUseEvent = z.infer<typeof ToolUseSchema>;

export const UsageSchema = z.object({
  type: z.literal('usage'),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type UsageEvent = z.infer<typeof UsageSchema>;

export const InterruptedSchema = z.object({
  type: z.literal('interrupted'),
  at: z.enum(['reasoning', 'text', 'tool']).optional(),
});
export type InterruptedEvent = z.infer<typeof InterruptedSchema>;

export const DoneSchema = z.object({
  type: z.literal('done'),
  messageId: z.string(),
  sessionId: z.string().optional(),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    })
    .optional(),
});
export type DoneEvent = z.infer<typeof DoneSchema>;

export const ErrorEventSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export const AuthRequiredSchema = z.object({
  type: z.literal('auth_required'),
  url: z.string(),
  method: z.enum(['oauth', 'token']).default('oauth'),
});
export type AuthRequiredEvent = z.infer<typeof AuthRequiredSchema>;

export const PermissionPromptSchema = z.object({
  type: z.literal('permission_prompt'),
  question: z.string(),
});
export type PermissionPromptEvent = z.infer<typeof PermissionPromptSchema>;

export const PingSchema = z.object({
  type: z.literal('ping'),
});
export type PingEvent = z.infer<typeof PingSchema>;

export const SseEventSchema = z.discriminatedUnion('type', [
  TextDeltaSchema,
  ReasoningDeltaSchema,
  ToolUseSchema,
  UsageSchema,
  InterruptedSchema,
  DoneSchema,
  ErrorEventSchema,
  AuthRequiredSchema,
  PermissionPromptSchema,
  PingSchema,
]);
export type SseEvent = z.infer<typeof SseEventSchema>;
