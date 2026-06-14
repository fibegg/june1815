import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { z } from 'zod';

createRequire(import.meta.url);
const __filename$1 = fileURLToPath(import.meta.url);
dirname(__filename$1);
var TextDeltaSchema = z.object({
  type: z.literal("text_delta"),
  text: z.string()
});
var ReasoningDeltaSchema = z.object({
  type: z.literal("reasoning_delta"),
  text: z.string()
});
var ToolUseSchema = z.object({
  type: z.literal("tool_use"),
  name: z.string(),
  summary: z.string().optional()
});
var UsageSchema = z.object({
  type: z.literal("usage"),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative()
});
var InterruptedSchema = z.object({
  type: z.literal("interrupted"),
  at: z.enum(["reasoning", "text", "tool"]).optional()
});
var DoneSchema = z.object({
  type: z.literal("done"),
  messageId: z.string(),
  sessionId: z.string().optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative()
  }).optional()
});
var ErrorEventSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string()
});
var AuthRequiredSchema = z.object({
  type: z.literal("auth_required"),
  url: z.string(),
  method: z.enum(["oauth", "token"]).default("oauth")
});
var PermissionPromptSchema = z.object({
  type: z.literal("permission_prompt"),
  question: z.string()
});
var PingSchema = z.object({
  type: z.literal("ping")
});
var SseEventSchema = z.discriminatedUnion("type", [
  TextDeltaSchema,
  ReasoningDeltaSchema,
  ToolUseSchema,
  UsageSchema,
  InterruptedSchema,
  DoneSchema,
  ErrorEventSchema,
  AuthRequiredSchema,
  PermissionPromptSchema,
  PingSchema
]);

export { AuthRequiredSchema, DoneSchema, ErrorEventSchema, InterruptedSchema, PermissionPromptSchema, PingSchema, ReasoningDeltaSchema, SseEventSchema, TextDeltaSchema, ToolUseSchema, UsageSchema };
//# sourceMappingURL=events.js.map
//# sourceMappingURL=events.js.map