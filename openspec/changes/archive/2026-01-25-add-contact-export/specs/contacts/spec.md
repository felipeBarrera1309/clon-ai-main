## ADDED Requirements

### Requirement: Contact Export Functionality

The system SHALL allow restaurant admins to export their contact list for external use.

#### Scenario: Export all contacts as CSV

- **WHEN** admin clicks "Exportar" button on contacts page
- **THEN** system SHALL fetch all contacts for the organization
- **AND** system SHALL generate CSV file with columns: Nombre, Teléfono, Dirección, Estado, Fecha Registro, Última Actividad, Pedidos, Conversaciones
- **AND** CSV SHALL include UTF-8 BOM for Excel compatibility
- **AND** dates SHALL be formatted as DD/MM/YYYY (Colombian format)
- **AND** file SHALL download automatically with filename `contactos_YYYY-MM-DD.csv`
- **AND** success toast "Contactos exportados exitosamente" SHALL be shown

#### Scenario: Empty export handling

- **WHEN** admin clicks "Exportar" button
- **AND** organization has no contacts
- **THEN** system SHALL show info toast "No hay contactos para exportar"
- **AND** no file SHALL be downloaded

#### Scenario: Export error handling

- **WHEN** admin clicks "Exportar" button
- **AND** an error occurs during export
- **THEN** system SHALL show error toast "Error al exportar contactos"
- **AND** error SHALL be logged to console

### Requirement: Export Button UI Placement

The export button SHALL be positioned for easy access in the contacts interface.

#### Scenario: Export button visibility

- **WHEN** admin views contacts page
- **THEN** "Exportar" button SHALL be visible in page header
- **AND** button SHALL be positioned before "Importar" button
- **AND** button SHALL use DownloadIcon from lucide-react
- **AND** button SHALL show loading state with "Exportando..." text during export
- **AND** button SHALL be disabled during export operation

### Requirement: Contact Export Data Fields

The exported CSV SHALL include all relevant contact information.

#### Scenario: CSV column mapping

- **GIVEN** a contact with all fields populated
- **WHEN** exported to CSV
- **THEN** columns SHALL be mapped as follows:
  - `displayName` → "Nombre"
  - `phoneNumber` → "Teléfono"
  - `lastKnownAddress` → "Dirección"
  - `isBlocked` → "Estado" (values: "Activo" or "Bloqueado")
  - `_creationTime` → "Fecha Registro"
  - `lastMessageAt` → "Última Actividad"
  - `orderCount` → "Pedidos"
  - `conversationCount` → "Conversaciones"

#### Scenario: CSV special character handling

- **GIVEN** a contact with special characters in fields (commas, quotes, newlines)
- **WHEN** exported to CSV
- **THEN** fields containing special characters SHALL be wrapped in double quotes
- **AND** internal double quotes SHALL be escaped by doubling them
