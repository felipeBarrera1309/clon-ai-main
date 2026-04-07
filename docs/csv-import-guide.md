# 📊 CSV Import Feature Documentation - Delivery Areas

## Overview

The CSV import feature allows restaurant administrators to bulk import delivery areas from CSV (Comma-Separated Values) files. This feature provides an alternative to KML import for users who prefer working with spreadsheet data or need to integrate with existing business systems.

### Key Features

- CSV file upload and parsing
- Comprehensive validation and error handling
- Conflict resolution for duplicate areas
- Automatic coordinate validation
- Delivery fee and timing information import
- Integration with restaurant locations
- User-friendly import guide and templates

## CSV File Format Specification

### Required Columns

| Column Name | Data Type | Required | Description |
|-------------|-----------|----------|-------------|
| `area_name` | String | ✅ | Unique name for the delivery area |
| `coordinates` | String | ✅ | Polygon coordinates in "lat1,lng1;lat2,lng2;..." format |
| `restaurant_location_code` | String | ✅ | Code of the restaurant location (e.g., "BOG001", "MED001") |
| `is_active` | Boolean | ✅ | Whether the area is active (true/false, 1/0, yes/no) |

### Optional Columns

| Column Name | Data Type | Required | Description |
|-------------|-----------|----------|-------------|
| `description` | String | ❌ | Area description or notes |
| `delivery_fee` | Number | ❌ | Delivery fee in Colombian pesos (COP) |
| `minimum_order` | Number | ❌ | Minimum order amount in Colombian pesos (COP) |
| `estimated_delivery_time` | String | ❌ | Estimated delivery time (e.g., "30-45 min", "1 hora") |

## Coordinate Format

### Standard Format
Coordinates must be provided as a semicolon-separated list of latitude,longitude pairs:

```
lat1,lng1;lat2,lng2;lat3,lng3;lat1,lng1
```

### Example
```
4.6097,-74.0817;4.6120,-74.0800;4.6100,-74.0750;4.6080,-74.0780;4.6097,-74.0817
```

### Requirements
- **Minimum 3 points**: Each polygon must have at least 3 coordinate pairs
- **Closed polygon**: First and last coordinates should be the same
- **Valid ranges**: Latitude (-90 to 90), Longitude (-180 to 180)
- **Colombian territory**: Coordinates should be within Colombian boundaries
- **Decimal precision**: Use up to 6 decimal places for accuracy

## Business Rules

1. **Area Uniqueness**: Area names must be unique within each organization
2. **Restaurant Location**: Must reference existing restaurant location codes
3. **Coordinate Validation**: All coordinates must be valid and form closed polygons
4. **Active Status**: Areas can be imported as active or inactive
5. **Pricing Format**: Use numeric values without currency symbols or thousand separators
6. **Time Format**: Use descriptive text (e.g., "30-45 min", "1 hora")

## Example CSV Content

### Basic Example
```csv
area_name,coordinates,restaurant_location_code,is_active,delivery_fee,minimum_order,estimated_delivery_time
"Zona Norte","4.6500,-74.0800;4.6520,-74.0780;4.6510,-74.0750;4.6490,-74.0770;4.6500,-74.0800","BOG001",true,5000,25000,"30-45 min"
"Zona Sur","4.5800,-74.0900;4.5820,-74.0880;4.5810,-74.0850;4.5790,-74.0870;4.5800,-74.0900","BOG001",true,6000,30000,"45-60 min"
"Zona Centro","4.6100,-74.0850;4.6120,-74.0830;4.6110,-74.0800;4.6090,-74.0820;4.6100,-74.0850","BOG002",false,4500,20000,"20-30 min"
```

### Complete Example with All Fields
```csv
area_name,description,coordinates,restaurant_location_code,is_active,delivery_fee,minimum_order,estimated_delivery_time
"Chapinero Norte","Zona residencial y comercial premium","4.6500,-74.0600;4.6550,-74.0580;4.6540,-74.0550;4.6490,-74.0570;4.6500,-74.0600","BOG001",true,7500,35000,"30-45 min"
"Zona Rosa","Área de restaurantes y vida nocturna","4.6400,-74.0650;4.6430,-74.0630;4.6420,-74.0600;4.6390,-74.0620;4.6400,-74.0650","BOG001",true,6000,28000,"25-35 min"
"La Candelaria","Centro histórico de Bogotá","4.5950,-74.0750;4.5980,-74.0730;4.5970,-74.0700;4.5940,-74.0720;4.5950,-74.0750","BOG002",true,5500,22000,"35-50 min"
"Usaquén","Zona tradicional y gastronómica","4.6900,-74.0300;4.6930,-74.0280;4.6920,-74.0250;4.6890,-74.0270;4.6900,-74.0300","BOG001",false,8000,40000,"40-60 min"
```

## Import Process

### Step 1: File Preparation
1. Create CSV file with required columns
2. Ensure proper coordinate formatting
3. Validate restaurant location codes exist
4. Check data consistency and completeness

### Step 2: File Upload
- Accepts CSV files (.csv) only
- Maximum file size: 5MB
- UTF-8 encoding recommended
- Client-side validation for file type

