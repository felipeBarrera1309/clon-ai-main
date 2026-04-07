# Design: Multi-Step Menu Import Wizard

## Context

The onboarding Step 1 (Menu Upload) requires importing menu data into the database. The current implementation uses a flat product structure that doesn't map to the actual database schema which requires:

1. **menuProductCategories** - Categories (e.g., "Pizzas", "Bebidas")
2. **menuProductSubcategories** - Subcategories linked to categories (optional)
3. **sizes** - Size options (e.g., "Personal", "Grande")
4. **menuProducts** - Actual products with foreign keys to above tables
5. **menuProductAvailability** - Per-location product availability

This design document details a multi-step wizard approach for the menu import that respects these database relationships.

## Goals

- Enable restaurant owners to import their full menu through guided steps
- Support both document upload (LLM extraction) and manual entry
- Create proper relational data (not flat strings)
- Provide editable review tables at each step
- Batch-insert data in correct dependency order on final confirmation

## Non-Goals

- Real-time menu availability management (done in dashboard post-onboarding)
- Complex product combinations (standAlone, combinableHalf) - simplified for onboarding
- Product images - can be added later in dashboard
- Location-specific availability - all products available at all locations initially

## Decisions

### Decision: Multi-Step Sub-Wizard Within Step 1

**What**: Break the menu import into 4-5 sequential sub-steps within the onboarding Step 1.

