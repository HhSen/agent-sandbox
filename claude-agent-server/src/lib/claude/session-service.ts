import {
  forkSession,
  getSessionInfo,
  getSessionMessages,
  listSessions,
  query,
  renameSession,
  tagSession,
  type Options,
  type PermissionMode,
  type RewindFilesResult,
  type SDKControlGetContextUsageResponse,
  type SDKResultMessage,
  type SDKSessionInfo,
  type SessionMessage,
  type SettingSource
} from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import { config } from '../config.js'
import { HttpError } from '../http/errors.js'
import { normalizeMessage, type NormalizedEvent } from './message-normalizer.js'
import { runtimeRegistry } from './runtime-registry.js'
import { permissionModeSchema, queryOptionsSchema, type QueryOptions } from './sdk-schemas.js'
export type { QueryOptions } from './sdk-schemas.js'

export const listSessionsQuerySchema = z.object({
  dir: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  includeWorktrees: z.coerce.boolean().optional(),
})

export const getMessagesQuerySchema = z.object({
  dir: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  includeSystemMessages: z.coerce.boolean().optional(),
})

export const patchSessionBodySchema = z
  .object({
    dir: z.string().optional(),
    title: z.string().trim().min(1).optional(),
    tag: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => value.title !== undefined || value.tag !== undefined, {
    message: 'At least one of title or tag must be provided',
  })

export const forkSessionBodySchema = z.object({
  dir: z.string().optional(),
  title: z.string().trim().min(1).optional(),
  upToMessageId: z.string().trim().min(1).optional(),
})

export const patchModelBodySchema = z.object({
  model: z.string().optional(),
})

export const patchPermissionModeBodySchema = z.object({
  permissionMode: permissionModeSchema,
})

const promptBodyBaseSchema = z.object({
  prompt: z.string().min(1),
  stream: z.boolean().optional(),
  includePartialMessages: z.boolean().optional(),
  options: queryOptionsSchema.optional(),
})

export const createSessionBodySchema = promptBodyBaseSchema

export const sendMessageBodySchema = promptBodyBaseSchema.extend({
  forkSession: z.boolean().optional(),
})

export type ExecutePromptInput = {
  sessionId?: string
  prompt: string
  includePartialMessages?: boolean
  forkSession?: boolean
  options?: QueryOptions
  /** When the signal is aborted, the active query will be interrupted. */
  signal?: AbortSignal
}

export type ExecutePromptResult = {
  sessionId: string
  result: SDKResultMessage | null
  events: NormalizedEvent[]
}

function definedEntries<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  )
}

function buildOptions(input: ExecutePromptInput): Options {
  const permissionMode = input.options?.permissionMode ?? config.defaultPermissionMode
  const settingSources = input.options?.settingSources ?? config.defaultSettingSources

  if (permissionMode === 'bypassPermissions') {
    throw new HttpError(400, 'permissionMode=bypassPermissions is not enabled in this server')
  }

  const systemPrompt = input.options?.systemPrompt
    ? input.options.systemPrompt
    : definedEntries({
      type: 'preset' as const,
      preset: 'claude_code' as const,
      append: input.options?.appendSystemPrompt,
    })

  return definedEntries({
    cwd: input.options?.cwd,
    model: input.options?.model ?? config.defaultModel,
    permissionMode: permissionMode as PermissionMode,
    settingSources: settingSources as SettingSource[],
    systemPrompt,
    allowedTools: input.options?.allowedTools,
    disallowedTools: input.options?.disallowedTools,
    additionalDirectories: input.options?.additionalDirectories,
    tools: input.options?.tools ?? { type: 'preset' as const, preset: 'claude_code' as const },
    includePartialMessages: input.includePartialMessages ?? false,
    maxTurns: input.options?.maxTurns,
    enableFileCheckpointing: input.options?.enableFileCheckpointing,
    persistSession: true,
    resume: input.sessionId,
    forkSession: input.sessionId ? input.forkSession : undefined,
  }) as Options
}

export async function listStoredSessions(input: z.infer<typeof listSessionsQuerySchema>) {
  return listSessions(definedEntries(input) as Parameters<typeof listSessions>[0])
}

