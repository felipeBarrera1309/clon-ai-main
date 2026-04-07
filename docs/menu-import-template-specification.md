# 📊 Menu Import Excel Template Specification

## 📁 File Structure: `menu-import-template.xlsx`

### 🏷️ **Sheet 1: "Productos" (Main Data)**

#### **Column Definitions:**

| Col | Field | Header ES | Type | Required | Validation | Example |
|-----|-------|-----------|------|----------|------------|---------|
| A | `product_name` | Nombre del Producto | Text | ✅ | Max 100 chars, No duplicates per size | "Pizza Margarita" |
| B | `description` | Descripción | Text | ✅ | Max 500 chars | "Salsa de tomate, queso mozzarella fresco..." |
| C | `category` | Categoría | Dropdown | ✅ | Must exist in Categories sheet | "Pizzas Clásicas" |
| D | `subcategory` | Subcategoría | Text | ⚪ | Max 50 chars, optional | "Clásicas" |
| E | `size` | Tamaño | Dropdown | ⚪ | Must exist in Sizes sheet or be empty | "Personal" |
| F | `price` | Precio (COP) | Currency | ✅ | Min: 100, Max: 1,000,000 | "15000" |
| G | `standalone` | Producto Individual | Dropdown | ✅ | "Sí" or "No" | "Sí" |
| H | `combinable_half` | Combinable Mitad | Dropdown | ✅ | "Sí" or "No" | "Sí" |
| I | `min_quantity` | Cantidad Mínima | Number | ⚪ | Min: 1, Max: 100 | "1" |
| J | `max_quantity` | Cantidad Máxima | Number | ⚪ | Min: min_quantity, Max: 1000 | "10" |
| K | `combinable_with` | Combinable Con | Text | ⚪ | Categories separated by ";" | "Bebidas;Entrantes" |
| L | `external_code` | Código Externo | Text | ⚪ | Max 50 chars, for system integration | "PIZZA-MARG-P" |

#### **Excel Formulas for Validation:**

```excel
// Column M: Validation Status
=IF(AND(A2<>"", B2<>"", C2<>"", E2>0, F2<>"", G2<>""), "✅ Válido", "❌ Faltan datos")

// Column N: Category Validation
=IF(COUNTIF(Categorías!A:A,C2)>0, "✅", "❌ Categoría inválida")

// Column O: Size Validation  
=IF(OR(D2="", COUNTIF(Tamaños!A:A,D2)>0), "✅", "❌ Tamaño inválido")

// Column P: Price Validation
=IF(AND(E2>=100, E2<=1000000), "✅", "❌ Precio fuera de rango")

// Column Q: Combinable With Validation
=IF(K2="", "✅", IF(SUMPRODUCT(--(ISERROR(FIND(TRIM(MID(SUBSTITUTE(K2,";",REPT(" ",100)), ROW(INDIRECT("1:"&LEN(K2)-LEN(SUBSTITUTE(K2,";",""))+1))*100-99, 100)), Categorías!A:A))))>0, "❌ Categoría combinable inválida", "✅"))
```

#### **Conditional Formatting Rules:**

```excel
// Green: Valid rows
Condition: =$M2="✅ Válido"
Format: Light Green Fill

// Red: Invalid data
Condition: =OR($N2="❌ Categoría inválida", $O2="❌ Tamaño inválido", $P2="❌ Precio fuera de rango")
Format: Light Red Fill

// Yellow: Missing required data
Condition: =$M2="❌ Faltan datos"
Format: Light Yellow Fill
```

### 🏷️ **Sheet 2: "Categorías" (Reference Data)**

#### **Purpose:** Define valid product categories

| Col | Field | Header ES | Example |
|-----|-------|-----------|---------|
| A | `category_name` | Nombre de Categoría | "Pizzas Clásicas" |

#### **Pre-populated Data:**
```
Pizzas Clásicas
Pizzas Especiales  
Pizzas Gourmet
Entrantes
Bebidas
Adicionales
Postres
Promociones
```

#### **Validation:**
- No duplicates allowed
- Max 50 characters
- Cannot be empty

### 🏷️ **Sheet 3: "Tamaños" (Reference Data)**

#### **Purpose:** Define valid product sizes

| Col | Field | Header ES | Example |
|-----|-------|-----------|---------|
| A | `size_name` | Nombre de Tamaño | "Personal" |

#### **Pre-populated Data:**
```
Personal
Mediana
Grande
Familiar
Extra Grande
```

### 🏷️ **Sheet 4: "Instrucciones" (User Guide)**

#### **Content Sections:**