### Step 3: Preview and Validation
- Parse CSV content and validate structure
- Check coordinate validity and polygon formation
- Verify restaurant location codes exist
- Detect conflicts with existing delivery areas
- Show preview with statistics and warnings

### Step 4: Conflict Resolution
Choose how to handle areas with duplicate names:
- **Skip**: Ignore conflicting areas
- **Overwrite**: Replace existing areas with same name
- **Create New**: Add with "(Importado CSV)" suffix

### Step 5: Import Execution
- Create delivery areas in database
- Associate areas with restaurant locations
- Apply pricing and timing information
- Provide detailed success/failure report

## Validation Rules

### File Structure Validation
- ✅ Valid CSV format with proper delimiters
- ✅ Required columns present
- ✅ Data types match column specifications
- ✅ No empty required fields

### Coordinate Validation
- ✅ Proper coordinate format (lat,lng pairs)
- ✅ Valid latitude and longitude ranges
- ✅ Minimum 3 coordinate pairs per polygon
- ✅ Closed polygon (first = last coordinate)
- ✅ Colombian territory validation

### Business Logic Validation
- ✅ Restaurant location codes exist
- ✅ Area names are unique within organization
- ✅ Delivery fees are positive numbers
- ✅ Minimum orders are positive numbers
- ✅ Boolean values for is_active field

## Error Handling

### Common Errors and Solutions

#### Invalid Coordinate Format
**Error**: "Coordinate format invalid in row 5"
**Solution**: Use "lat,lng;lat,lng;..." format with proper decimal numbers

#### Restaurant Location Not Found
**Error**: "Restaurant location 'BOG999' not found"
**Solution**: Verify location codes exist in your restaurant locations

#### Duplicate Area Names
**Error**: "Area name 'Zona Norte' already exists"
**Solution**: Use conflict resolution options or rename areas

#### Invalid Polygon
**Error**: "Polygon must have at least 3 coordinates"
**Solution**: Ensure each area has minimum 3 coordinate pairs

#### File Size Exceeded
**Error**: "File size exceeds 5MB limit"
**Solution**: Split large files or reduce coordinate precision

## CSV Template

Download the CSV template that includes:
- All required and optional columns
- Example data for different area types
- Proper coordinate formatting examples
- Colombian location examples
- Various pricing and timing scenarios

### Template Structure
```csv
area_name,description,coordinates,restaurant_location_code,is_active,delivery_fee,minimum_order,estimated_delivery_time
"Ejemplo Zona 1","Área de ejemplo con descripción","4.6097,-74.0817;4.6120,-74.0800;4.6100,-74.0750;4.6097,-74.0817","SEDE001",true,5000,25000,"30-45 min"
"Ejemplo Zona 2","Otra área de ejemplo","4.5800,-74.0900;4.5820,-74.0880;4.5800,-74.0900","SEDE001",false,6000,30000,"45-60 min"
```

## Best Practices

### Data Preparation
- Use consistent naming conventions for areas
- Include descriptive information in the description field
- Verify all coordinates before import
- Test with a small sample file first

### Coordinate Accuracy
- Use GPS tools or mapping software to obtain precise coordinates
- Ensure polygons represent actual service areas
- Avoid overly complex polygons (keep under 50 vertices)
- Double-check coordinate order (latitude first, then longitude)

### File Management
- Use descriptive file names (e.g., "delivery_areas_bogota_2024.csv")
- Keep backup copies of source data
- Document any data transformations applied
- Maintain version control for template updates

### Performance Optimization
- Limit files to under 1000 areas for optimal performance
- Use simplified polygons for large coverage areas
- Consider splitting multi-city imports into separate files

## Integration with Restaurant System

### Restaurant Location Codes
CSV import requires valid restaurant location codes. Get these from:
1. Restaurant Locations management page
2. Contact your system administrator
3. Use the location list API endpoint

### Menu Integration
Imported delivery areas automatically integrate with:
- Order validation system
- Delivery fee calculation
- Address verification tools
- Customer service features

### Reporting Integration
Imported areas appear in:
- Delivery coverage reports
- Order analytics by zone
- Performance metrics by area
- Customer service dashboards

## Troubleshooting Guide

### Common Issues

#### Encoding Problems
**Symptoms**: Special characters appear as question marks
**Solution**: Save CSV file with UTF-8 encoding

#### Excel Compatibility
**Symptoms**: Coordinates formatted incorrectly in Excel
**Solution**: Use text format for coordinate columns or import from text editor

#### Large File Performance
**Symptoms**: Import process is slow or times out
**Solution**: Split large files into smaller batches (max 500 areas per file)

#### Coordinate Precision
**Symptoms**: Areas don't match expected boundaries
**Solution**: Use 6 decimal places for coordinate precision

### Support Resources
- Check the import log for detailed error messages
- Use the CSV validation tool before importing
- Contact technical support for complex coordinate issues
- Refer to the KML import guide for alternative formats

## Maintenance and Updates

### Adding New Validation Rules
1. Update CSV parser validation logic
2. Add corresponding error messages
3. Update documentation and examples
4. Test with various edge cases

### Template Updates
1. Modify template structure as needed
2. Update example data to reflect current best practices
3. Ensure backward compatibility when possible
4. Communicate changes to users

This comprehensive guide ensures restaurant administrators can successfully import delivery areas from CSV files with confidence and accuracy.