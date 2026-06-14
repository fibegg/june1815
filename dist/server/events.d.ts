import { z } from 'zod';

/**
 * Schemas for every event the server emits over SSE. Exported as a public
 * subpath (`june1815/events`) so consumers can import the zod schemas (or the
 * inferred TS types) without depending on internals.
 */
declare const TextDeltaSchema: z.ZodObject<{
    type: z.ZodLiteral<"text_delta">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "text_delta";
    text: string;
}, {
    type: "text_delta";
    text: string;
}>;
type TextDeltaEvent = z.infer<typeof TextDeltaSchema>;
declare const ReasoningDeltaSchema: z.ZodObject<{
    type: z.ZodLiteral<"reasoning_delta">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "reasoning_delta";
    text: string;
}, {
    type: "reasoning_delta";
    text: string;
}>;
type ReasoningDeltaEvent = z.infer<typeof ReasoningDeltaSchema>;
declare const ToolUseSchema: z.ZodObject<{
    type: z.ZodLiteral<"tool_use">;
    name: z.ZodString;
    summary: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "tool_use";
    name: string;
    summary?: string | undefined;
}, {
    type: "tool_use";
    name: string;
    summary?: string | undefined;
}>;
type ToolUseEvent = z.infer<typeof ToolUseSchema>;
declare const UsageSchema: z.ZodObject<{
    type: z.ZodLiteral<"usage">;
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "usage";
    inputTokens: number;
    outputTokens: number;
}, {
    type: "usage";
    inputTokens: number;
    outputTokens: number;
}>;
type UsageEvent = z.infer<typeof UsageSchema>;
declare const InterruptedSchema: z.ZodObject<{
    type: z.ZodLiteral<"interrupted">;
    at: z.ZodOptional<z.ZodEnum<["reasoning", "text", "tool"]>>;
}, "strip", z.ZodTypeAny, {
    type: "interrupted";
    at?: "text" | "reasoning" | "tool" | undefined;
}, {
    type: "interrupted";
    at?: "text" | "reasoning" | "tool" | undefined;
}>;
type InterruptedEvent = z.infer<typeof InterruptedSchema>;
declare const DoneSchema: z.ZodObject<{
    type: z.ZodLiteral<"done">;
    messageId: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        inputTokens: number;
        outputTokens: number;
    }, {
        inputTokens: number;
        outputTokens: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: "done";
    messageId: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    } | undefined;
    sessionId?: string | undefined;
}, {
    type: "done";
    messageId: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    } | undefined;
    sessionId?: string | undefined;
}>;
type DoneEvent = z.infer<typeof DoneSchema>;
declare const ErrorEventSchema: z.ZodObject<{
    type: z.ZodLiteral<"error">;
    code: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "error";
    code: string;
    message: string;
}, {
    type: "error";
    code: string;
    message: string;
}>;
type ErrorEvent = z.infer<typeof ErrorEventSchema>;
declare const AuthRequiredSchema: z.ZodObject<{
    type: z.ZodLiteral<"auth_required">;
    url: z.ZodString;
    method: z.ZodDefault<z.ZodEnum<["oauth", "token"]>>;
}, "strip", z.ZodTypeAny, {
    type: "auth_required";
    url: string;
    method: "oauth" | "token";
}, {
    type: "auth_required";
    url: string;
    method?: "oauth" | "token" | undefined;
}>;
type AuthRequiredEvent = z.infer<typeof AuthRequiredSchema>;
declare const PermissionPromptSchema: z.ZodObject<{
    type: z.ZodLiteral<"permission_prompt">;
    question: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "permission_prompt";
    question: string;
}, {
    type: "permission_prompt";
    question: string;
}>;
type PermissionPromptEvent = z.infer<typeof PermissionPromptSchema>;
declare const PingSchema: z.ZodObject<{
    type: z.ZodLiteral<"ping">;
}, "strip", z.ZodTypeAny, {
    type: "ping";
}, {
    type: "ping";
}>;
type PingEvent = z.infer<typeof PingSchema>;
declare const SseEventSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"text_delta">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "text_delta";
    text: string;
}, {
    type: "text_delta";
    text: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"reasoning_delta">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "reasoning_delta";
    text: string;
}, {
    type: "reasoning_delta";
    text: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"tool_use">;
    name: z.ZodString;
    summary: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "tool_use";
    name: string;
    summary?: string | undefined;
}, {
    type: "tool_use";
    name: string;
    summary?: string | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"usage">;
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "usage";
    inputTokens: number;
    outputTokens: number;
}, {
    type: "usage";
    inputTokens: number;
    outputTokens: number;
}>, z.ZodObject<{
    type: z.ZodLiteral<"interrupted">;
    at: z.ZodOptional<z.ZodEnum<["reasoning", "text", "tool"]>>;
}, "strip", z.ZodTypeAny, {
    type: "interrupted";
    at?: "text" | "reasoning" | "tool" | undefined;
}, {
    type: "interrupted";
    at?: "text" | "reasoning" | "tool" | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"done">;
    messageId: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        inputTokens: number;
        outputTokens: number;
    }, {
        inputTokens: number;
        outputTokens: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: "done";
    messageId: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    } | undefined;
    sessionId?: string | undefined;
}, {
    type: "done";
    messageId: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    } | undefined;
    sessionId?: string | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    code: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "error";
    code: string;
    message: string;
}, {
    type: "error";
    code: string;
    message: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"auth_required">;
    url: z.ZodString;
    method: z.ZodDefault<z.ZodEnum<["oauth", "token"]>>;
}, "strip", z.ZodTypeAny, {
    type: "auth_required";
    url: string;
    method: "oauth" | "token";
}, {
    type: "auth_required";
    url: string;
    method?: "oauth" | "token" | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"permission_prompt">;
    question: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "permission_prompt";
    question: string;
}, {
    type: "permission_prompt";
    question: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"ping">;
}, "strip", z.ZodTypeAny, {
    type: "ping";
}, {
    type: "ping";
}>]>;
type SseEvent = z.infer<typeof SseEventSchema>;

export { type AuthRequiredEvent, AuthRequiredSchema, type DoneEvent, DoneSchema, type ErrorEvent, ErrorEventSchema, type InterruptedEvent, InterruptedSchema, type PermissionPromptEvent, PermissionPromptSchema, type PingEvent, PingSchema, type ReasoningDeltaEvent, ReasoningDeltaSchema, type SseEvent, SseEventSchema, type TextDeltaEvent, TextDeltaSchema, type ToolUseEvent, ToolUseSchema, type UsageEvent, UsageSchema };