```markdown
# 📋 INSTRUCCIONES DE USO - IMPORTACIÓN DE MENÚ

## 🎯 PASO A PASO:

### 1. PREPARAR CATEGORÍAS
- Ir a la hoja "Categorías"
- Agregar o modificar las categorías de tu menú
- ⚠️ NO dejar filas vacías entre categorías

### 2. PREPARAR TAMAÑOS  
- Ir a la hoja "Tamaños"
- Agregar los tamaños que manejas (Personal, Mediana, etc.)
- ⚠️ Dejar vacío si el producto no maneja tamaños

### 3. LLENAR PRODUCTOS
- Ir a la hoja "Productos"
- Llenar cada fila con un producto
- ✅ Verde = Datos correctos
- ❌ Rojo = Error en los datos
- ⚪ Amarillo = Faltan datos obligatorios

## 📊 EJEMPLOS PRÁCTICOS:

### Producto con Tamaños (Pizza):
Nombre: Pizza Margarita
Descripción: Salsa de tomate, queso mozzarella, albahaca
Categoría: Pizzas Clásicas
Tamaño: Personal
Precio: 15000
Individual: Sí
Combinable Mitad: Sí
Cantidad Mín: 1
Cantidad Máx: 5
Combinable Con: Bebidas;Adicionales
Código Externo: PIZZA-MARG-P

### Producto sin Tamaños (Bebida):
Nombre: Coca Cola 350ml
Descripción: Bebida gaseosa sabor original
Categoría: Bebidas
Tamaño: (vacío)
Precio: 3500
Individual: Sí
Combinable Mitad: No
Cantidad Mín: 1
Cantidad Máx: 10
Combinable Con: (vacío)
Código Externo: COCACOLA-350

## ⚠️ REGLAS IMPORTANTES:

1. **PRODUCTOS CON TAMAÑOS**: Crear una fila por cada tamaño
   - Pizza Personal: Fila 1
   - Pizza Mediana: Fila 2  
   - Pizza Grande: Fila 3

2. **PRECIOS**: En pesos colombianos, sin puntos ni comas
   - ✅ Correcto: 15000
   - ❌ Incorrecto: 15.000 o $15,000

3. **COMBINABLE CON**: Separar categorías con punto y coma
   - ✅ Correcto: Bebidas;Adicionales;Entrantes
   - ❌ Incorrecto: Bebidas, Adicionales

4. **CAMPOS OBLIGATORIOS**: 
   - Nombre del Producto
   - Descripción  
   - Categoría
   - Precio
   - Producto Individual
   - Combinable Mitad

## 🚨 ERRORES COMUNES:

❌ Categoría no existe en la hoja "Categorías"
❌ Tamaño no existe en la hoja "Tamaños"  
❌ Precio menor a 100 o mayor a 1,000,000
❌ Cantidad máxima menor que cantidad mínima
❌ Usar "Si" en lugar de "Sí"
❌ Categorías combinables que no existen

## 📞 SOPORTE:
Si tienes problemas, contacta soporte técnico.
```

### 🏷️ **Sheet 5: "Ejemplo" (Sample Data)**

#### **Purpose:** Show complete examples for reference

| Nombre del Producto | Descripción | Categoría | Subcategoría | Tamaño | Precio | Individual | Combinable Mitad | Min | Max | Combinable Con | Código Externo |
|-------------------|-------------|-----------|-------------|---------|---------|------------|------------------|-----|-----|----------------|----------------|
| Pizza Margarita | Salsa de tomate, mozzarella fresco, albahaca | Pizzas | Clásicas | Personal | 15000 | Sí | Sí | 1 | 5 | Bebidas;Adicionales | PIZZA-MARG-P |
| Pizza Margarita | Salsa de tomate, mozzarella fresco, albahaca | Pizzas | Clásicas | Mediana | 22000 | Sí | Sí | 1 | 5 | Bebidas;Adicionales | PIZZA-MARG-M |
| Pizza Margarita | Salsa de tomate, mozzarella fresco, albahaca | Pizzas | Clásicas | Grande | 28000 | Sí | Sí | 1 | 5 | Bebidas;Adicionales | PIZZA-MARG-G |
| Coca Cola 350ml | Bebida gaseosa sabor original | Bebidas | Gaseosas | 350ml | 3500 | Sí | No | 1 | 10 | | COCACOLA-350 |
| Queso Extra | Porción adicional de queso mozzarella | Adicionales | Quesos | | 2500 | No | No | 1 | 3 | | EXTRA-QUESO |
| Aros de Cebolla | Aros de cebolla empanizados y fritos | Entrantes | Fritos | | 8500 | Sí | No | 1 | 2 | Bebidas | AROS-CEBOLLA |

## 🎨 **Excel Styling Specifications:**

### **Header Row (Row 1):**
- Background: Dark Blue (#1f4e79)
- Font: White, Bold, 12pt
- Border: All borders, white color
- Text Alignment: Center, Middle

### **Data Validation Dropdowns:**

```excel
// Categories dropdown (Column C)
Source: =Categorías!$A$2:$A$100
Error Style: Stop
Error Message: "Selecciona una categoría válida de la lista"

// Sizes dropdown (Column D)  
Source: =Tamaños!$A$2:$A$100
Error Style: Warning
Error Message: "Selecciona un tamaño válido o deja vacío"

// Yes/No dropdowns (Columns F, G)
Source: "Sí,No"
Error Style: Stop
Error Message: "Solo se permite 'Sí' o 'No'"
```

### **Number Formatting:**
- Price column (E): `#,##0` (Colombian peso format)
- Quantity columns (H, I): `0` (whole numbers only)

### **Protection Settings:**
- Lock formula columns (K, L, M, N, O)
- Allow editing of data entry columns (A-J)
- Protect with password: "MenuImport2024"

## 🔧 **Implementation Notes:**

### **For Excel Creation (VBA/Office.js):**
```vba
' Create dropdown lists
With ActiveSheet.Range("C2:C1000").Validation
    .Delete
    .Add Type:=xlValidateList, Formula1:="=Categorías!$A$2:$A$100"
    .ErrorStyle = xlVAlertStop
    .ErrorMessage = "Selecciona una categoría válida"
End With
```

### **For Web Implementation (SheetJS):**
```javascript
// Create workbook with validation
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(productData);

// Add data validation
ws['!dataValidation'] = {
  'C2:C1000': {
    type: 'list',
    formula1: 'Categorías!$A$2:$A$100'
  }
};
```

This specification provides everything needed to create a professional, user-friendly Excel template that will make menu imports smooth and error-free for restaurant staff! 📊✨