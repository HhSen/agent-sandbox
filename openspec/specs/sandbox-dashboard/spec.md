## ADDED Requirements

### Requirement: Sandbox list display
The dashboard SHALL display all sandboxes returned by `GET /sandboxes` in a table or card grid, showing: sandbox ID (truncated), status, image, creation time, expiry time, and CPU/memory config.

#### Scenario: Sandboxes are present
- **WHEN** the dashboard loads and `GET /sandboxes` returns one or more entries
- **THEN** each sandbox is rendered as a row/card with ID, status badge, image name, created-at, and expires-at

#### Scenario: No sandboxes running
- **WHEN** `GET /sandboxes` returns an empty array
- **THEN** the dashboard shows an empty-state message: "No sandboxes running"

#### Scenario: API unreachable
- **WHEN** `GET /sandboxes` fails with a network error or non-2xx status
- **THEN** the dashboard shows an error banner with the error message and a Retry button

### Requirement: Auto-refresh
The dashboard SHALL poll `GET /sandboxes` every 10 seconds to keep status current without a full page reload.

#### Scenario: Status changes between polls
- **WHEN** a sandbox changes state between two polling intervals
- **THEN** the updated status badge is reflected in the list within 10 seconds

#### Scenario: User-initiated refresh
- **WHEN** the user clicks a Refresh button
- **THEN** `GET /sandboxes` is called immediately and the list updates

### Requirement: Quick actions per sandbox
Each sandbox entry SHALL expose a contextual action menu with: Pause, Resume, Renew, Delete, Open Console, and View Diagnostics.

#### Scenario: Pause a running sandbox
- **WHEN** user selects "Pause" from a running sandbox's action menu
- **THEN** `POST /sandboxes/{id}/pause` is called and the status badge updates to "paused"

#### Scenario: Resume a paused sandbox
- **WHEN** user selects "Resume" from a paused sandbox's action menu
- **THEN** `POST /sandboxes/{id}/resume` is called and the status badge updates

#### Scenario: Delete a sandbox
- **WHEN** user selects "Delete" and confirms the confirmation dialog
- **THEN** `DELETE /sandboxes/{id}` is called and the sandbox is removed from the list

#### Scenario: Delete cancelled
- **WHEN** user selects "Delete" then cancels the confirmation dialog
- **THEN** no API call is made and the sandbox remains in the list

### Requirement: Create sandbox form
The dashboard SHALL provide a "New Sandbox" button that opens a form for creating a sandbox via `POST /sandboxes`.

#### Scenario: Successful creation
- **WHEN** user fills in required fields (image, optional CPU/memory) and submits
- **THEN** `POST /sandboxes` is called and the new sandbox appears in the list

#### Scenario: Validation error
- **WHEN** user submits the form with the image field empty
- **THEN** a field-level validation error is shown and no API call is made

### Requirement: Server connection settings
The console SHALL allow the user to configure the target `opensandbox-server` URL and optional Bearer token via a Settings panel. These values SHALL be persisted to `localStorage`.

#### Scenario: First-time setup
- **WHEN** no server URL is stored in localStorage
- **THEN** the settings panel opens automatically and prompts the user to enter a server URL

#### Scenario: Settings saved
- **WHEN** user enters a valid URL and clicks Save
- **THEN** the URL and token are stored in localStorage and subsequent API calls use them
