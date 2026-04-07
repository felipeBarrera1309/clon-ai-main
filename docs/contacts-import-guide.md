# Contacts CSV Import Feature Documentation

## Overview

The contacts CSV import feature allows restaurant administrators to bulk import customer contacts from CSV (Comma-Separated Values) files. This feature provides a simple way to migrate existing customer databases or add multiple contacts at once.

### Key Features

- CSV file upload and parsing
- Phone number validation and normalization
- Duplicate detection within organization
- Conflict resolution options (skip or update)
- Preview before import
- Detailed import results

## CSV File Format Specification

### Required Columns

| Column Name | Data Type | Required | Description |
|-------------|-----------|----------|-------------|
| `telefono` | String | ✅ | Phone number of the contact |

### Optional Columns

| Column Name | Data Type | Required | Description |
|-------------|-----------|----------|-------------|
| `nombre` | String | ❌ | Display name for the contact |
| `direccion` | String | ❌ | Last known delivery address |

### Alternative Column Names

The system also accepts the following alternative column names for compatibility:

- **telefono**: `teléfono`, `phone_number`
- **nombre**: `name`, `display_name`
- **direccion**: `dirección`, `address`, `last_known_address`

## Phone Number Format

### Accepted Formats

The system accepts phone numbers in various formats and normalizes them automatically:

| Input Format | Normalized Output |
|--------------|-------------------|
| `573001234567` | `573001234567` |
| `+573001234567` | `573001234567` |
| `3001234567` | `573001234567` |

### Normalization Rules

1. Remove all non-numeric characters except `+`
2. Remove leading `+` if present
3. If the number is 10 digits and starts with `3`, prepend `57` (Colombian country code)
4. Final number must be between 10-15 digits

### Validation Rules

- Phone number is required
- Must contain only digits after normalization
- Must be between 10-15 digits long
- Duplicates within the same CSV file are rejected

## Example CSV Content

### Basic Example

```csv
telefono,nombre,direccion
"573001234567","Juan Perez","Calle 100 #15-20 Bogota"
"573009876543","Maria Garcia",""
"573005551234","Carlos Lopez","Carrera 7 #45-10 Medellin"
```

### Minimal Example (Phone Numbers Only)

```csv
telefono
"573001234567"
"573009876543"
"573005551234"
```

**Nota:** Usa comillas dobles alrededor de los valores para evitar que Excel convierta los números de teléfono a notación científica.

## Import Process

### Step 1: File Preparation

1. Create CSV file with required columns
2. Ensure proper phone number formatting
3. Check data consistency and completeness

### Step 2: File Upload

- Accepts CSV files (.csv) only
- Maximum file size: 5MB
- UTF-8 encoding recommended
- Client-side validation for file type

### Step 3: Preview and Validation

- Parse CSV content and validate structure
- Check phone number validity
- Detect duplicates within the CSV
- Check for existing contacts in database
- Show preview with statistics

### Step 4: Conflict Resolution

Choose how to handle contacts that already exist:

- **Skip**: Ignore contacts that already exist in the database
- **Update**: Update existing contacts with new data from CSV

### Step 5: Import Execution

- Create new contacts in database
- Update existing contacts (if selected)
- Provide detailed success/failure report

## Validation Rules

### File Structure Validation

- ✅ Valid CSV format with proper delimiters
- ✅ Required column (phone_number) present
- ✅ At least one data row

### Phone Number Validation

- ✅ Phone number is not empty
- ✅ Contains only valid characters
- ✅ Between 10-15 digits after normalization
- ✅ No duplicates within the same file

### Business Logic Validation

- ✅ Phone numbers are unique within organization
- ✅ Conflict resolution applied for duplicates

## Error Handling

### Common Errors and Solutions

#### Invalid Phone Number Format

**Error**: "Formato de teléfono inválido"

**Solution**: Ensure phone number has 10-15 digits and contains only numbers

#### Missing Required Column

**Error**: "Columna 'telefono' no encontrada"

**Solution**: Verify the CSV has a column named `telefono`, `teléfono`, or `phone_number`

#### Duplicate Phone Numbers in File

**Error**: "Número duplicado en el archivo"

**Solution**: Remove duplicate entries from the CSV file

#### File Too Large

**Error**: "El archivo es demasiado grande"

**Solution**: Split large files into smaller batches (max 5MB per file)

## CSV Template

Download the CSV template that includes:

- All required and optional columns
- Example data with proper formatting
- Various phone number format examples

### Template Structure

```csv
telefono,nombre,direccion
"573001234567","Juan Perez","Calle 100 #15-20 Bogota"
"573009876543","Maria Garcia","Carrera 7 #45-10 Medellin"
"573005551234","Carlos Lopez","Avenida 68 #23-45 Cali"
```

**Importante:** Los valores están entre comillas dobles para que Excel no convierta los números largos a notación científica (ej: 5.73E+11).

## Best Practices

### Data Preparation

- Verify all phone numbers are valid before import
- Remove empty rows or incomplete data
- Use descriptive names for easy identification
- Test with a small sample file first

### File Format

- Save file with UTF-8 encoding
- Use commas as column separators
- Enclose text containing commas in quotes
- Keep file size under 5MB

### Performance Optimization

- Limit files to under 1000 contacts for optimal performance
- Consider splitting large imports into multiple files

## API Reference

### previewContactsImport

Parses and validates CSV content, returning a preview of the import.

**Arguments:**
- `csvContent` (string): Raw CSV content

**Returns:**
```typescript
{
  success: boolean
  error: string | null
  preview: {
    totalRows: number
    validRows: number
    invalidRows: number
    newContacts: number
    duplicateContacts: number
    rows: ParsedContactRow[]
    errors: { row: number; errors: string[] }[]
  } | null
}
```

### importContacts

Executes the contact import with specified conflict resolution.

**Arguments:**
- `csvContent` (string): Raw CSV content
- `conflictResolution` ("skip" | "update"): How to handle duplicates

**Returns:**
```typescript
{
  success: boolean
  error: string | null
  imported: number
  skipped: number
  updated: number
  errors: { row: number; error: string }[]
}
```

## Troubleshooting Guide

### Common Issues

#### Encoding Problems

**Symptoms**: Special characters appear as question marks or garbled text

**Solution**: Save CSV file with UTF-8 encoding

#### Excel Compatibility

**Symptoms**: Data appears in wrong columns

**Solution**: Use "Save as CSV UTF-8" option in Excel, or use a text editor

#### Large File Performance

**Symptoms**: Import process is slow or times out

**Solution**: Split large files into smaller batches (max 500 contacts per file)

### Support Resources

- Check the import log for detailed error messages
- Use the preview feature to validate data before importing
- Contact technical support for complex issues
