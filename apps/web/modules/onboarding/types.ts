export const generateTempId = (): string =>
  `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

export type CityKey = "bucaramanga" | "bogota"

export interface TemplateZoneDraft {
  zoneKey: string
  name: string
  coordinates: Array<{ lat: number; lng: number }>
  deliveryFee: number | null
  minimumOrder: number | null
  estimatedDeliveryTime: string
  restaurantLocationId: string
  isActive: boolean
  selected: boolean
}

export interface ExtractedCategory {
  tempId: string
  name: string
}

export interface ExtractedSubcategory {
  tempId: string
  name: string
  categoryTempId: string
}

export interface ExtractedSize {
  tempId: string
  name: string
}

export interface ExtractedProduct {
  tempId: string
  name: string
  description: string
  price: number
  categoryTempId: string
  subcategoryTempId?: string
  sizeTempId?: string
  // New fields for product configuration
  standAlone: boolean // Can be ordered alone
  combinableHalf: boolean // Can be combined as half (e.g., half pizza)
  combinableWithCategoryTempIds?: string[] // Categories this product can be combined with
  instructions?: string // Special instructions for preparation
}

export interface MenuImportState {
  phase: "upload" | "extracting" | "review"
  extractionJobId?: string // Convex ID of menuExtractionJobs record
  categories: ExtractedCategory[]
  subcategories: ExtractedSubcategory[]
  sizes: ExtractedSize[]
  products: ExtractedProduct[]
  uploadedFiles: Array<{
    name: string
    size: number
    type: string
    storageId: string
  }>
  // Legacy fields kept for backward compatibility with step components (removed in Task 5)
  isExtracting: boolean
  extractionError?: string
  currentSubStep?: number
}

export const INITIAL_MENU_IMPORT_STATE: MenuImportState = {
  phase: "upload",
  extractionJobId: undefined,
  categories: [],
  subcategories: [],
  sizes: [],
  products: [],
  uploadedFiles: [],
  isExtracting: false,
  extractionError: undefined,
  currentSubStep: 1,
}

export type ExtractionType =
  | "categories"
  | "subcategories"
  | "sizes"
  | "products"

export interface ExtractionContext {
  categories?: string[]
  subcategories?: Array<{ name: string; category: string }>
  sizes?: string[]
}

export interface CategoriesExtractionResult {
  categories: Array<{ name: string }>
}

export interface SubcategoriesExtractionResult {
  subcategories: Array<{ name: string; category: string }>
}

export interface SizesExtractionResult {
  sizes: Array<{ name: string }>
}

export interface ProductsExtractionResult {
  products: Array<{
    name: string
    description: string
    category: string
    subcategory: string | null
    size: string | null
    price: number
    standAlone: boolean
    combinableHalf: boolean
    combinableWithCategories?: string[]
    instructions?: string
  }>
}

export type ExtractionResult =
  | CategoriesExtractionResult
  | SubcategoriesExtractionResult
  | SizesExtractionResult
  | ProductsExtractionResult

export interface MenuImportWizardProps {
  organizationId: string
  onComplete: () => void
  onSkip: () => void
}

export interface MenuStepProps {
  onNext: () => void
  onBack: () => void
  isFirst: boolean
  isLast: boolean
}

export interface ImportSummary {
  categoriesCount: number
  subcategoriesCount: number
  sizesCount: number
  productsCount: number
  categoryBreakdown: Array<{
    name: string
    subcategoriesCount: number
    productsCount: number
  }>
}

export interface ExtractedOptionData {
  tempId: string
  productName: string
  upcharge: number
  isDefault: boolean
}

export interface ExtractedSlotData {
  tempId: string
  name: string
  minSelections: number
  maxSelections: number
  options: ExtractedOptionData[]
}

export interface ExtractedComboData {
  tempId: string
  name: string
  description: string
  basePrice: number
  slots: ExtractedSlotData[]
}

export interface ProductMatch {
  menuProductId: string
  name: string
  price: number
  confidence: number
}

export interface ComboImportState {
  phase: "idle" | "upload" | "extracting" | "review"
  extractionJobId?: string
  extractedCombos: ExtractedComboData[]
  createdComboIds: string[]
}

export const INITIAL_COMBO_IMPORT_STATE: ComboImportState = {
  phase: "idle",
  extractionJobId: undefined,
  extractedCombos: [],
  createdComboIds: [],
}

export const calculateImportSummary = (
  state: MenuImportState
): ImportSummary => {
  const categoryBreakdown = state.categories.map((cat) => ({
    name: cat.name,
    subcategoriesCount: state.subcategories.filter(
      (sub) => sub.categoryTempId === cat.tempId
    ).length,
    productsCount: state.products.filter(
      (prod) => prod.categoryTempId === cat.tempId
    ).length,
  }))

  return {
    categoriesCount: state.categories.length,
    subcategoriesCount: state.subcategories.length,
    sizesCount: state.sizes.length,
    productsCount: state.products.length,
    categoryBreakdown,
  }
}
