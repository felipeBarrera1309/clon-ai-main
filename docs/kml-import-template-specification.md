# 📍 KML Import Template Specification

## 📁 File Structure: `kml-import-template.kml`

### 🏷️ **Root Document Structure**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Plantilla Áreas de Entrega - Restaurante</name>
    <description>Plantilla para importar áreas de entrega desde KML</description>

    <!-- Estilos para visualización en Google Earth/My Maps -->
    <Style id="areaStyle">
      <PolyStyle>
        <color>ff00ff00</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
      <LineStyle>
        <color>ff0000ff</color>
        <width>2</width>
      </LineStyle>
    </Style>

    <!-- Carpetas por sede/restaurante -->
    <Folder>
      <name>Sede Principal</name>
      <!-- Áreas de entrega aquí -->
    </Folder>

  </Document>
</kml>
```

### 🏷️ **Area Placemark Template**

#### **Complete Structure:**

```xml
<Placemark>
  <name>Zona Centro Histórico</name>
  <description><![CDATA[
    <img src="https://example.com/area-image.jpg" width="200" height="150" alt="Zona Centro"/>
    <br><br>
    <b>💰 Domicilio:</b> $5,500
    <br>
    <b>⏱️ Tiempo aproximado:</b> 25-35 minutos
    <br>
    <b>📝 Observaciones:</b> Zona comercial, entregas de Lunes a Sábado 11:00 AM - 9:00 PM
    <br>
    <b>🚚 Restricciones:</b> Solo entregas por vías principales
  ]]></description>
  <styleUrl>#areaStyle</styleUrl>
  <Polygon>
    <outerBoundaryIs>
      <LinearRing>
        <tessellate>1</tessellate>
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
```

#### **Field Specifications:**

| Field | Required | Format | Example | Description |
|-------|----------|--------|---------|-------------|
| `name` | ✅ | Text (max 100 chars) | "Zona Norte Residencial" | Unique area name within organization |
| `description` | ❌ | CDATA HTML | See examples below | Area details, pricing, timing |
| `coordinates` | ✅ | lng,lat,elevation | "-73.120000,7.130000,0" | Geographic boundary points |

### 🏷️ **Description Content Templates**

#### **Basic Template:**
```html
Domicilio $4,500<br>Tiempo aprox: 20-30 min
```

#### **Complete Template:**
```html
<img src="https://example.com/map-image.jpg" width="200" alt="Área de entrega"/>
<br><br>
<b>Domicilio:</b> $6,500
<br>
<b>Tiempo aproximado:</b> 35-45 minutos
<br>
<b>Horario de entregas:</b> Lunes a Domingo 11:00 AM - 10:00 PM
<br>
<b>Observaciones:</b> Zona residencial, acceso por carrera principal
<br>
<b>Restricciones:</b> No entregas después de 9:00 PM en festivos
```

#### **Advanced Template with Icons:**
```html
📍 <b>Zona Centro Empresarial</b>
<br><br>
💰 <b>Costo de domicilio:</b> $3,500 (pedidos > $25,000)
<br>
⏱️ <b>Tiempo de entrega:</b> 15-25 minutos
<br>
🏢 <b>Tipo de zona:</b> Empresarial/Comercial
<br>
🚫 <b>Restricciones:</b> Solo entregas en horario laboral
<br>
📞 <b>Contacto:</b> Llamar antes de entregar en piso 10+
```

### 🏷️ **Coordinate Format Standards**

#### **Basic Polygon (Rectangle):**
```xml
<coordinates>
  -73.120000,7.130000,0
  -73.125000,7.130000,0
  -73.125000,7.135000,0
  -73.120000,7.135000,0
  -73.120000,7.130000,0
</coordinates>
```

#### **Complex Polygon (Irregular Shape):**
```xml
<coordinates>
  -73.115000,7.125000,0
  -73.130000,7.125000,0
  -73.135000,7.132000,0
  -73.132000,7.140000,0
  -73.125000,7.138000,0
  -73.118000,7.135000,0
  -73.115000,7.130000,0
  -73.115000,7.125000,0
</coordinates>
```

### 🏷️ **Folder Organization Examples**

#### **By Restaurant Location:**
```xml
<Folder>
  <name>Sede Chapinero</name>
  <Placemark>...</Placemark>
  <Placemark>...</Placemark>
</Folder>
<Folder>
  <name>Sede Zona Rosa</name>
  <Placemark>...</Placemark>
</Folder>
```

#### **By Delivery Zone Type:**
```xml
<Folder>
  <name>Zonas Express (15-20 min)</name>
  <Placemark>...</Placemark>
</Folder>
<Folder>
  <name>Zonas Estándar (25-35 min)</name>
  <Placemark>...</Placemark>
</Folder>
<Folder>
  <name>Zonas Extendidas (40-60 min)</name>
  <Placemark>...</Placemark>
