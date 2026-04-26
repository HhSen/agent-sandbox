## ADDED Requirements

### Requirement: Pool list display
The pool management page SHALL display all pools returned by `GET /pools` showing: pool ID, image, current size, desired size, and status.

#### Scenario: Pools present
- **WHEN** the pool page loads and `GET /pools` returns entries
- **THEN** each pool is shown with ID, image, current/desired size, and a status indicator

#### Scenario: No pools
- **WHEN** `GET /pools` returns an empty array
- **THEN** an empty-state message is shown: "No pools configured"

### Requirement: Create pool
The pool page SHALL provide a "New Pool" form to create a pool via `POST /pools` with required fields: image name, desired size, and optional resource config.

#### Scenario: Successful pool creation
- **WHEN** user fills in image and desired size and submits
- **THEN** `POST /pools` is called and the new pool appears in the list

#### Scenario: Invalid desired size
- **WHEN** user submits with desired size less than 1
- **THEN** a validation error is shown and no API call is made

### Requirement: Update pool desired size
Each pool entry SHALL have an inline edit control to update the desired size via `PUT /pools/{id}`.

#### Scenario: Resize pool
- **WHEN** user changes the desired size value and confirms
- **THEN** `PUT /pools/{id}` is called with the new desired size and the display updates

### Requirement: Delete pool
Each pool entry SHALL have a Delete action that calls `DELETE /pools/{id}` after confirmation.

#### Scenario: Pool deleted
- **WHEN** user clicks Delete and confirms the dialog
- **THEN** `DELETE /pools/{id}` is called and the pool is removed from the list

#### Scenario: Deletion cancelled
- **WHEN** user clicks Delete and then cancels
- **THEN** no API call is made and the pool remains visible

### Requirement: Pool detail view
Clicking a pool SHALL open a detail view showing its full configuration and the list of warm sandboxes currently allocated to it.

#### Scenario: View pool detail
- **WHEN** user clicks on a pool row
- **THEN** a detail panel opens showing full config JSON and a list of sandbox IDs in the pool
