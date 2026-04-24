import type { Query } from '@anthropic-ai/claude-agent-sdk'

import { HttpError } from '../http/errors.js'

export type RuntimeStatus = 'running' | 'stopping'

type ActiveRun = {
  sessionId: string
  query: Query
  status: RuntimeStatus
  startedAt: number
}

export class RuntimeRegistry {
  private readonly activeRuns = new Map<string, ActiveRun>()

  start(sessionId: string, query: Query) {
    if (this.activeRuns.has(sessionId)) {
      throw new HttpError(409, `Session ${sessionId} already has an active run`)
    }

    this.activeRuns.set(sessionId, {
      sessionId,
      query,
      status: 'running',
      startedAt: Date.now(),
    })
  }

  ensureStarted(sessionId: string, query: Query) {
    if (!this.activeRuns.has(sessionId)) {
      this.start(sessionId, query)
    }
  }

  get(sessionId: string) {
    return this.activeRuns.get(sessionId) ?? null
  }

  /**
   * Returns the raw Query handle for a session if an active run exists.
   * Callers can use the handle to invoke Query methods such as
   * rewindFiles(), supportedCommands(), getContextUsage(), etc.
   */
  getQuery(sessionId: string): Query | null {
    return this.activeRuns.get(sessionId)?.query ?? null
  }

  async interrupt(sessionId: string) {
    const activeRun = this.activeRuns.get(sessionId)
    if (!activeRun) {
      throw new HttpError(404, `No active run found for session ${sessionId}`)
    }

    activeRun.status = 'stopping'
    await activeRun.query.interrupt()
  }

  finish(sessionId: string) {
    this.activeRuns.delete(sessionId)
  }
}

export const runtimeRegistry = new RuntimeRegistry()
