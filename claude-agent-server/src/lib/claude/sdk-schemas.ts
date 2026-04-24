/**
 * sdk-schemas.ts
 *
 * Zod primitives derived from SDK types. This file is a dependency leaf —
 * it imports nothing from this project. Both config.ts and session-service.ts
 * import from here so that enum values and shared schemas have a single
 * source of truth.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Enum primitives — mirror SDK's PermissionMode and SettingSource
// ---------------------------------------------------------------------------

export const permissionModeSchema = z.enum([
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'dontAsk',
  'auto',
])
export type PermissionMode = z.infer<typeof permissionModeSchema>

export const settingSourceSchema = z.enum(['user', 'project', 'local'])
export type SettingSource = z.infer<typeof settingSourceSchema>

// ---------------------------------------------------------------------------
// Query options — what the HTTP API accepts and forwards to the SDK
// ---------------------------------------------------------------------------

export const queryOptionsSchema = z.object({
  cwd: z.string().optional(),
  model: z.string().optional(),
  permissionMode: permissionModeSchema.optional(),
  settingSources: z.array(settingSourceSchema).optional(),
  systemPrompt: z.string().optional(),
  appendSystemPrompt: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  additionalDirectories: z.array(z.string()).optional(),
  tools: z
    .union([
      z.array(z.string()),
      z.object({ type: z.literal('preset'), preset: z.literal('claude_code') }),
    ])
    .optional(),
  maxTurns: z.number().int().positive().optional(),
  /**
   * Enable file checkpointing so that Query.rewindFiles() can be called later.
   * When true, the SDK snapshots the working tree before each tool execution,
   * allowing the caller to roll back file changes to any prior user message turn.
   */
  enableFileCheckpointing: z.boolean().optional(),
})

export type QueryOptions = z.infer<typeof queryOptionsSchema>