**Why**: 
- Database schema requires entities in dependency order
- LLM extraction is more accurate with focused prompts
- Users can review/correct smaller data sets
- Errors are caught early (wrong category name won't propagate to 50 products)

**Alternatives considered**:
- Single table with all columns: Complex UI, LLM struggles with context
- Import everything then resolve: Brittle, hard to fix cascading errors

### Decision: Use Google Gemini for Document Analysis

**What**: Use `@google/generative-ai` with Gemini 2.0 Flash for multimodal document understanding.

**Why**:
- Already available in the project (used elsewhere)
- Superior multimodal capabilities for PDFs and images
- Better contextual understanding than pure OCR
- Can provide structured JSON output with schemas
- Cost-effective for this use case

**Alternatives considered**:
- OpenAI Vision: Higher cost, similar capabilities
- Dedicated OCR (Tesseract, AWS Textract): Lower accuracy, no semantic understanding
- Claude Vision: Not available in current setup

### Decision: Store Extracted Data in React State Until Final Confirmation

**What**: Keep all extracted data (categories, subcategories, sizes, products) in React state during the wizard, only persist to database on final "Import" action.

**Why**:
- User can go back and modify any step
- No orphaned database records if user abandons
- Single transaction for data integrity
- Simpler error handling

**Alternatives considered**:
- Save each step immediately: Requires cleanup on abandonment, complex rollback

### Decision: Category/Subcategory/Size Dropdowns for Products

**What**: In the products table, category/subcategory/size columns are dropdowns populated from previous steps.

**Why**:
- Ensures referential integrity
- Prevents typos creating duplicate categories
- LLM output is constrained to valid options
- Better UX than free-text matching

## Technical Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MENU IMPORT WIZARD                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │  Sub-Step 1  │───►│  Sub-Step 2  │───►│  Sub-Step 3  │              │
│  │  Categories  │    │ Subcategories│    │    Sizes     │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│         │                   │                   │                       │
│         ▼                   ▼                   ▼                       │
│  ┌─────────────────────────────────────────────────────┐               │
│  │              React State (menuImportAtom)            │               │
│  │  {                                                   │               │
│  │    categories: [...],                                │               │
│  │    subcategories: [...],                             │               │
│  │    sizes: [...],                                     │               │
│  │    products: [...]                                   │               │
│  │  }                                                   │               │
│  └─────────────────────────────────────────────────────┘               │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────┐    ┌──────────────┐                                  │
│  │  Sub-Step 4  │───►│  Sub-Step 5  │                                  │
│  │   Products   │    │Review/Import │                                  │
│  └──────────────┘    └──────────────┘                                  │
│                              │                                          │
│                              ▼                                          │
│                    ┌─────────────────┐                                  │
│                    │  Convex Mutation │                                  │
│                    │  importMenuData  │                                  │
│                    └─────────────────┘                                  │
│                              │                                          │
│                              ▼                                          │
│         ┌────────────────────┼────────────────────┐                    │
│         ▼                    ▼                    ▼                    │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐             │
│  │ Categories  │────►│Subcategories│────►│   Sizes     │             │
│  │   Table     │     │   Table     │     │   Table     │             │
│  └─────────────┘     └─────────────┘     └─────────────┘             │
│                              │                                          │
│                              ▼                                          │
│                    ┌─────────────────┐                                  │
│                    │    Products     │                                  │
│                    │     Table       │                                  │
│                    └─────────────────┘                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### State Schema

```typescript
// apps/web/modules/onboarding/types.ts

export interface ExtractedCategory {
  tempId: string; // Client-side temporary ID
  name: string;
}

export interface ExtractedSubcategory {
  tempId: string;
  name: string;
  categoryTempId: string; // References ExtractedCategory.tempId
}

export interface ExtractedSize {
  tempId: string;
  name: string;
}

export interface ExtractedProduct {
  tempId: string;
  name: string;
  description: string;
  price: number;
  categoryTempId: string;      // References ExtractedCategory.tempId
  subcategoryTempId?: string;  // References ExtractedSubcategory.tempId
  sizeTempId?: string;         // References ExtractedSize.tempId
}

export interface MenuImportState {
  currentSubStep: 1 | 2 | 3 | 4 | 5;
  categories: ExtractedCategory[];
  subcategories: ExtractedSubcategory[];
  sizes: ExtractedSize[];
  products: ExtractedProduct[];
  // Track uploaded files for re-processing
  uploadedFiles: File[];
}
```

### Jotai Atom

```typescript
// apps/web/modules/onboarding/atoms.ts

import { atom } from "jotai";
import type { MenuImportState } from "./types";

export const menuImportAtom = atom<MenuImportState>({
  currentSubStep: 1,
  categories: [],
  subcategories: [],
  sizes: [],
  products: [],
  uploadedFiles: [],
});
```

### LLM Prompts

#### Categories Extraction Prompt

```typescript
const CATEGORIES_EXTRACTION_PROMPT = `
Eres un asistente experto en análisis de menús de restaurantes.
Analiza el documento del menú y extrae ÚNICAMENTE las CATEGORÍAS principales.

EJEMPLOS de categorías válidas:
- "Pizzas"
- "Hamburguesas"
- "Bebidas"
- "Postres"
- "Entradas"
- "Combos"
- "Adicionales"

REGLAS:
1. Solo extraer categorías de PRIMER NIVEL (no subcategorías)
2. Ignorar nombres de productos individuales
3. Usar nombres en español con formato Título (primera letra mayúscula)
4. No duplicar categorías
5. Máximo 15 categorías

Responde ÚNICAMENTE con JSON válido:
{
  "categories": [
    { "name": "Nombre Categoría" }
  ]
}
`;
```

#### Subcategories Extraction Prompt

```typescript
const SUBCATEGORIES_EXTRACTION_PROMPT = (categories: string[]) => `
Eres un asistente experto en análisis de menús de restaurantes.
Analiza el documento y extrae las SUBCATEGORÍAS para cada categoría.

CATEGORÍAS DISPONIBLES (usa EXACTAMENTE estos nombres):
${categories.map(c => `- "${c}"`).join('\n')}

EJEMPLOS de subcategorías:
- Para "Pizzas": "Clásicas", "Especiales", "Premium"
- Para "Hamburguesas": "Sencillas", "Dobles", "Vegetarianas"
- Para "Bebidas": "Gaseosas", "Jugos Naturales", "Cervezas"

REGLAS:
1. Solo incluir subcategorías que aparezcan claramente en el menú
2. El campo "category" DEBE coincidir exactamente con una categoría disponible
3. Si no hay subcategorías claras para una categoría, no inventarlas
4. Usar nombres en español con formato Título

Responde ÚNICAMENTE con JSON válido:
{
  "subcategories": [
    { "name": "Nombre Subcategoría", "category": "Nombre Categoría Exacto" }
  ]
}
`;
```

#### Sizes Extraction Prompt

```typescript
const SIZES_EXTRACTION_PROMPT = `
Eres un asistente experto en análisis de menús de restaurantes.
Analiza el documento y extrae los TAMAÑOS de productos disponibles.

EJEMPLOS de tamaños comunes:
- "Personal", "Mediana", "Grande", "Familiar"
- "Pequeña", "Regular", "Grande"
- "250ml", "500ml", "1L", "1.5L"
- "Sencilla", "Doble", "Triple"
- "8 porciones", "12 porciones", "16 porciones"

REGLAS:
1. Solo extraer tamaños que aparezcan en el menú
2. Normalizar variaciones (ej: "Med" → "Mediana")
3. No duplicar tamaños
4. Ordenar de menor a mayor si es posible

Responde ÚNICAMENTE con JSON válido:
{
  "sizes": [
    { "name": "Nombre Tamaño" }
  ]
}
`;
```

#### Products Extraction Prompt

```typescript
const PRODUCTS_EXTRACTION_PROMPT = (
  categories: string[],
  subcategories: { name: string; category: string }[],
  sizes: string[]
) => `
Eres un asistente experto en análisis de menús de restaurantes.
Extrae TODOS los productos del menú con sus detalles.

CATEGORÍAS DISPONIBLES (usa EXACTAMENTE estos nombres):
${categories.map(c => `- "${c}"`).join('\n')}

SUBCATEGORÍAS DISPONIBLES:
${subcategories.length > 0 
  ? subcategories.map(s => `- "${s.name}" (en categoría "${s.category}")`).join('\n')
  : '(No hay subcategorías definidas)'}

TAMAÑOS DISPONIBLES:
${sizes.length > 0 
  ? sizes.map(s => `- "${s}"`).join('\n')
  : '(No hay tamaños definidos - dejar size como null)'}

REGLAS:
1. "category" DEBE coincidir EXACTAMENTE con una categoría disponible
2. "subcategory" debe coincidir con una subcategoría de ESA categoría, o ser null
3. "size" debe coincidir con un tamaño disponible, o ser null
4. "price" en pesos colombianos (número entero, sin formato)
5. "description" breve, máximo 100 caracteres
6. Si un producto tiene múltiples tamaños con diferentes precios, crear UNA entrada por tamaño

EJEMPLO de producto con tamaños:
- "Pizza Margherita Personal" → category: "Pizzas", size: "Personal", price: 25000
- "Pizza Margherita Grande" → category: "Pizzas", size: "Grande", price: 38000

Responde ÚNICAMENTE con JSON válido:
{
  "products": [
    {
      "name": "Nombre del Producto",
      "description": "Descripción breve",
      "category": "Categoría Exacta",
      "subcategory": "Subcategoría Exacta o null",
      "size": "Tamaño Exacto o null",
      "price": 25000
    }
  ]
}
`;
```

### Backend Mutation

```typescript
// packages/backend/convex/private/onboarding.ts

export const importMenuData = mutation({
  args: {
    organizationId: v.string(),
    categories: v.array(v.object({
      tempId: v.string(),
      name: v.string(),
    })),
    subcategories: v.array(v.object({
      tempId: v.string(),
      name: v.string(),
      categoryTempId: v.string(),
    })),
    sizes: v.array(v.object({
      tempId: v.string(),
      name: v.string(),
    })),
    products: v.array(v.object({
      tempId: v.string(),
      name: v.string(),
      description: v.string(),
      price: v.number(),
      categoryTempId: v.string(),
      subcategoryTempId: v.optional(v.string()),
      sizeTempId: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    // 1. Create categories and build tempId → realId map
    const categoryIdMap = new Map<string, Id<"menuProductCategories">>();
    for (const cat of args.categories) {
      const id = await ctx.db.insert("menuProductCategories", {
        name: cat.name,
        organizationId: args.organizationId,
      });
      categoryIdMap.set(cat.tempId, id);
    }

    // 2. Create subcategories with real category IDs
    const subcategoryIdMap = new Map<string, Id<"menuProductSubcategories">>();
    for (const sub of args.subcategories) {
      const categoryId = categoryIdMap.get(sub.categoryTempId);
      if (!categoryId) continue;
      
      const id = await ctx.db.insert("menuProductSubcategories", {
        name: sub.name,
        organizationId: args.organizationId,
        menuProductCategoryId: categoryId,
      });
      subcategoryIdMap.set(sub.tempId, id);
    }

    // 3. Create sizes
    const sizeIdMap = new Map<string, Id<"sizes">>();
    for (const size of args.sizes) {
      const id = await ctx.db.insert("sizes", {
        name: size.name,
        organizationId: args.organizationId,
      });
      sizeIdMap.set(size.tempId, id);
    }

    // 4. Create products with all foreign keys resolved
    const productIds: Id<"menuProducts">[] = [];
    for (const prod of args.products) {
      const categoryId = categoryIdMap.get(prod.categoryTempId);
      if (!categoryId) continue;

      const subcategoryId = prod.subcategoryTempId 
        ? subcategoryIdMap.get(prod.subcategoryTempId) 
        : undefined;
      const sizeId = prod.sizeTempId 
        ? sizeIdMap.get(prod.sizeTempId) 
        : undefined;

      const id = await ctx.db.insert("menuProducts", {
        name: prod.name,
        nameNormalized: normalizeProductName(prod.name),
        description: prod.description,
        price: prod.price,
        menuProductCategoryId: categoryId,
        menuProductSubcategoryId: subcategoryId,
        sizeId: sizeId,
        standAlone: true, // Default for onboarding
        combinableHalf: false, // Default for onboarding
        organizationId: args.organizationId,
      });
      productIds.push(id);
    }

    // 5. Update onboarding progress
    const progress = await ctx.db
      .query("onboardingProgress")
      .withIndex("by_organization_id", q => q.eq("organizationId", args.organizationId))
      .first();

    if (progress) {
      await ctx.db.patch(progress._id, {
        currentStep: 2,
        step1Completed: true,
        menuProductsCount: productIds.length,
      });
    }

    return {
      categoriesCreated: categoryIdMap.size,
      subcategoriesCreated: subcategoryIdMap.size,
      sizesCreated: sizeIdMap.size,
      productsCreated: productIds.length,
    };
  },
});
```

### Convex Action for LLM Processing

```typescript
// packages/backend/convex/private/onboarding.ts

import { GoogleGenerativeAI } from "@google/generative-ai";

export const extractMenuFromDocument = action({
  args: {
    fileBase64: v.string(),
    mimeType: v.string(),
    extractionType: v.union(
      v.literal("categories"),
      v.literal("subcategories"),
      v.literal("sizes"),
      v.literal("products")
    ),
    context: v.optional(v.object({
      categories: v.optional(v.array(v.string())),
      subcategories: v.optional(v.array(v.object({
        name: v.string(),
        category: v.string(),
      }))),
      sizes: v.optional(v.array(v.string())),
    })),
  },
  handler: async (ctx, args) => {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Build prompt based on extraction type
    let prompt: string;
    switch (args.extractionType) {
      case "categories":
        prompt = CATEGORIES_EXTRACTION_PROMPT;
        break;
      case "subcategories":
        prompt = SUBCATEGORIES_EXTRACTION_PROMPT(args.context?.categories || []);
        break;
      case "sizes":
        prompt = SIZES_EXTRACTION_PROMPT;
        break;
      case "products":
        prompt = PRODUCTS_EXTRACTION_PROMPT(
          args.context?.categories || [],
          args.context?.subcategories || [],
          args.context?.sizes || []
        );
        break;
    }

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: args.mimeType,
          data: args.fileBase64,
        },
      },
    ]);

    const responseText = result.response.text();
    
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || 
                      responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from LLM response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonStr);
  },
});
```

## Component Structure

```
apps/web/modules/onboarding/ui/
├── views/
│   └── menu-upload-view.tsx           # Main orchestrator (existing, to be refactored)
├── components/
│   └── menu-import/
│       ├── menu-import-wizard.tsx     # Sub-step navigation
│       ├── step-categories.tsx        # Sub-step 1: Categories
│       ├── step-subcategories.tsx     # Sub-step 2: Subcategories
│       ├── step-sizes.tsx             # Sub-step 3: Sizes
│       ├── step-products.tsx          # Sub-step 4: Products
│       ├── step-review.tsx            # Sub-step 5: Review & Import
│       ├── document-upload.tsx        # Reusable file upload component
│       ├── editable-table.tsx         # Generic editable table
│       └── extraction-loading.tsx     # Loading state during LLM processing
```

## UI/UX Flow

### Sub-Step 1: Categories

```
┌──────────────────────────────────────────────────────────────────────┐
│  Paso 1.1: Categorías del Menú                                       │
│  ─────────────────────────────                                       │
│                                                                      │
│  Las categorías organizan tu menú (ej: Pizzas, Bebidas, Postres)    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  📄 Sube tu menú para extraer categorías automáticamente        ││
│  │     [Seleccionar archivo]                                       ││
│  │                                                                 ││
│  │  ─── o ───                                                      ││
│  │                                                                 ││
│  │  ✏️ Agregar categorías manualmente                              ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Categorías extraídas:                                               │
│  ┌────────────────────────────────────────────┬─────────┐          │
│  │ Nombre                                      │ Acciones │          │
│  ├────────────────────────────────────────────┼─────────┤          │
│  │ [Pizzas                              ]     │   🗑️    │          │
│  │ [Bebidas                             ]     │   🗑️    │          │
│  │ [Entradas                            ]     │   🗑️    │          │
│  ├────────────────────────────────────────────┴─────────┤          │
│  │ [+ Agregar categoría]                                │          │
│  └──────────────────────────────────────────────────────┘          │
│                                                                      │
│  ℹ️ Consejo: Puedes editar los nombres haciendo clic en ellos       │
│                                                                      │
│                           [Omitir] [Siguiente: Subcategorías →]     │
└──────────────────────────────────────────────────────────────────────┘
```

### Sub-Step 4: Products (Most Complex)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Paso 1.4: Productos                                                 │
│  ───────────────────                                                 │
│                                                                      │
│  Extrae los productos de tu menú con precios y descripciones.       │
│                                                                      │
│  [📄 Extraer de documento] [+ Agregar producto manualmente]         │
│                                                                      │
│  Productos (24):                                                     │
│  ┌────────────┬────────────┬──────────┬───────────┬──────┬─────────┐│
│  │ Nombre     │ Descripción│ Categoría│Subcategoría│Tamaño│ Precio  ││
│  ├────────────┼────────────┼──────────┼───────────┼──────┼─────────┤│
│  │[Margherita]│[Tomate,moz]│[Pizzas ▼]│[Clásicas▼]│[ - ▼]│[$25.000]││
│  │[Pepperoni ]│[Salami pic]│[Pizzas ▼]│[Especial▼]│[ - ▼]│[$28.000]││
│  │[Coca Cola ]│[Gaseosa 1L]│[Bebidas▼]│[ - ▼     ]│[1.5L▼]│[$8.000 ]││
│  │[Pan de Ajo]│[Con mante ]│[Entrada▼]│[ - ▼     ]│[ - ▼]│[$12.000]││
│  └────────────┴────────────┴──────────┴───────────┴──────┴─────────┘│
│                                                                      │
│  ⚠️ Los campos Categoría, Subcategoría y Tamaño usan las opciones   │
│     definidas en los pasos anteriores.                               │
│                                                                      │
│                    [← Anterior] [Siguiente: Revisar →]              │
└──────────────────────────────────────────────────────────────────────┘
```

### Sub-Step 5: Review & Import

```
┌──────────────────────────────────────────────────────────────────────┐
│  Paso 1.5: Revisar e Importar                                        │
│  ────────────────────────────                                        │
│                                                                      │
│  Revisa el resumen antes de importar tu menú:                        │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  📁 Categorías: 4                                               ││
│  │     Pizzas, Bebidas, Entradas, Postres                          ││
│  │                                                                 ││
│  │  📂 Subcategorías: 6                                            ││
│  │     Clásicas, Especiales (Pizzas), Gaseosas, Jugos (Bebidas)... ││
│  │                                                                 ││
│  │  📏 Tamaños: 4                                                  ││
│  │     Personal, Mediana, Grande, Familiar                         ││
│  │                                                                 ││
│  │  🍕 Productos: 24                                               ││
│  │     Ver lista completa ▼                                        ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  ✅ Todo listo para importar                                    ││
│  │                                                                 ││
│  │  Los productos estarán disponibles en todas tus sucursales.     ││
│  │  Podrás ajustar la disponibilidad por ubicación en el dashboard.││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│                    [← Anterior] [Importar Menú →]                   │
│                                                                      │
│  [Omitir paso del menú]                                              │
└──────────────────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

### Risk: LLM Extraction Inaccuracy

**Mitigation**:
- All extracted data is editable by user
- Provide clear examples in prompts
- Show confidence indicators (future enhancement)
- Allow manual entry as fallback

### Risk: Large Menus (100+ products)

**Mitigation**:
- Paginated product table
- Batch processing in mutation
- Consider chunking LLM requests for very large documents

### Risk: Complex Product Structures Not Captured

**Trade-off**: Onboarding creates simplified products (all `standAlone: true`, no `combinableWith`). Complex configurations (half-pizzas, combos) are done in dashboard post-onboarding.

**Rationale**: Keep onboarding simple; advanced features for power users in dashboard.

### Risk: User Abandonment Mid-Wizard

**Mitigation**:
- State persisted in Jotai (survives page refresh with atomWithStorage)
- No database writes until final confirmation
- Clear progress indicator

## Migration Plan

N/A - This is a new feature within the onboarding system.

## Open Questions

1. **Should we support multiple document uploads per step?**
   - Current design: Single document per step
   - Alternative: Allow multiple files, combine extractions

2. **How to handle duplicate names?**
   - Categories: Warn user, require unique names
   - Products: Allow duplicates (e.g., same product in different sizes)

3. **Should we offer predefined category templates?**
   - "Pizza Restaurant", "Burger Joint", "Coffee Shop" templates
   - Could speed up onboarding for common restaurant types

4. **PDF page limit for Gemini?**
   - Test with large menus (20+ pages)
   - May need to split processing by page
