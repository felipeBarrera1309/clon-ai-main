# 📍 KML Import Feature Documentation

## Overview

The KML import feature allows restaurant administrators to bulk import delivery areas from KML (Keyhole Markup Language) files. This feature includes:

- KML file upload and parsing
- Comprehensive validation and error handling
- Conflict resolution for duplicate areas
- Automatic coordinate extraction and validation
- User-friendly import guide and example files
- Integration with Google My Maps export

## Architecture

### Frontend Components

- **KMLImportDialog** (`/dashboard/delivery-areas`): Multi-step import dialog with preview and validation
- **DeliveryAreasView**: Main delivery areas management page with import button

### Backend Functions

- **kmlParser.ts**: Parses and validates KML content
- **kmlImport.ts**: Handles preview and import operations

## KML File Format Specification

### Supported KML Structure

The system supports standard KML files exported from Google My Maps with the following structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Cobertura Área Metropolitana</name>
    <Folder>
      <name>Zirus Bucaramanga</name>
      <Placemark>
        <name>Zona Norte - Cabecera</name>
        <description><![CDATA[Domicilio $5,000<br>Tiempo aprox: 30-45 min]]></description>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
                -73.1239816,7.0926642,0 -73.1213906,7.0935213,0 ...
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
    </Folder>
  </Document>
</kml>
```

### Required Elements

| Element | Required | Description |
|---------|----------|-------------|
| `Document` | ✅ | Root container for KML data |
| `Folder` | ❌ | Optional grouping of areas (used as restaurant location) |
| `Placemark` | ✅ | Individual delivery area |
| `name` | ✅ | Area name (must be unique per organization) |
| `Polygon` | ✅ | Geographic boundary definition |
| `coordinates` | ✅ | Longitude,latitude,elevation coordinates |

### Optional Elements

| Element | Description |
|---------|-------------|
| `description` | Area description with delivery info |
| `Point` | Alternative to Polygon for point locations |

## Business Rules

1. **Area Uniqueness**: Areas are unique by name within each organization
2. **Coordinate Validation**: All coordinates must be valid (lat: -90 to 90, lng: -180 to 180)
3. **Polygon Validity**: Areas must have at least 3 coordinates to form a valid polygon
4. **Colombia Focus**: System validates coordinates are within Colombian territory
5. **Pricing Extraction**: Automatic extraction of delivery fees from descriptions
6. **Time Estimation**: Automatic extraction of delivery time estimates

## Import Process

### Step 1: File Upload
- Accepts KML files (.kml) only
- Maximum file size: 10MB
- Client-side validation for file type and basic structure

### Step 2: Preview Generation
- Parses KML content and extracts placemarks
- Validates coordinate data and polygon structure
- Detects conflicts with existing delivery areas
- Shows preview with statistics and warnings

### Step 3: Conflict Resolution
- **Skip**: Ignore conflicting areas
- **Overwrite**: Replace existing areas with same name
- **Create New**: Add with "(Importado)" suffix

### Step 4: Import Execution
- Creates delivery areas in database
- Associates areas with selected restaurant location
- Extracts pricing and timing information
- Provides detailed success/failure report

## Error Handling

### Client-Side Validation
- File type validation (.kml only)
- File size validation (max 10MB)
- Basic XML structure check

### Server-Side Validation
- Comprehensive KML parsing validation
- Coordinate range validation
- Polygon geometry validation
- Business rule enforcement

### Error Categories
- **File Format Errors**: Invalid XML, missing required elements
- **Data Validation Errors**: Invalid coordinates, malformed polygons
- **Business Rule Errors**: Duplicate names, invalid geometry
- **Conflict Errors**: Existing area conflicts

## User Experience

### Import Dialog Steps

1. **Upload**: File selection with drag & drop
2. **Preview**: Data analysis and conflict detection
3. **Validate**: Review errors and warnings
4. **Import**: Execute import with progress tracking
5. **Complete**: Results summary and error details

### Preview Features
- File information display
- Statistics dashboard (new vs conflicting areas)
- Folder/Placemark hierarchy visualization
- Error and warning alerts
- Conflict resolution options

## Example KML Content

### Basic Structure
```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Áreas de Entrega - Restaurante XYZ</name>
    <Folder>
      <name>Sede Principal</name>
      <Placemark>
        <name>Zona Centro</name>
        <description><![CDATA[Domicilio $4,500<br>Tiempo aprox: 20-30 min<br>Zona comercial central]]></description>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
                -73.120000,7.130000,0
                -73.125000,7.130000,0
                -73.125000,7.135000,0
                -73.120000,7.135000,0
                -73.120000,7.130000,0
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
    </Folder>
  </Document>
