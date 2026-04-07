# 📊 Menu Import Feature Documentation

## Overview

The menu import feature allows restaurant administrators to bulk import menu products from CSV or Excel files. This feature includes:

- CSV/Excel file upload and parsing
- Comprehensive validation and error handling
- Conflict resolution for duplicate products
- Automatic creation of categories and sizes
- User-friendly import guide and example files

## Architecture

### Frontend Components

- **MenuImportGuidePage** (`/menu/import-guide`): Comprehensive guide with column definitions and downloadable example
- **MenuImportDialog**: Multi-step import dialog with preview and validation
- **MenuView**: Main menu management page with import button

### Backend Functions

- **csvMenuParser.ts**: Parses and validates CSV content
- **menuImportSimple.ts**: Handles preview and import operations

## File Format Specification

### CSV Columns

| Column | Field | Type | Required | Description |
|--------|-------|------|----------|-------------|
| A | `nombre_producto` | Text | ✅ | Product name (max 100 chars) |
| B | `descripcion` | Text | ✅ | Product description (max 500 chars) |
| C | `categoria` | Text | ✅ | Category name (auto-created if doesn't exist) |
| D | `subcategoria` | Text | ❌ | Subcategory name (auto-created if doesn't exist, optional) |
| E | `tamaño` | Text | ❌ | Size name (auto-created if doesn't exist, optional) |
| F | `precio` | Number | ✅ | Price in COP (100-1,000,000, no formatting) |
| G | `individual` | Text | ✅ | "Sí" or "No" - standalone product |
| H | `combinable_mitad` | Text | ✅ | "Sí" or "No" - can be combined in halves |
| I | `cantidad_minima` | Number | ❌ | Min quantity (1-100, optional) |
| J | `cantidad_maxima` | Number | ❌ | Max quantity (1-1000, optional) |
| K | `combinable_con` | Text | ❌ | Compatible categories and sizes (see format below) |
| L | `codigo_externo` | Text | ❌ | External system identifier (SKU, product code, etc.) |

### Business Rules

1. **Product Uniqueness**: Products are unique by name + category + size combination
2. **Category Creation**: Missing categories are created automatically
3. **Subcategory Creation**: Missing subcategories are created automatically and linked to their parent category
4. **Size Creation**: Missing sizes are created automatically
5. **Standalone Products**: Must be marked as standalone to be ordered alone
6. **Combinable Products**: Non-standalone products need compatible categories
7. **Half Combinations**: Products marked as combinable_half must be standalone
8. **Subcategory Hierarchy**: Subcategories must belong to a category and help organize products within categories

### Subcategory Usage

**Purpose**: Subcategories provide an additional level of organization within categories, helping to better organize large menus.

**Examples**:
- **Pizzas** → Clásicas, Especiales, Vegetarianas
- **Bebidas** → Gaseosas, Jugos, Aguas, Calientes
- **Adicionales** → Quesos, Carnes, Verduras
- **Entrantes** → Fritos, Ensaladas, Sopas

**Import Behavior**:
- If a subcategory doesn't exist, it's created automatically
- Subcategories are linked to their parent category from the same row
- Leaving subcategory empty is allowed - products will only have category classification
- Products with the same name can exist in different subcategories

### Combinable With Format

The `combinable_con` column supports flexible combination rules using these formats:

**Basic Category Combinations**:
- `Bebidas` - Can combine with any product in the Bebidas category
- `Bebidas;Adicionales` - Can combine with any product in Bebidas OR Adicionales categories

**Category + Size Combinations**:
- `Bebidas&350ml` - Can combine only with Bebidas products that have 350ml size
- `Bebidas&350ml;Bebidas&500ml` - Can combine with Bebidas in 350ml OR 500ml sizes
- `Pizzas&Personal;Pizzas&Mediana;Pizzas&Grande` - Can combine with Pizzas in Personal, Mediana, or Grande sizes

**Mixed Combinations**:
- `Bebidas&350ml;Adicionales` - Can combine with Bebidas in 350ml size OR any Adicionales product
- `Pizzas&Personal;Bebidas;Entrantes&Fritos` - Complex combinations with different rules per category

**Format Rules**:
- Use `;` (semicolon) to separate different combination options
- Use `&` (ampersand) to specify category + size requirements
- Category names and size names must match exactly (case-insensitive)
- Empty field means the product cannot be combined with others

## Import Process

### Step 1: File Upload
- Accepts CSV (.csv) and Excel (.xlsx, .xls) files
- Maximum file size: 10MB
- Client-side validation for file type and basic structure

### Step 2: Preview Generation
- Parses file content
- Validates data structure and business rules
- Detects conflicts with existing products
- Shows preview with statistics and warnings

### Step 3: Conflict Resolution
- **Skip**: Ignore conflicting products
- **Overwrite**: Replace existing products
- **Create New**: Add with "(Importado)" suffix

### Step 4: Import Execution
- Creates missing categories and subcategories
- Creates missing sizes
- Imports valid products
- Sets up availability for all restaurant locations
- Provides detailed success/failure report

## Error Handling

### Client-Side Validation
- File type and size validation
- Basic CSV structure check
- Required headers validation

### Server-Side Validation
- Comprehensive data validation
- Business rule enforcement
- Duplicate detection
- User-friendly error messages

### Error Categories
- **File Format Errors**: Wrong headers, encoding issues
- **Data Validation Errors**: Invalid prices, missing required fields
- **Business Rule Errors**: Invalid combinations, constraint violations
- **Conflict Errors**: Duplicate products, naming issues

## User Experience

### Import Guide Page
- Comprehensive column documentation
- Downloadable example CSV
- Visual examples and tips
- Best practices and common pitfalls

### Import Dialog
- Step-by-step progress indication
- Real-time preview with conflict detection
- Clear error messages and resolution guidance
- Success/failure reporting

### External Code Field

The `codigo_externo` column is optional and allows you to store external system identifiers for your products. This is useful for:

- **Integration with POS systems**: Match products between Echo and your existing point-of-sale system
- **Inventory management**: Link with external inventory management systems  
- **SKU tracking**: Store product SKUs from your catalog system
- **Third-party integrations**: Facilitate future integrations with delivery platforms

**Examples of external codes**:
- `PIZZA-MARG-P` (Pizza Margarita Personal)
- `SKU-001`, `PROD-123`
- `POS-ITEM-456`
- `INV-789`

**Important notes**:
- External codes should be unique when possible
- Leave empty if not using external systems
- Can be updated later through the product edit form
- Maximum length: 50 characters

## Example CSV Content

```csv
nombre_producto,descripcion,categoria,subcategoria,tamaño,precio,individual,combinable_mitad,cantidad_minima,cantidad_maxima,combinable_con,codigo_externo
Pizza Margarita,Salsa de tomate queso mozzarella fresco albahaca,Pizzas,Clásicas,Personal,15000,Sí,Sí,1,5,Bebidas&350ml;Bebidas&500ml;Adicionales,PIZZA-MARG-P
Pizza Margarita,Salsa de tomate queso mozzarella fresco albahaca,Pizzas,Clásicas,Mediana,22000,Sí,Sí,1,5,Bebidas;Adicionales,PIZZA-MARG-M
Pizza BBQ,Pizza con salsa barbacoa pollo y cebolla morada,Pizzas,Especiales,Personal,18000,Sí,Sí,1,5,Bebidas&350ml;Bebidas&500ml;Adicionales,PIZZA-BBQ-P
Coca Cola 350ml,Bebida gaseosa sabor original,Bebidas,Gaseosas,350ml,3500,Sí,No,1,10,,COCACOLA-350
Agua Natural,Agua embotellada 500ml,Bebidas,Aguas,,2500,Sí,No,1,10,,AGUA-500
Queso Extra,Porción adicional de queso mozzarella,Adicionales,Quesos,,2500,No,No,1,3,Pizzas&Personal;Pizzas&Mediana;Pizzas&Grande,EXTRA-QUESO
```

## Maintenance Notes

### Adding New Validation Rules
1. Update `csvMenuParser.ts` validation functions
2. Add corresponding error messages
3. Update the import guide documentation
4. Test with various edge cases

### Modifying Column Structure
1. Update CSV parser column mapping
2. Modify validation logic
3. Update example files and documentation
4. Ensure backward compatibility

### Performance Considerations
- Large files (>1000 products) may need chunked processing
- Excel files are converted to CSV for processing
- Consider implementing async processing for very large imports

## Testing Scenarios

### Happy Path
- Valid CSV with new products
- Valid Excel file with mixed product types
- Products with all optional fields filled

### Error Cases
- Wrong file format
- Missing required columns
- Invalid data types
- Business rule violations
- Duplicate products

### Edge Cases
- Empty files
- Files with only headers
- Unicode characters in product names
- Very long descriptions
- Extreme price values