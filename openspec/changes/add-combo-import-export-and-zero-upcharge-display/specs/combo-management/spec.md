## ADDED Requirements

### Requirement: Combo Export to XLSX
The system SHALL allow exporting combos from dashboard to XLSX format.

#### Scenario: Export combos with structure and availability
- **WHEN** an operator triggers export in `/combos`
- **THEN** the system returns an XLSX file encoded as base64
- **AND** each row includes combo, slot, option, and availability (`deshabilitar_en`) data

### Requirement: Combo Import with Preview and Conflict Resolution
The system SHALL allow importing combos via CSV/XLSX with preview and conflict handling.

#### Scenario: Preview imported combos before applying
- **WHEN** an operator uploads a valid CSV/XLSX file
- **THEN** the system returns a preview with parsed rows, warnings, conflicts, and summary counts

#### Scenario: Skip existing combos
- **WHEN** conflict resolution is `skip`
- **THEN** existing combos are preserved
- **AND** only new combos are imported

#### Scenario: Overwrite existing combos
- **WHEN** conflict resolution is `overwrite`
- **THEN** matching combos are updated
- **AND** their slot/option tree is replaced by imported data

#### Scenario: Substitute catalog with soft-delete
- **WHEN** conflict resolution is `substitute`
- **THEN** combos not present in the imported file are marked `isDeleted=true`
- **AND** combos present in the file are created or updated

### Requirement: Hybrid Product Mapping for Combo Options
The import process SHALL resolve combo slot options with hybrid matching.

#### Scenario: Option resolved by menu_product_id first
- **WHEN** `menu_product_id` is present and valid
- **THEN** the importer uses that product ID

#### Scenario: Option falls back to name/category/size
- **WHEN** `menu_product_id` is missing or invalid
- **THEN** the importer resolves product by normalized `menu_producto`, `menu_categoria`, and `menu_tamaño`