</kml>
```

### Advanced Features
```xml
<Placemark>
  <name>Zona Norte Premium</name>
  <description><![CDATA[
    <img src="https://example.com/map.png" width="200"/>
    <br><br>
    <b>Domicilio:</b> $7,500
    <br>
    <b>Tiempo aproximado:</b> 45-60 min
    <br>
    <b>Observaciones:</b> Solo entregas de lunes a sábado
  ]]></description>
  <Polygon>
    <outerBoundaryIs>
      <LinearRing>
        <coordinates>
          -73.110000,7.140000,0
          -73.115000,7.140000,0
          -73.115000,7.145000,0
          -73.110000,7.145000,0
          -73.110000,7.140000,0
        </coordinates>
      </LinearRing>
    </outerBoundaryIs>
  </Polygon>
</Placemark>
```

## Creating KML Files

### Method 1: Google My Maps (Recommended)

1. Go to [Google My Maps](https://www.google.com/maps/d/)
2. Create a new map
3. Add polygons for each delivery area
4. Add descriptions with pricing and timing info
5. Export as KML file

### Method 2: Manual Creation

Create a text file with `.kml` extension containing the XML structure shown above.

### Method 3: GIS Software

Use QGIS, ArcGIS, or other GIS software to create polygons and export as KML.

## Template Download

A complete KML template with examples is available for download. The template includes:

- Sample delivery areas for different zones
- Proper XML structure and formatting
- Examples of pricing and timing information
- Multiple folder organization
- Colombian coordinate examples

## Best Practices

### File Organization
- Use folders to group areas by restaurant location
- Use descriptive names for areas and folders
- Include pricing information in descriptions
- Add timing estimates when available

### Coordinate Accuracy
- Ensure polygons are closed (first and last coordinate match)
- Use at least 3 coordinates for valid polygons
- Verify coordinates are within Colombian territory
- Avoid overly complex polygons (keep under 100 vertices)

### Data Consistency
- Use consistent naming conventions
- Include delivery fees in descriptions
- Add timing information when available
- Use clear, descriptive area names

## Common Issues and Solutions

### Invalid Coordinates
**Problem**: Coordinates outside valid ranges
**Solution**: Verify latitude (-90 to 90) and longitude (-180 to 180)

### Malformed Polygons
**Problem**: Polygons with less than 3 coordinates
**Solution**: Ensure each polygon has at least 3 coordinate points

### Duplicate Names
**Problem**: Multiple areas with same name
**Solution**: Use conflict resolution options or rename areas

### Large File Sizes
**Problem**: Files exceeding 10MB limit
**Solution**: Split large KML files or simplify polygon complexity

## Integration with Menu System

KML import integrates seamlessly with the restaurant's menu and delivery system:

- **Location Association**: Areas are linked to specific restaurant locations
- **Pricing Integration**: Delivery fees extracted from KML descriptions
- **Availability Control**: Areas can be activated/deactivated independently
- **Order Validation**: Delivery addresses validated against imported areas

## Maintenance Notes

### Adding New Validation Rules
1. Update `kmlParser.ts` validation functions
2. Add corresponding error messages
3. Update the import guide documentation
4. Test with various edge cases

### Modifying Coordinate Validation
1. Update coordinate range checks in parser
2. Modify Colombian territory validation
3. Update error messages and documentation
4. Test with real-world coordinate data

### Performance Considerations
- Large files (>5MB) may need chunked processing
- Complex polygons (>50 vertices) may impact performance
- Consider implementing coordinate simplification for large areas

## Testing Scenarios

### Happy Path
- Valid KML with new delivery areas
- Areas with pricing and timing information
- Multiple folders and complex polygons

### Error Cases
- Invalid XML structure
- Coordinates outside valid ranges
- Missing required elements
- Duplicate area names

### Edge Cases
- Empty KML files
- Single point locations (Point instead of Polygon)
- Very large coordinate sets
- Unicode characters in names and descriptions

This comprehensive guide ensures restaurant administrators can successfully import delivery areas from KML files with confidence and ease.</content>
</xai:function_call/>
</xai:function_call name="write">
<parameter name="filePath">docs/kml-import-template-specification.md