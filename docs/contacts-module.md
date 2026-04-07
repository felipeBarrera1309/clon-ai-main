# Contacts Module

The contacts module manages customer records across the platform. Contacts are created automatically when a customer initiates a WhatsApp conversation, and can also be imported in bulk or created programmatically. Each contact is scoped to an organization and linked to conversations and orders.

---

## Table of Contents

1. [Database Schema](#database-schema)
2. [Backend API](#backend-api)
   - [Public Functions](#public-functions)
   - [Private Functions](#private-functions)
   - [System (Internal) Functions](#system-internal-functions)
   - [Model Helper](#model-helper)
3. [Aggregate](#aggregate)
4. [Frontend Components](#frontend-components)
   - [ContactsView](#contactsview)
   - [EditContactDialog](#contacteditdialog)
   - [ContactsImportDialog](#contactsimportdialog)
   - [ContactSelectorDialog](#contactselectordialog)
5. [Utilities](#utilities)
   - [export-contacts.ts](#export-contactsts)
6. [CSV Import Format](#csv-import-format)
7. [Phone Number Normalization](#phone-number-normalization)
8. [Data Flow](#data-flow)

---

## Database Schema

**File:** `packages/backend/convex/schema.ts`

```typescript
contacts: defineTable({
  phoneNumber: v.string(),          // Normalized E.164-style number (e.g. "573001234567")
  displayName: v.optional(v.string()),
  organizationId: v.string(),       // Multi-tenancy scope
  lastMessageAt: v.optional(v.number()),      // Unix ms — updated on each incoming message
  isBlocked: v.optional(v.boolean()),         // Prevents new conversations when true
  lastKnownAddress: v.optional(v.string()),   // Last delivery address used by the customer
})
  .index("by_organization_id", ["organizationId"])
  .index("by_phone_number", ["phoneNumber"])
  .index("by_organization_and_phone", ["organizationId", "phoneNumber"])
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `phoneNumber` | `string` | Yes | Normalized phone number (no `+`, digits only) |
| `displayName` | `string` | No | Customer name, auto-updated when a better name is available |
| `organizationId` | `string` | Yes | Owning organization |
| `lastMessageAt` | `number` | No | Timestamp of the last received message |
| `isBlocked` | `boolean` | No | If `true`, new conversations are rejected |
| `lastKnownAddress` | `string` | No | Last delivery address from an order |

---

## Backend API

### Public Functions

**File:** `packages/backend/convex/public/contacts.ts`

These functions are callable from the widget and external webhooks without authentication.

#### `getOrCreate` — `mutation`

Resolves or creates a contact based on the WhatsApp business phone number and the customer phone number. Called by the widget when a new message arrives.

```typescript
args: {
  contactPhoneNumber: string,   // Customer's phone number
  displayName: string,          // Name from WhatsApp profile
  businessPhoneNumber: string,  // Used to look up the organization via whatsappConfigurations
}

returns: {
  contactId: Id<"contacts">,
  organizationId: string,
}
```

- Looks up the organization from `whatsappConfigurations` using `businessPhoneNumber`.
- Throws `ConvexError` if no matching WhatsApp configuration is found.
- Creates the contact with `lastMessageAt: Date.now()` on first creation.
- Does **not** update `displayName` if the contact already exists.

---

### Private Functions

**File:** `packages/backend/convex/private/contacts.ts`

Authenticated functions used by the web dashboard. All require the user to belong to the active organization.

#### `get` — `internalQuery`

Fetches a single contact by ID. Returns `null` if not found.

```typescript
args: { contactId: Id<"contacts"> }
returns: Doc<"contacts"> | null
```

#### `validate` — `authMutation`

Checks whether a contact exists. Returns a typed result instead of throwing.

```typescript
args: {
  organizationId: string,
  contactId: Id<"contacts">,
}
returns:
  | { valid: false; reason: string }
  | { valid: true; contact: Doc<"contacts"> }
```

#### `getByOrganization` — `authQuery`

Paginated list of contacts for a given organization. Enriches each contact with computed relationship counts.

```typescript
args: {
  organizationId: string,
  paginationOpts: { numItems: number; cursor: string | null },
  searchQuery?: string,         // Filters by displayName or phoneNumber (in-memory)
}

returns: {
  page: Array<Doc<"contacts"> & {
    conversationCount: number,
    lastConversation: { _id: string; status: "unresolved"|"escalated"|"resolved" } | null,
    orderCount: number,
  }>,
  isDone: boolean,
  continueCursor: string | null,
}
```

- When `searchQuery` is present, all contacts are loaded and filtered in memory, then manually paginated using string cursors (offset-based).
- Without a search query, native Convex `.paginate()` is used for efficient cursor-based pagination.

#### `update` — `authMutation`

Updates editable fields of a contact. Verifies organization ownership before patching.

```typescript
args: {
  organizationId: string,
  contactId: Id<"contacts">,
  displayName?: string,
  isBlocked?: boolean,
  lastKnownAddress?: string,
}
returns: { success: true }
```

Throws if the contact does not exist or belongs to a different organization.

#### `listForPromptBuilder` — `authQuery`

Returns the 50 most recent contacts, with only the fields needed to build AI system prompts.

```typescript
args: { organizationId: string }
returns: Array<{
  _id: Id<"contacts">,
  displayName?: string,
  phoneNumber: string,
  lastMessageAt?: number,
}>
```

#### `listForCampaignSelection` — `authQuery`

Paginated contact list for campaign recipient selection. Supports search and optional exclusion of blocked contacts.

```typescript
args: {
  organizationId: string,
  searchQuery?: string,
  limit?: number,           // Default: 50
  cursor?: string,          // Offset-based string cursor
  excludeBlocked?: boolean, // Default: true
}
returns: {
  contacts: Array<{
    _id, displayName, phoneNumber, lastMessageAt,
    lastKnownAddress, isBlocked, orderCount, _creationTime
  }>,
  totalCount: number,
  hasMore: boolean,
  nextCursor: string | null,
}
```

#### `getByIds` — `authQuery`

Batch-fetches contacts by a list of IDs. Filters out any IDs that don't belong to the given organization.

```typescript
args: {
  organizationId: string,
  contactIds: Id<"contacts">[],
}
returns: Array<{
  _id, displayName, phoneNumber, isBlocked
}>
```

#### `previewContactsImport` — `authMutation`

Parses and validates CSV content without writing to the database. Returns a preview with statistics and per-row validation results.

```typescript
args: {
  organizationId: string,
  csvContent: string,
}
returns: {
  success: boolean,
  error: string | null,
  preview: {
    totalRows: number,
    validRows: number,
    invalidRows: number,
    newContacts: number,      // Valid rows whose phone isn't yet in the DB
    duplicateContacts: number,
    rows: ParsedContactRow[], // Limited to first 100
    errors: { row: number; errors: string[] }[],
  } | null,
}
```

#### `importContacts` — `authMutation`

Executes the CSV import. Skips or updates existing contacts depending on `conflictResolution`.

```typescript
args: {
  organizationId: string,
  csvContent: string,
  conflictResolution: "skip" | "update",
}
returns: {
  success: boolean,
  error: string | null,
  imported: number,
  skipped: number,
  updated: number,
  errors: { row: number; error: string }[],
}
```

- `"skip"`: Existing contacts (matched by normalized phone number) are counted as `skipped`.
- `"update"`: Patches `displayName` and `lastKnownAddress` on existing contacts if those fields are present in the CSV.
- Intra-file duplicates (same phone appearing twice) are automatically skipped after the first occurrence.
- Updates the `aggregateContactsByOrganization` aggregate for every newly created contact.

#### `importContactsBatch` — `authMutation`

Imports contacts from a JSON array instead of CSV. Used for campaign contact provisioning.

```typescript
args: {
  organizationId: string,
  contacts: Array<{ phoneNumber: string; displayName?: string }>,
}
returns: string[]  // Array of contact IDs (existing or newly created)
```

#### `getAllForExport` — `authQuery`

Returns all contacts for a given organization enriched with `orderCount` and `conversationCount`, for use by the CSV export utility.

```typescript
args: { organizationId: string }
returns: Array<{
  _id, displayName, phoneNumber, lastKnownAddress,
  isBlocked, lastMessageAt, _creationTime,
  orderCount, conversationCount,
}>
```

---

### System (Internal) Functions

**File:** `packages/backend/convex/system/contacts.ts`

Called only by other Convex functions (AI agents, conversation handlers, webhook processors). Not accessible from the client.

#### `getOne` — `internalQuery`

```typescript
args: { contactId: Id<"contacts"> }
returns: Doc<"contacts"> | null
```

#### `getOneByPhoneNumber` — `internalQuery`

```typescript
args: { phoneNumber: string; organizationId: string }
returns: Doc<"contacts"> | null
```

#### `getOrCreate` — `internalMutation`

Gets an existing contact or creates a new one. Unlike the public `getOrCreate`, this does not update `displayName` on existing contacts.

```typescript
args: { phoneNumber: string; displayName: string; organizationId: string }
returns: Doc<"contacts"> | null
```

#### `createOne` — `internalMutation`

Unconditionally inserts a new contact. Registers it in the aggregate.

```typescript
args: { phoneNumber: string; displayName: string; organizationId: string }
returns: Id<"contacts">
```

#### `updateLastKnownAddress` — `internalMutation`

Patches only the `lastKnownAddress` field. Called by the `makeOrder` AI tool after order creation.

```typescript
args: { contactId: Id<"contacts">; address: string }
```

#### `updateDisplayName` — `internalMutation`

Patches only the `displayName` field. Called by the `saveCustomerName` AI tool.

```typescript
args: { contactId: Id<"contacts">; displayName: string }
```

---

### Model Helper

**File:** `packages/backend/convex/model/contacts.ts`

#### `getOrCreateContact`

Shared model-layer helper used inside mutations that need a contact but should also improve the stored name if a better one is available.

```typescript
getOrCreateContact(ctx: MutationCtx, args: {
  phoneNumber: string,
  displayName?: string,
  organizationId: string,
}): Promise<Doc<"contacts">>
```

**Display name upgrade logic:** If the contact already exists but its `displayName` is empty or equal to the phone number, and the caller provides a real name (not the phone number itself), the name is patched automatically. This prevents contacts from being permanently stuck with the phone number as their display name.

Throws `CreationFailedError` if the insert succeeds but the subsequent `get` returns `null`.

---

## Aggregate

**File:** `packages/backend/convex/contactsAggregate.ts`

```typescript
export const aggregateContactsByOrganization = new TableAggregate<{
  Namespace: string   // organizationId
  Key: number         // _creationTime
  DataModel: DataModel
  TableName: "contacts"
}>(...)
```

A `@convex-dev/aggregate` instance that maintains a per-organization count and sorted view of contacts, keyed by creation time. Used in the main dashboard to display total contact counts without scanning the full table.

**Every mutation that inserts a contact must call:**
```typescript
await aggregateContactsByOrganization.insertIfDoesNotExist(ctx, createdContact)
```

---

## Frontend Components

### ContactsView

**File:** `apps/web/modules/dashboard/ui/views/contacts-view.tsx`

The main contacts page rendered in the dashboard. Supports both table and card layouts, with automatic switching to card view on mobile.

**Features:**
- Debounced search (300ms) by name or phone number
- Cursor-based pagination with configurable page sizes (10 / 20 / 50)
- Export all contacts to a dated CSV file
- Import contacts via the `ContactsImportDialog`
- Edit contact via `EditContactDialog`
- Block / unblock with a confirmation dialog

**Key state:**
| State | Purpose |
|---|---|
| `cursor` / `prevCursors` | Forward/back cursor stack for pagination |
| `searchValue` / `searchQuery` | Raw input vs. debounced value |
| `viewMode` | `"table"` or `"cards"` |
| `selectedContact` | Contact open in the edit dialog |
| `contactToBlock` | Contact pending block/unblock confirmation |
| `isExporting` | Prevents double-click export |

**Table columns:** Contact name · Phone number · Registration date · Status (Active/Blocked) · Conversations (count + last status badge) · Orders · Last address · Last activity · Actions menu.

**Convex queries/mutations used:**
- `api.private.contacts.getByOrganization` — paginated list
- `api.private.contacts.getAllForExport` — imperative query for export
- `api.private.contacts.update` — block/unblock toggle

---

### EditContactDialog

**File:** `apps/web/modules/dashboard/ui/components/edit-contact-dialog.tsx`

Modal form for editing a contact's `displayName`, `lastKnownAddress`, and `isBlocked` status.

**Form schema (Zod):**
```typescript
{
  displayName: z.string().optional(),
  isBlocked: z.boolean(),
  lastKnownAddress: z.string().optional(),
}
```

**Props:**
```typescript
{
  open: boolean,
  onOpenChange: (open: boolean) => void,
  contact: Doc<"contacts"> | null,
  onSuccess?: () => void,
}
```

- Resets the form to the current contact values whenever `contact` changes.
- Submits via `api.private.contacts.update`.
- Shows success/error toasts using `sonner`.

---

### ContactsImportDialog

**File:** `apps/web/modules/dashboard/ui/components/contacts-import-dialog.tsx`

Four-step wizard for bulk importing contacts from a CSV file.

**Steps:**

| Step | Label | Description |
|---|---|---|
| `upload` | Subir archivo | File selection and basic client-side validation |
| `preview` | Validar datos | Preview table, statistics, conflict resolution selector |
| `import` | Importando... | Loading spinner while mutation runs |
| `complete` | Completado | Results summary with imported / updated / skipped counts |

**File validation (client-side):**
- Extension must be `.csv`
- Max size: 5 MB
- File must not be empty
- First line must contain `telefono`, `teléfono`, or `phone_number`

**Conflict resolution options:**
- `skip` — leave existing contacts unchanged (default)
- `update` — patch `displayName` and `lastKnownAddress` on existing contacts

**Props:**
```typescript
{
  isOpen: boolean,
  onClose: () => void,
  onImportComplete?: () => void,  // Called after a successful import when closing
}
```

**Convex mutations used:**
- `api.private.contacts.previewContactsImport`
- `api.private.contacts.importContacts`

---

### ContactSelectorDialog

**File:** `apps/web/modules/dashboard/ui/components/contact-selector-dialog.tsx`

Multi-select picker used by the campaigns feature to choose message recipients.

**Features:**
- Debounced search (300ms) by name or phone
- Infinite scroll via "Cargar más" button
- Select all loaded contacts / deselect all
- Shows order count badge per contact
- Blocked contacts are excluded by default (`excludeBlocked: true`)
- Local selection state is committed only on "Confirmar"

**Props:**
```typescript
{
  open: boolean,
  onOpenChange: (open: boolean) => void,
  selectedContactIds: Id<"contacts">[],
  onSelectionChange: (contactIds: Id<"contacts">[]) => void,
  title?: string,        // Default: "Seleccionar Contactos"
  description?: string,  // Default: "Selecciona los contactos que recibirán el mensaje"
}
```

**Convex query used:**
- `api.private.contacts.listForCampaignSelection`

**Performance note:** Each search reset clears the accumulated `allLoadedContacts` list and resets the cursor to `null`, triggering a fresh query.

---

## Utilities

### export-contacts.ts

**File:** `apps/web/lib/export-contacts.ts`

#### `ContactForExport` type

```typescript
type ContactForExport = {
  _id: string
  displayName?: string
  phoneNumber: string
  lastKnownAddress?: string
  isBlocked?: boolean
  lastMessageAt?: number
  _creationTime: number
  orderCount: number
  conversationCount: number
}
```

#### `generateContactsCSV(contacts: ContactForExport[]): string`

Converts an array of contacts to a UTF-8 CSV string with a BOM prefix for Excel compatibility. Headers are in Spanish.

**CSV columns:** `Nombre, Teléfono, Dirección, Estado, Fecha Registro, Última Actividad, Pedidos, Conversaciones`

- Fields containing commas, quotes, or newlines are wrapped in double-quotes with internal quotes escaped as `""`.
- Dates are formatted as `dd/MM/yyyy` (Colombian locale).

#### `downloadContactsCSV(content: string, filename: string): void`

Triggers a browser download using a temporary `<a>` element and an object URL. The URL is revoked immediately after the click.

---

## CSV Import Format

### Required columns

| Column name (case-insensitive) | Accepted aliases |
|---|---|
| `telefono` | `teléfono`, `phone_number` |

### Optional columns

| Column name | Accepted aliases | Field |
|---|---|---|
| `nombre` | `name`, `display_name` | `displayName` |
| `direccion` | `dirección`, `address`, `last_known_address` | `lastKnownAddress` |

### Example

```csv
telefono,nombre,direccion
"573001234567","Juan Pérez","Calle 100 #15-20, Bogotá"
"573109876543","María García",""
3001112233,,
```

### Validation rules

- Phone number must be present and non-empty.
- After normalization, must match `/^\d{10,15}$/`.
- Duplicate phone numbers within the same file cause all occurrences after the first to be marked as errors in the preview (only the first is imported).

---

## Phone Number Normalization

Applied to all phone numbers before storage and during lookups.

```
1. Remove all characters except digits and '+'
2. Strip leading '+'
3. If the result is 10 digits and starts with '3' → prepend "57" (Colombian mobile)
```

**Examples:**
| Input | Normalized |
|---|---|
| `+57 300 123 4567` | `573001234567` |
| `3001234567` | `573001234567` |
| `573001234567` | `573001234567` |
| `+1-800-555-0100` | `18005550100` |

---

## Data Flow

### Automatic contact creation (WhatsApp)

```
Incoming WhatsApp message
  → HTTP webhook handler
  → public.contacts.getOrCreate
      ├─ Lookup org via whatsappConfigurations.by_phone_number
      └─ Insert contact if new + update aggregate
  → Conversation handler uses contactId
```

### Dashboard contact management

```
ContactsView
  ├─ private.contacts.getByOrganization  (paginated list + search)
  ├─ private.contacts.update             (block/unblock, edit fields)
  ├─ private.contacts.getAllForExport    (export to CSV)
  └─ private.contacts.importContacts    (CSV bulk import)
        └─ aggregateContactsByOrganization.insertIfDoesNotExist (per new contact)
```

### AI agent interactions

```
AI tool: saveCustomerName
  → system.contacts.updateDisplayName

AI tool: makeOrder (delivery address confirmed)
  → system.contacts.updateLastKnownAddress

Conversation initialization
  → system.contacts.getOrCreate  (or model.contacts.getOrCreateContact)
```