export async function getStoredSession(sessionId: string, dir?: string) {
  const info = await getSessionInfo(
    sessionId,
    definedEntries({ dir }) as Parameters<typeof getSessionInfo>[1],
  )
  if (!info) {
    throw new HttpError(404, `Session ${sessionId} not found`)
  }

  return {
    ...info,
    runtime: runtimeRegistry.get(sessionId),
  }
}

export async function getStoredMessages(sessionId: string, input: z.infer<typeof getMessagesQuerySchema>) {
  return getSessionMessages(sessionId, definedEntries(input) as Parameters<typeof getSessionMessages>[1])
}

export async function updateStoredSession(sessionId: string, input: z.infer<typeof patchSessionBodySchema>) {
  if (input.title !== undefined) {
    await renameSession(
      sessionId,
      input.title,
      definedEntries({ dir: input.dir }) as Parameters<typeof renameSession>[2],
    )
  }

  if (input.tag !== undefined) {
    await tagSession(
      sessionId,
      input.tag,
      definedEntries({ dir: input.dir }) as Parameters<typeof tagSession>[2],
    )
  }

  return getStoredSession(sessionId, input.dir)
}

export async function forkStoredSession(sessionId: string, input: z.infer<typeof forkSessionBodySchema>) {
  const forked = await forkSession(
    sessionId,
    definedEntries({
      dir: input.dir,
      title: input.title,
      upToMessageId: input.upToMessageId,
    }) as Parameters<typeof forkSession>[1],
  )

  return getStoredSession(forked.sessionId, input.dir)
}

export async function abortSession(sessionId: string) {
  const activeRun = runtimeRegistry.get(sessionId)

  if (!activeRun) {
    // Distinguish: session exists in the SDK but is idle vs. completely unknown
    const info = await getSessionInfo(sessionId).catch(() => null)
    if (!info) {
      throw new HttpError(404, `Session ${sessionId} not found`)
    }
    throw new HttpError(409, `Session ${sessionId} has no active run to abort`)
  }

  await runtimeRegistry.interrupt(sessionId)
  return { ok: true, sessionId, previousStatus: activeRun.status }
}

function ensureResult(result: SDKResultMessage | null, sessionId: string) {
  if (!result) {
    throw new HttpError(502, `Query for session ${sessionId} completed without a result message`)
  }
}

export async function execute(
  input: ExecutePromptInput,
  onEvent?: (event: NormalizedEvent) => void,
): Promise<ExecutePromptResult> {
  // Reject early if the session already has an active run and we are not forking
  if (input.sessionId && !input.forkSession && runtimeRegistry.get(input.sessionId)) {
    throw new HttpError(409, `Session ${input.sessionId} already has an active run`)
  }

  const queryHandle = query({
    prompt: input.prompt,
    options: buildOptions(input),
  })

  let discoveredSessionId = input.sessionId ?? null
  let registeredActiveRun = false
  let finalResult: SDKResultMessage | null = null
  const events: NormalizedEvent[] = []

  if (input.sessionId) {
    runtimeRegistry.start(input.sessionId, queryHandle)
    registeredActiveRun = true
  }

  function onSignalAbort() {
    void queryHandle.interrupt()
  }

  input.signal?.addEventListener('abort', onSignalAbort, { once: true })

  try {
    for await (const message of queryHandle) {
      const messageSessionId = typeof message.session_id === 'string' ? message.session_id : undefined

      if (!discoveredSessionId) {
        discoveredSessionId = messageSessionId ?? null
      }

      if (discoveredSessionId && !registeredActiveRun) {
        runtimeRegistry.ensureStarted(discoveredSessionId, queryHandle)
        registeredActiveRun = true
      }

      const event = normalizeMessage(message)
      events.push(event)
      onEvent?.(event)

      if (message.type === 'result') {
        finalResult = message
      }
    }
  } finally {
    input.signal?.removeEventListener('abort', onSignalAbort)

    if (discoveredSessionId) {
      runtimeRegistry.finish(discoveredSessionId)
    }

    queryHandle.close()
  }

  if (!discoveredSessionId) {
    throw new HttpError(502, 'Claude SDK did not emit a session ID')
  }

  ensureResult(finalResult, discoveredSessionId)

  return {
    sessionId: discoveredSessionId,
    result: finalResult,
    events,
  }
}

// ---------------------------------------------------------------------------
// Active-query introspection helpers
// These functions require a live Query handle and will return 409 if the
// session has no active run.
// ---------------------------------------------------------------------------

