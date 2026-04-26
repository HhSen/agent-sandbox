## ADDED Requirements

### Requirement: Diagnostics drawer
Each sandbox SHALL have a "View Diagnostics" action that opens a side drawer with four tabs: Logs, Inspect, Events, and Summary.

#### Scenario: Diagnostics drawer opens
- **WHEN** user clicks "View Diagnostics" on a sandbox
- **THEN** a side drawer opens defaulting to the Logs tab

### Requirement: Live log streaming
The Logs tab SHALL fetch and display container logs from `GET /sandboxes/{id}/logs` with tailing enabled, rendering new lines as they arrive.

#### Scenario: Log stream loads
- **WHEN** the Logs tab is active
- **THEN** existing log lines are fetched and displayed in a monospace scrollable pane

#### Scenario: Tail new lines
- **WHEN** the sandbox produces new log output while the Logs tab is open
- **THEN** new lines are appended automatically without a manual refresh

#### Scenario: Log volume limit
- **WHEN** the in-memory log buffer exceeds 5 000 lines
- **THEN** the oldest lines are discarded and a notice is shown: "Older lines truncated"

### Requirement: Docker inspect view
The Inspect tab SHALL display the raw JSON response from `GET /sandboxes/{id}/inspect` in a syntax-highlighted, collapsible JSON tree.

#### Scenario: Inspect data loads
- **WHEN** user switches to the Inspect tab
- **THEN** `GET /sandboxes/{id}/inspect` is called and the result is rendered as a formatted JSON tree

#### Scenario: Copy inspect JSON
- **WHEN** user clicks a Copy button on the Inspect tab
- **THEN** the raw JSON string is copied to the clipboard

### Requirement: Event timeline
The Events tab SHALL display container events from `GET /sandboxes/{id}/events` as a chronological timeline.

#### Scenario: Events loaded
- **WHEN** user switches to the Events tab
- **THEN** events are fetched and displayed newest-first with timestamp, event type, and message

#### Scenario: No events
- **WHEN** `GET /sandboxes/{id}/events` returns an empty list
- **THEN** an empty-state message is shown: "No events recorded"

### Requirement: Diagnostics summary
The Summary tab SHALL display the human-readable diagnostics text from `GET /sandboxes/{id}/diagnostics/summary`.

#### Scenario: Summary loaded
- **WHEN** user switches to the Summary tab
- **THEN** the diagnostics summary text is fetched and rendered in a readable format

#### Scenario: Summary unavailable
- **WHEN** `GET /sandboxes/{id}/diagnostics/summary` returns a non-2xx response
- **THEN** an error message is shown with the status code
