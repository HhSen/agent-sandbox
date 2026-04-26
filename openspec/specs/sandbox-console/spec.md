## ADDED Requirements

### Requirement: Open console session
The console panel SHALL open when the user selects "Open Console" from a sandbox's action menu, connecting to `claude-agent-server` inside that sandbox via the opensandbox-server proxy (`/sandboxes/{id}/proxy/3000/`).

#### Scenario: Console panel opens
- **WHEN** user clicks "Open Console" on a running sandbox
- **THEN** a console panel slides in (side panel or full-screen) and shows a prompt input area

#### Scenario: Console on paused sandbox
- **WHEN** user clicks "Open Console" on a paused sandbox
- **THEN** a warning banner is shown: "Sandbox is paused — resume it before connecting"

### Requirement: Send prompt and stream response
The console SHALL send prompts to `POST /sandboxes/{id}/proxy/3000/sessions` with `{ "prompt": "<text>", "stream": true }` and render SSE events as they arrive.

#### Scenario: Successful streaming response
- **WHEN** user types a prompt and presses Enter or clicks Send
- **THEN** a user message bubble is appended immediately, the prompt input is cleared and disabled, and SSE events are rendered incrementally as assistant message content

#### Scenario: Session completed
- **WHEN** the SSE stream emits a `session.completed` event
- **THEN** the prompt input is re-enabled and a visual completion indicator is shown

#### Scenario: Session failed
- **WHEN** the SSE stream emits a `session.failed` event or the connection drops
- **THEN** an error message is appended to the transcript and the prompt input is re-enabled

### Requirement: Conversation history display
The console SHALL maintain and display the full message transcript for the current session, including user prompts, assistant responses, and tool-use events.

#### Scenario: Tool-use events visible
- **WHEN** the SSE stream includes tool-call or tool-result events
- **THEN** they are rendered as collapsible blocks within the transcript

#### Scenario: Long transcript scrolling
- **WHEN** the transcript exceeds the visible panel height
- **THEN** the panel auto-scrolls to the latest message; the user can scroll up to review history

### Requirement: Clear and export transcript
The console panel SHALL provide a Clear button to reset the current transcript and a Copy/Export button to copy the transcript as plain text or download it as Markdown.

#### Scenario: Clear transcript
- **WHEN** user clicks Clear and confirms
- **THEN** the transcript display is emptied (session state on the server is not affected)

#### Scenario: Export transcript
- **WHEN** user clicks Export
- **THEN** a Markdown file is downloaded containing all messages with timestamps

### Requirement: Session endpoint selection
The console SHALL display the current sandbox endpoint URL (from `GET /sandboxes/{id}/endpoint`) and allow the user to override the port if `claude-agent-server` runs on a non-default port.

#### Scenario: Default port
- **WHEN** user opens the console for a sandbox
- **THEN** port 3000 is pre-filled as the target port

#### Scenario: Custom port
- **WHEN** user edits the port field to a different value before sending a prompt
- **THEN** subsequent requests use the updated port in the proxy path