</Folder>
```

### 🏷️ **Complete Working Example**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Áreas de Entrega - Restaurante Ejemplo</name>

    <Style id="areaEstilo">
      <PolyStyle>
        <color>ff00ff00</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>

    <Folder>
      <name>Sede Principal - Centro</name>

      <Placemark>
        <name>Zona 1 - Centro Histórico</name>
        <description><![CDATA[
          <b>📍 Zona Centro Histórico</b>
          <br><br>
          💰 <b>Domicilio:</b> $4,500
          <br>
          ⏱️ <b>Tiempo:</b> 20-30 minutos
          <br>
          📝 <b>Observaciones:</b> Zona peatonal, entregas por carrera séptima
        ]]></description>
        <styleUrl>#areaEstilo</styleUrl>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <tessellate>1</tessellate>
              <coordinates>
                -74.075000,4.600000,0
                -74.080000,4.600000,0
                -74.080000,4.605000,0
                -74.075000,4.605000,0
                -74.075000,4.600000,0
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>

      <Placemark>
        <name>Zona 2 - Parque de la 93</name>
        <description><![CDATA[
          <b>🏡 Zona Norte Residencial</b>
          <br><br>
          💰 <b>Domicilio:</b> $6,500
          <br>
          ⏱️ <b>Tiempo:</b> 30-40 minutos
          <br>
          📝 <b>Observaciones:</b> Zona residencial exclusiva
        ]]></description>
        <styleUrl>#areaEstilo</styleUrl>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <tessellate>1</tessellate>
              <coordinates>
                -74.055000,4.620000,0
                -74.065000,4.620000,0
                -74.065000,4.630000,0
                -74.055000,4.630000,0
                -74.055000,4.620000,0
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>

    </Folder>

  </Document>
</kml>
```

## 🎨 **Styling and Visualization**

### **Color Coding by Delivery Fee:**
```xml
<!-- Bajo costo - Verde -->
<Style id="bajoCosto">
  <PolyStyle><color>ff00ff00</color></PolyStyle>
</Style>

<!-- Medio costo - Amarillo -->
<Style id="medioCosto">
  <PolyStyle><color>ff00ffff</color></PolyStyle>
</Style>

<!-- Alto costo - Rojo -->
<Style id="altoCosto">
  <PolyStyle><color>ff0000ff</color></PolyStyle>
</Style>
```

### **Icon Styles for Points:**
```xml
<Style id="restaurantIcon">
  <IconStyle>
    <Icon>
      <href>https://maps.google.com/mapfiles/kml/shapes/restaurant.png</href>
    </Icon>
  </IconStyle>
</Style>
```

## 📋 **Validation Rules**

### **Required Validations:**
- ✅ File extension: `.kml`
- ✅ Valid XML structure
- ✅ At least one Placemark
- ✅ Each Placemark has name and coordinates
- ✅ Coordinates in valid ranges (Colombia)
- ✅ Polygons have minimum 3 coordinates

### **Recommended Validations:**
- ⚠️ Unique area names within organization
- ⚠️ Coordinates within Colombian territory
- ⚠️ Reasonable polygon complexity (< 100 vertices)
- ⚠️ Delivery fee information in description

## 🛠️ **Tools for Creating KML Files**

### **1. Google My Maps (Free)**
1. Go to [maps.google.com](https://maps.google.com)
2. Click "Create a new map"
3. Use polygon drawing tool
4. Add descriptions with pricing
5. Export as KML

### **2. Online KML Editors**
- **KML Generator**: Online polygon creation
- **GeoJSON to KML**: Convert existing GeoJSON files
- **CSV to KML**: Bulk coordinate import

### **3. GIS Software**
- **QGIS**: Free GIS software with KML export
- **ArcGIS**: Professional mapping software
- **Google Earth Pro**: Free desktop application

## 📊 **Data Extraction Patterns**

### **Delivery Fee Extraction:**
```javascript
// Patterns recognized in descriptions:
const patterns = [
  /\$(\d{1,3}(?:,\d{3})*)/g,  // $5,500 or $5500
  /Domicilio:?\s*\$(\d+)/gi,  // "Domicilio: $5500"
  /Costo:?\s*\$(\d+)/gi,      // "Costo: $5500"
]
```

### **Time Estimation Extraction:**
```javascript
// Patterns for time extraction:
const timePatterns = [
  /Tiempo:?\s*(\d+-\d+)\s*min/gi,     // "Tiempo: 20-30 min"
  /(\d+-\d+)\s*minutos/gi,            // "25-35 minutos"
  /aprox:?\s*(\d+-\d+)\s*min/gi,      // "aprox: 30-45 min"
]
```

## 🚨 **Common Issues and Solutions**

### **Issue 1: Invalid Coordinates**
```
Problem: Coordinates outside Colombia
Solution: Verify lat/lng ranges
Colombia bounds: Lat 0-13, Lng -82 to -66
```

### **Issue 2: Malformed Polygons**
```
Problem: Open polygons or < 3 coordinates
Solution: Ensure closed polygons with minimum 3 points
```

### **Issue 3: Encoding Issues**
```
Problem: Special characters not displaying correctly
Solution: Use UTF-8 encoding and CDATA sections
```

### **Issue 4: Large File Sizes**
```
Problem: Files > 10MB causing upload failures
Solution: Split into multiple files or simplify polygons
```

## 📝 **Best Practices Checklist**

### **File Structure:**
- [ ] Valid XML with proper KML namespace
- [ ] Descriptive document and folder names
- [ ] Logical organization by location/zone type

### **Area Definition:**
- [ ] Unique, descriptive area names
- [ ] Complete delivery information in descriptions
- [ ] Accurate coordinate boundaries
- [ ] Reasonable polygon complexity

### **Data Quality:**
- [ ] Consistent pricing format
- [ ] Realistic time estimates
- [ ] Clear delivery restrictions
- [ ] Contact information when needed

### **Technical Requirements:**
- [ ] UTF-8 encoding
- [ ] Valid coordinate format (lng,lat,elevation)
- [ ] Closed polygons (first/last coordinate match)
- [ ] File size under 10MB

This template specification provides everything needed to create professional, import-ready KML files for delivery area management! 🗺️✨</content>
</xai:function_call/>
</xai:function_call name="write">
<parameter name="filePath">docs/kml-import-template.kml