/**
 * Returns the Query handle for a session, throwing 404/409 as appropriate.
 * - 404: session is completely unknown to the SDK store
 * - 409: session exists but has no active run, or the active run is stopping
 *
 * Rejects sessions in the `stopping` state so that destructive operations
 * (e.g. rewindFiles) cannot race against SDK teardown and leave the working
 * tree in an inconsistent state.
 */
async function requireActiveQuery(sessionId: string) {
  const run = runtimeRegistry.get(sessionId)

  if (run) {
    if (run.status === 'stopping') {
      throw new HttpError(409, `Session ${sessionId} is stopping; wait for it to finish before issuing new operations`)
    }
    return run.query
  }

  // Distinguish unknown session (404) from idle session (409)
  const info = await getSessionInfo(sessionId).catch(() => null)
  if (!info) {
    throw new HttpError(404, `Session ${sessionId} not found`)
  }
  throw new HttpError(409, `Session ${sessionId} has no active run. Start a prompt first.`)
}

export const rewindSessionBodySchema = z.object({
  userMessageId: z.string().min(1),
  dryRun: z.boolean().optional(),
})

/**
 * Roll back file changes to the state at a prior user message turn.
 * Requires that the session was started with options.enableFileCheckpointing=true.
 */
export async function rewindSessionFiles(
  sessionId: string,
  input: z.infer<typeof rewindSessionBodySchema>,
): Promise<RewindFilesResult> {
  const q = await requireActiveQuery(sessionId)
  return q.rewindFiles(input.userMessageId, definedEntries({ dryRun: input.dryRun }) as { dryRun?: boolean })
}

/**
 * Returns the slash commands supported by the active Claude Code session.
 */
export async function getSessionCommands(sessionId: string) {
  const q = await requireActiveQuery(sessionId)
  const commands = await q.supportedCommands()
  return { commands }
}

/**
 * Returns the models available in the active session.
 */
export async function getSessionModels(sessionId: string) {
  const q = await requireActiveQuery(sessionId)
  const models = await q.supportedModels()
  return { models }
}

/**
 * Returns the agents available in the active session.
 */
export async function getSessionAgents(sessionId: string) {
  const q = await requireActiveQuery(sessionId)
  const agents = await q.supportedAgents()
  return { agents }
}

/**
 * Returns the context (token) usage breakdown for the active session.
 */
export async function getSessionContext(sessionId: string): Promise<SDKControlGetContextUsageResponse> {
  const q = await requireActiveQuery(sessionId)
  return q.getContextUsage()
}

/**
 * Hot-swaps the model on the active session.
 * Only available when the session was started with a streaming input prompt (AsyncIterable).
 * SDK will throw if called on a non-streaming query; this surfaces as a 502.
 */
export async function setSessionModel(sessionId: string, model?: string) {
  const q = await requireActiveQuery(sessionId)
  await q.setModel(model)
  return { ok: true, sessionId, model }
}

/**
 * Changes the permission mode on the active session.
 * bypassPermissions is rejected with 400 (consistent with execute()).
 * Only available when the session was started with a streaming input prompt (AsyncIterable).
 */
export async function setSessionPermissionMode(sessionId: string, mode: PermissionMode) {
  if (mode === 'bypassPermissions') {
    throw new HttpError(400, 'permissionMode=bypassPermissions is not enabled in this server')
  }
  const q = await requireActiveQuery(sessionId)
  await q.setPermissionMode(mode)
  return { ok: true, sessionId, permissionMode: mode }
}

export function sdkSessionInfoToResponse(info: SDKSessionInfo) {
  return {
    sessionId: info.sessionId,
    summary: info.summary,
    lastModified: info.lastModified,
    fileSize: info.fileSize ?? null,
    customTitle: info.customTitle ?? null,
    firstPrompt: info.firstPrompt ?? null,
    gitBranch: info.gitBranch ?? null,
    cwd: info.cwd ?? null,
    tag: info.tag ?? null,
    createdAt: info.createdAt ?? null,
  }
}

export function sessionMessageToResponse(message: SessionMessage) {
  return {
    type: message.type,
    uuid: message.uuid,
    sessionId: message.session_id,
    message: message.message,
    parentToolUseId: message.parent_tool_use_id,
  }
}
