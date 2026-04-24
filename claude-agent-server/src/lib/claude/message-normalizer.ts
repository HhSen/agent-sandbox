import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKStatusMessage,
  SDKSystemMessage,
  SDKTaskNotificationMessage,
  SDKTaskProgressMessage,
  SDKTaskStartedMessage,
} from '@anthropic-ai/claude-agent-sdk'

export type NormalizedEvent = {
  event: string
  data: Record<string, unknown>
}

function assistantText(message: SDKAssistantMessage) {
  return message.message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

function normalizeInit(message: SDKSystemMessage): NormalizedEvent {
  return {
    event: 'session.init',
    data: {
      sessionId: message.session_id,
      uuid: message.uuid,
      cwd: message.cwd,
      model: message.model,
      tools: message.tools,
      permissionMode: message.permissionMode,
      slashCommands: message.slash_commands,
      skills: message.skills,
      mcpServers: message.mcp_servers,
      claudeCodeVersion: message.claude_code_version,
    },
  }
}

function normalizeStatus(message: SDKStatusMessage): NormalizedEvent {
  return {
    event: 'session.status',
    data: {
      sessionId: message.session_id,
      uuid: message.uuid,
      status: message.status,
      permissionMode: message.permissionMode ?? null,
      compactResult: message.compact_result ?? null,
      compactError: message.compact_error ?? null,
    },
  }
}

function normalizeAssistant(message: SDKAssistantMessage): NormalizedEvent {
  return {
    event: 'message.assistant',
    data: {
      sessionId: message.session_id,
      uuid: message.uuid,
      text: assistantText(message),
      message: message.message,
      parentToolUseId: message.parent_tool_use_id,
      error: message.error ?? null,
    },
  }
}

function normalizePartial(message: SDKPartialAssistantMessage): NormalizedEvent {
  return {
    event: 'message.delta',
    data: {
      sessionId: message.session_id,
      uuid: message.uuid,
      event: message.event,
      parentToolUseId: message.parent_tool_use_id,
      ttftMs: message.ttft_ms ?? null,
    },
  }
}

function normalizeResult(message: SDKResultMessage): NormalizedEvent {
  return {
    event: 'result',
    data: {
      sessionId: message.session_id,
      uuid: message.uuid,
      subtype: message.subtype,
      isError: message.is_error,
      result: message.subtype === 'success' ? message.result : null,
      errors: 'errors' in message ? message.errors : null,
      stopReason: message.stop_reason,
      terminalReason: message.terminal_reason ?? null,
      durationMs: message.duration_ms,
      durationApiMs: message.duration_api_ms,
      numTurns: message.num_turns,
      totalCostUsd: message.total_cost_usd,
    },
  }
}

function normalizeTaskStarted(message: SDKTaskStartedMessage): NormalizedEvent {
  return {
    event: 'task.started',
    data: {
      sessionId: message.session_id,
      uuid: message.uuid,
      taskId: message.task_id,
      description: message.description,
      taskType: message.task_type ?? null,
      toolUseId: message.tool_use_id ?? null,
    },
  }
}

function normalizeTaskProgress(message: SDKTaskProgressMessage): NormalizedEvent {
  return {
    event: 'task.progress',
    data: {
      sessionId: message.session_id,
      uuid: message.uuid,
      taskId: message.task_id,
      description: message.description,
      toolUseId: message.tool_use_id ?? null,
      usage: message.usage,
      lastToolName: message.last_tool_name ?? null,
      summary: message.summary ?? null,
    },
  }
}

function normalizeTaskNotification(message: SDKTaskNotificationMessage): NormalizedEvent {
  return {
    event: 'task.notification',
    data: {
      sessionId: message.session_id,
      uuid: message.uuid,
      taskId: message.task_id,
      toolUseId: message.tool_use_id ?? null,
      status: message.status,
      outputFile: message.output_file,
      summary: message.summary,
      usage: message.usage ?? null,
    },
  }
}

export function normalizeMessage(message: SDKMessage): NormalizedEvent {
  if (message.type === 'assistant') {
    return normalizeAssistant(message)
  }

  if (message.type === 'result') {
    return normalizeResult(message)
  }

  if (message.type === 'stream_event') {
    return normalizePartial(message)
  }

  if (message.type === 'system' && message.subtype === 'init') {
    return normalizeInit(message)
  }

  if (message.type === 'system' && message.subtype === 'status') {
    return normalizeStatus(message)
  }

  if (message.type === 'system' && message.subtype === 'task_started') {
    return normalizeTaskStarted(message)
  }

  if (message.type === 'system' && message.subtype === 'task_progress') {
    return normalizeTaskProgress(message)
  }

  if (message.type === 'system' && message.subtype === 'task_notification') {
    return normalizeTaskNotification(message)
  }

  return {
    event: 'message.raw',
    data: {
      sessionId: message.session_id,
      uuid: message.uuid,
      message,
    },
  }
}
