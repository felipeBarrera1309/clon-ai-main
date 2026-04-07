"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Doc, Id } from "@workspace/backend/_generated/dataModel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import type { Column } from "@workspace/ui/components/data-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { SmartHorizontalScrollArea } from "@workspace/ui/components/smart-horizontal-scroll-area"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import {
  CheckCircleIcon,
  ChevronDownIcon,
  DownloadIcon,
  EditIcon,
  FileTextIcon,
  FolderIcon,
  HelpCircleIcon,
  ImageIcon,
  PackageIcon,
  PlusIcon,
  ScaleIcon,
  TrashIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"

import { formatPrice } from "../../../../lib/currency"
import { DASHBOARD_VIEWS } from "../../constants"
import { BulkAvailabilityDialog } from "../components/bulk-availability-dialog"
import { DeleteProductDialog } from "../components/delete-product-dialog"
import { FullMenuAvailabilitySheet } from "../components/full-menu-availability-sheet"

import { MenuImportDialog } from "../components/menu-import-dialog"
import { MenuProductBuilderForm } from "../components/menu-product-builder-form"
import { ProductAvailabilitySheet } from "../components/product-availability-sheet"

type ProductFromList = {
  _id: Id<"menuProducts">
  _creationTime: number
  name: string
  description: string
  price: number
  menuProductCategoryId: Id<"menuProductCategories">
  menuProductSubcategoryId?: Id<"menuProductSubcategories">
  standAlone: boolean
  combinableWith?: Array<{
    menuProductCategoryId: Id<"menuProductCategories">
    sizeId?: Id<"sizes">
    categoryName: string
    sizeName: string | null
  }>
  sizeId?: Id<"sizes">
  combinableHalf: boolean
  minimumQuantity?: number
  maximumQuantity?: number
  imageUrl?: string
  externalCode?: string
  instructions?: string
  componentsId?: Id<"menuProducts">[]
  organizationId: string
  categoryName: string
  subcategoryName?: string
  sizeName: string | null
  availability: Record<string, boolean>
}

export const MenuView = () => {
  const { activeOrganizationId } = useOrganization()

  // View mode state for each tab
  const [categoriesViewMode, setCategoriesViewMode] = useState<
    "table" | "cards"
  >("table")
  const [subcategoriesViewMode, setSubcategoriesViewMode] = useState<
    "table" | "cards"
  >("table")
  const [productsViewMode, setProductsViewMode] = useState<"table" | "cards">(
    "table"
  )
  const [sizesViewMode, setSizesViewMode] = useState<"table" | "cards">("table")

  const isMobile = useIsMobile()

  // Auto-switch to cards on mobile
  useEffect(() => {
    if (isMobile) {
      setCategoriesViewMode("cards")
      setSubcategoriesViewMode("cards")
      setProductsViewMode("cards")
      setSizesViewMode("cards")
    } else {
      setCategoriesViewMode("table")
      setSubcategoriesViewMode("table")
      setProductsViewMode("table")
      setSizesViewMode("table")
    }
  }, [isMobile])

  // Product management state
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>("all")

  // Search state
  const {
    value: searchValue,
    debouncedValue: searchQuery,
    setValue: setSearchValue,
    clearSearch,
    isSearching,
  } = useDebouncedSearch("", 300)
  const [showCreateProductDialog, setShowCreateProductDialog] = useState(false)
  const [showEditProductDialog, setShowEditProductDialog] = useState(false)
  const [showDeleteProductDialog, setShowDeleteProductDialog] = useState(false)
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false)
  const [showBulkAvailabilityDialog, setShowBulkAvailabilityDialog] =
    useState(false)
  const [showProductAvailabilitySheet, setShowProductAvailabilitySheet] =
    useState(false)
  const [showFullMenuAvailabilitySheet, setShowFullMenuAvailabilitySheet] =
    useState(false)

  // Full menu availability sheet state
  const [fullMenuSearchValue, setFullMenuSearchValue] = useState("")
  const [fullMenuCategoryFilter, setFullMenuCategoryFilter] =
    useState<string>("all")
  const [fullMenuSubcategoryFilter, setFullMenuSubcategoryFilter] =
    useState<string>("all")
  const [fullMenuSelectedProducts, setFullMenuSelectedProducts] = useState<
    Set<string>
  >(new Set())
  const [selectedProductForAvailability, setSelectedProductForAvailability] =
    useState<
      | (Omit<Doc<"menuProducts">, "nameNormalized"> & {
          availability: Record<string, boolean>
        })
      | null
    >(null)
  const [editingProduct, setEditingProduct] = useState<Omit<
    Doc<"menuProducts">,
    "nameNormalized"
  > | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<Omit<
    Doc<"menuProducts">,
    "nameNormalized"
  > | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set()
  )
  const [isDeletingProduct, setIsDeletingProduct] = useState(false)
  const [isBatchDeleting, setIsBatchDeleting] = useState(false)

  // Bulk operations state
  const [bulkSelectedProducts, setBulkSelectedProducts] = useState<
    Id<"menuProducts">[]
  >([])
  const [batchDeleteSelectedProducts, setBatchDeleteSelectedProducts] =
    useState<Set<string>>(new Set())

  // Availability toggle state
  const [togglingAvailability, setTogglingAvailability] = useState<
    Map<string, boolean>
  >(new Map())

  // Availability overrides for immediate UI updates
  const [availabilityOverrides, setAvailabilityOverrides] = useState<
    Map<string, boolean>
  >(new Map())

  // Category management state
  const [showCreateCategoryDialog, setShowCreateCategoryDialog] =
    useState(false)
  const [showEditCategoryDialog, setShowEditCategoryDialog] = useState(false)
  const [showDeleteCategoryDialog, setShowDeleteCategoryDialog] =
    useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [editCategoryName, setEditCategoryName] = useState("")
  const [editingCategory, setEditingCategory] =
    useState<Doc<"menuProductCategories"> | null>(null)
  const [deletingCategory, setDeletingCategory] =
    useState<Doc<"menuProductCategories"> | null>(null)
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [isEditingCategory, setIsEditingCategory] = useState(false)
  const [isDeletingCategory, setIsDeletingCategory] = useState(false)

  // Subcategory management state
  const [showCreateSubcategoryDialog, setShowCreateSubcategoryDialog] =
    useState(false)
  const [showEditSubcategoryDialog, setShowEditSubcategoryDialog] =
    useState(false)
  const [showDeleteSubcategoryDialog, setShowDeleteSubcategoryDialog] =
    useState(false)
  const [newSubcategoryName, setNewSubcategoryName] = useState("")
  const [newSubcategoryCategoryId, setNewSubcategoryCategoryId] = useState("")
  const [editSubcategoryName, setEditSubcategoryName] = useState("")
  const [editSubcategoryCategoryId, setEditSubcategoryCategoryId] = useState("")
  const [editingSubcategory, setEditingSubcategory] =
    useState<Doc<"menuProductSubcategories"> | null>(null)
  const [deletingSubcategory, setDeletingSubcategory] =
    useState<Doc<"menuProductSubcategories"> | null>(null)
  const [isCreatingSubcategory, setIsCreatingSubcategory] = useState(false)
  const [isEditingSubcategory, setIsEditingSubcategory] = useState(false)
  const [isDeletingSubcategory, setIsDeletingSubcategory] = useState(false)

  // Size management state
  const [showCreateSizeDialog, setShowCreateSizeDialog] = useState(false)
  const [showEditSizeDialog, setShowEditSizeDialog] = useState(false)
  const [showDeleteSizeDialog, setShowDeleteSizeDialog] = useState(false)
  const [newSizeName, setNewSizeName] = useState("")
  const [editSizeName, setEditSizeName] = useState("")
  const [editingSize, setEditingSize] = useState<Doc<"sizes"> | null>(null)
  const [deletingSize, setDeletingSize] = useState<Doc<"sizes"> | null>(null)
  const [isCreatingSize, setIsCreatingSize] = useState(false)
  const [isEditingSize, setIsEditingSize] = useState(false)
  const [isDeletingSize, setIsDeletingSize] = useState(false)

  // Import state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)

  // Export state
  const [exportTrigger, setExportTrigger] = useState<string | undefined>(
    undefined
  )
  const [isExporting, setIsExporting] = useState(false)

  // Pagination state for DataViewerLayout
  const [categoriesPageSize, setCategoriesPageSize] = useState(10)
  const [categoriesCursor, setCategoriesCursor] = useState<string | null>(null)
  const [categoriesPrevCursors, setCategoriesPrevCursors] = useState<string[]>(
    []
  )

  const [subcategoriesPageSize, setSubcategoriesPageSize] = useState(10)
  const [subcategoriesCursor, setSubcategoriesCursor] = useState<string | null>(
    null
  )
  const [subcategoriesPrevCursors, setSubcategoriesPrevCursors] = useState<
    string[]
  >([])

  const [productsPageSize, setProductsPageSize] = useState(10)
  const [productsCursor, setProductsCursor] = useState<string | null>(null)
  const [productsPrevCursors, setProductsPrevCursors] = useState<string[]>([])

  const [sizesPageSize, setSizesPageSize] = useState(10)
  const [sizesCursor, setSizesCursor] = useState<string | null>(null)
  const [sizesPrevCursors, setSizesPrevCursors] = useState<string[]>([])

  // Get data with pagination
  const categories = useQuery(
    api.private.menuProductCategories.listWithCounts,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: {
            numItems: categoriesPageSize,
            cursor: categoriesCursor,
          },
        }
      : "skip"
  )
  const subcategories = useQuery(
    api.private.menuProductSubcategories.listWithCounts,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: {
            numItems: subcategoriesPageSize,
            cursor: subcategoriesCursor,
          },
        }
      : "skip"
  )

  // Get all categories and subcategories for filters
  const allCategories = useQuery(
    api.private.menuProductCategories.listAll,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const allSubcategories = useQuery(
    api.private.menuProductSubcategories.listAll,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const products = useQuery(
    api.private.menuProducts.list,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: {
            numItems: productsPageSize,
            cursor: productsCursor,
          },
          searchQuery: searchQuery.trim() || undefined,
          categoryId:
            categoryFilter !== "all"
              ? (categoryFilter as Id<"menuProductCategories">)
              : undefined,
          subcategoryId:
            subcategoryFilter !== "all"
              ? (subcategoryFilter as Id<"menuProductSubcategories">)
              : undefined,
        }
      : "skip"
  )
  const locations = useQuery(
    api.private.restaurantLocations.list,
    activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
  )
  const sizes = useQuery(
    api.private.sizes.listWithCounts,
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          paginationOpts: { numItems: sizesPageSize, cursor: sizesCursor },
        }
      : "skip"
  )

  // Export query
  const exportData = useQuery(
    api.private.menuProducts.exportMenuToXlsx,
    activeOrganizationId
      ? { organizationId: activeOrganizationId, trigger: exportTrigger }
      : "skip"
  )

  // Products from query already include resolved fields
  const transformedProducts: ProductFromList[] =
    (products?.page as ProductFromList[]) || []

  // Products are now filtered by backend, no client-side filtering needed
  const filteredProducts = useMemo(() => {
    return transformedProducts
  }, [transformedProducts])

  // Selection state for table header checkbox
  const isAllSelected =
    selectedProducts.size === filteredProducts.length &&
    filteredProducts.length > 0
  const isIndeterminate =
    selectedProducts.size > 0 && selectedProducts.size < filteredProducts.length

  // Mutations
  const createCategory = useMutation(api.private.menuProductCategories.create)
  const createSubcategory = useMutation(
    api.private.menuProductSubcategories.create
  )
  const toggleAvailability = useMutation(
    api.private.menuProductAvailability.toggleAvailability
  )
  const updateCategory = useMutation(
    api.private.menuProductCategories.updateCategory
  )
  const updateSubcategory = useMutation(
    api.private.menuProductSubcategories.updateSubcategory
  )
  const deleteCategory = useMutation(
    api.private.menuProductCategories.deleteCategory
  )
  const deleteSubcategory = useMutation(
    api.private.menuProductSubcategories.deleteSubcategory
  )
  const deleteProduct = useMutation(api.private.menuProducts.deleteProduct)
  const batchDeleteProducts = useMutation(
    api.private.menuProducts.batchDeleteProducts
  )
  const createSize = useMutation(api.private.sizes.create)
  const updateSize = useMutation(api.private.sizes.updateSize)
  const deleteSize = useMutation(api.private.sizes.deleteSize)

  const ResturantsIcon = DASHBOARD_VIEWS["/restaurant-locations"].icon

  // Category management functions
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error("El nombre de la categoría no puede estar vacío")
      return
    }
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsCreatingCategory(true)
    try {
      await createCategory({
        name: newCategoryName.trim(),
        organizationId: activeOrganizationId,
      })
      setNewCategoryName("")
      setShowCreateCategoryDialog(false)
      toast.success("Categoría creada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsCreatingCategory(false)
    }
  }

  const handleStartEditCategory = (category: Doc<"menuProductCategories">) => {
    setEditingCategory(category)
    setEditCategoryName(category.name)
    setShowEditCategoryDialog(true)
  }

  const handleEditCategory = async () => {
    if (!editingCategory || !editCategoryName.trim()) {
      toast.error("El nombre de la categoría no puede estar vacío")
      return
    }

    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsEditingCategory(true)
    try {
      await updateCategory({
        id: editingCategory._id,
        name: editCategoryName.trim(),
        organizationId: activeOrganizationId,
      })
      setShowEditCategoryDialog(false)
      setEditingCategory(null)
      setEditCategoryName("")
      toast.success("Categoría actualizada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsEditingCategory(false)
    }
  }

  const handleEditCategoryDialogClose = () => {
    setShowEditCategoryDialog(false)
    setEditingCategory(null)
    setEditCategoryName("")
  }

  const handleStartDeleteCategory = (
    category: Doc<"menuProductCategories">
  ) => {
    setDeletingCategory(category)
    setShowDeleteCategoryDialog(true)
  }

  const handleConfirmDeleteCategory = async () => {
    if (!deletingCategory) return
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsDeletingCategory(true)
    try {
      await deleteCategory({
        id: deletingCategory._id as Id<"menuProductCategories">,
        organizationId: activeOrganizationId,
      })
      setShowDeleteCategoryDialog(false)
      setDeletingCategory(null)
      toast.success("Categoría eliminada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsDeletingCategory(false)
    }
  }

  const handleDeleteCategoryDialogClose = () => {
    setShowDeleteCategoryDialog(false)
    setDeletingCategory(null)
  }

  // Subcategory management functions
  const handleCreateSubcategory = async () => {
    if (!newSubcategoryName.trim()) {
      toast.error("El nombre de la subcategoría no puede estar vacío")
      return
    }
    if (!newSubcategoryCategoryId) {
      toast.error("Debe seleccionar una categoría")
      return
    }
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsCreatingSubcategory(true)
    try {
      await createSubcategory({
        name: newSubcategoryName.trim(),
        menuProductCategoryId:
          newSubcategoryCategoryId as Id<"menuProductCategories">,
        organizationId: activeOrganizationId,
      })
      setNewSubcategoryName("")
      setNewSubcategoryCategoryId("")
      setShowCreateSubcategoryDialog(false)
      toast.success("Subcategoría creada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsCreatingSubcategory(false)
    }
  }

  const handleStartEditSubcategory = (
    subcategory: Doc<"menuProductSubcategories"> & { categoryName: string }
  ) => {
    setEditingSubcategory(subcategory)
    setEditSubcategoryName(subcategory.name)
    setEditSubcategoryCategoryId(subcategory.menuProductCategoryId)
    setShowEditSubcategoryDialog(true)
  }

  const handleEditSubcategory = async () => {
    if (!editingSubcategory || !editSubcategoryName.trim()) {
      toast.error("El nombre de la subcategoría no puede estar vacío")
      return
    }
    if (!editSubcategoryCategoryId) {
      toast.error("Debe seleccionar una categoría")
      return
    }
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsEditingSubcategory(true)
    try {
      await updateSubcategory({
        id: editingSubcategory._id,
        name: editSubcategoryName.trim(),
        menuProductCategoryId:
          editSubcategoryCategoryId as Id<"menuProductCategories">,
        organizationId: activeOrganizationId,
      })
      setShowEditSubcategoryDialog(false)
      setEditingSubcategory(null)
      setEditSubcategoryName("")
      setEditSubcategoryCategoryId("")
      toast.success("Subcategoría actualizada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsEditingSubcategory(false)
    }
  }

  const handleEditSubcategoryDialogClose = () => {
    setShowEditSubcategoryDialog(false)
    setEditingSubcategory(null)
    setEditSubcategoryName("")
    setEditSubcategoryCategoryId("")
  }

  const handleStartDeleteSubcategory = (
    subcategory: Doc<"menuProductSubcategories"> & { categoryName: string }
  ) => {
    setDeletingSubcategory(subcategory)
    setShowDeleteSubcategoryDialog(true)
  }

  const handleConfirmDeleteSubcategory = async () => {
    if (!deletingSubcategory) return
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsDeletingSubcategory(true)
    try {
      await deleteSubcategory({
        id: deletingSubcategory._id as Id<"menuProductSubcategories">,
        organizationId: activeOrganizationId,
      })
      setShowDeleteSubcategoryDialog(false)
      setDeletingSubcategory(null)
      toast.success("Subcategoría eliminada exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsDeletingSubcategory(false)
    }
  }

  const handleDeleteSubcategoryDialogClose = () => {
    setShowDeleteSubcategoryDialog(false)
    setDeletingSubcategory(null)
  }

  // Size management functions
  const handleCreateSize = async () => {
    if (!newSizeName.trim()) {
      toast.error("El nombre del tamaño no puede estar vacío")
      return
    }
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsCreatingSize(true)
    try {
      await createSize({
        name: newSizeName.trim(),
        organizationId: activeOrganizationId,
      })
      setNewSizeName("")
      setShowCreateSizeDialog(false)
      toast.success("Tamaño creado exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsCreatingSize(false)
    }
  }

  const handleStartEditSize = (size: Doc<"sizes">) => {
    setEditingSize(size)
    setEditSizeName(size.name)
    setShowEditSizeDialog(true)
  }

  const handleEditSize = async () => {
    if (!editingSize || !editSizeName.trim()) {
      toast.error("El nombre del tamaño no puede estar vacío")
      return
    }
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsEditingSize(true)
    try {
      await updateSize({
        id: editingSize._id,
        name: editSizeName.trim(),
        organizationId: activeOrganizationId,
      })
      setShowEditSizeDialog(false)
      setEditingSize(null)
      setEditSizeName("")
      toast.success("Tamaño actualizado exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsEditingSize(false)
    }
  }

  const handleEditSizeDialogClose = () => {
    setShowEditSizeDialog(false)
    setEditingSize(null)
    setEditSizeName("")
  }

  const handleStartDeleteSize = (size: Doc<"sizes">) => {
    setDeletingSize(size)
    setShowDeleteSizeDialog(true)
  }

  const handleConfirmDeleteSize = async () => {
    if (!deletingSize) return
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsDeletingSize(true)
    try {
      await deleteSize({
        id: deletingSize._id as Id<"sizes">,
        organizationId: activeOrganizationId,
      })
      setShowDeleteSizeDialog(false)
      setDeletingSize(null)
      toast.success("Tamaño eliminado exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsDeletingSize(false)
    }
  }

  const handleDeleteSizeDialogClose = () => {
    setShowDeleteSizeDialog(false)
    setDeletingSize(null)
  }

  // Seeding functions

  // Product management functions
  const handleEditProduct = useCallback(
    (product: Omit<Doc<"menuProducts">, "nameNormalized">) => {
      setEditingProduct(product)
      setShowEditProductDialog(true)
    },
    []
  )

  const handleStartDeleteProduct = useCallback(
    (product: Omit<Doc<"menuProducts">, "nameNormalized">) => {
      setDeletingProduct(product)
      setShowDeleteProductDialog(true)
    },
    []
  )

  const handleConfirmDeleteProduct = async () => {
    if (!deletingProduct) return
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsDeletingProduct(true)
    try {
      await deleteProduct({
        id: deletingProduct._id as Id<"menuProducts">,
        organizationId: activeOrganizationId,
      })
      setShowDeleteProductDialog(false)
      setDeletingProduct(null)
      toast.success("Producto eliminado exitosamente")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsDeletingProduct(false)
    }
  }

  const handleDeleteProductDialogClose = () => {
    setShowDeleteProductDialog(false)
    setDeletingProduct(null)
  }

  const handleSelectProduct = useCallback(
    (productId: string, checked: boolean) => {
      setSelectedProducts((prev) => {
        const newSet = new Set(prev)
        if (checked) {
          newSet.add(productId)
        } else {
          newSet.delete(productId)
        }
        return newSet
      })
    },
    []
  )

  const handleSelectAllProducts = useCallback(
    (checked: boolean) => {
      if (checked && filteredProducts.length > 0) {
        setSelectedProducts(new Set(filteredProducts.map((p) => p._id)))
      } else {
        setSelectedProducts(new Set())
      }
    },
    [filteredProducts]
  )

  const handleStartBatchDelete = () => {
    setBatchDeleteSelectedProducts(selectedProducts)
    setShowBatchDeleteDialog(true)
  }

  const handleConfirmBatchDelete = async () => {
    if (!activeOrganizationId) {
      toast.error("No se pudo obtener la organización")
      return
    }

    setIsBatchDeleting(true)
    try {
      const result = await batchDeleteProducts({
        productIds: Array.from(
          batchDeleteSelectedProducts
        ) as Id<"menuProducts">[],
        organizationId: activeOrganizationId,
      })
      setShowBatchDeleteDialog(false)
      setBatchDeleteSelectedProducts(new Set())
      setSelectedProducts(new Set())
      setFullMenuSelectedProducts(new Set())
      toast.success(result.message)
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsBatchDeleting(false)
    }
  }

  const handleBatchDeleteDialogClose = () => {
    setShowBatchDeleteDialog(false)
  }

  const handleStartBulkAvailability = () => {
    setBulkSelectedProducts(
      Array.from(selectedProducts) as Id<"menuProducts">[]
    )
    setShowBulkAvailabilityDialog(true)
  }

  const handleBulkAvailabilityDialogClose = () => {
    setShowBulkAvailabilityDialog(false)
    setBulkSelectedProducts([])
  }

  const handleBulkAvailabilitySuccess = () => {
    setBulkSelectedProducts([])
    setSelectedProducts(new Set())
    setFullMenuSelectedProducts(new Set())
  }

  const handleProductFormClose = () => {
    setShowCreateProductDialog(false)
    setShowEditProductDialog(false)
    setEditingProduct(null)
  }

  const handleOpenProductAvailabilitySheet = useCallback(
    (
      product: Omit<Doc<"menuProducts">, "nameNormalized"> & {
        availability: Record<string, boolean>
      }
    ) => {
      setSelectedProductForAvailability(product)
      setShowProductAvailabilitySheet(true)
    },
    []
  )

  const handleCloseProductAvailabilitySheet = () => {
    setShowProductAvailabilitySheet(false)
    setSelectedProductForAvailability(null)
  }

  const handleOpenFullMenuAvailabilitySheet = () => {
    // Initialize sheet filters with current table state
    setFullMenuSearchValue(searchValue)
    setFullMenuCategoryFilter(categoryFilter)
    setFullMenuSubcategoryFilter(subcategoryFilter)
    setShowFullMenuAvailabilitySheet(true)
  }

  const handleCloseFullMenuAvailabilitySheet = () => {
    setShowFullMenuAvailabilitySheet(false)
    // Reset state when closing
    setFullMenuSearchValue("")
    setFullMenuCategoryFilter("all")
    setFullMenuSubcategoryFilter("all")
    setFullMenuSelectedProducts(new Set())
  }

  const handleFullMenuSelectProduct = useCallback(
    (productId: string, checked: boolean) => {
      setFullMenuSelectedProducts((prev) => {
        const newSet = new Set(prev)
        if (checked) {
          newSet.add(productId)
        } else {
          newSet.delete(productId)
        }
        return newSet
      })
    },
    []
  )

  const handleFullMenuSelectAllProducts = useCallback(
    (productIds: string[], checked: boolean) => {
      if (checked) {
        setFullMenuSelectedProducts(new Set(productIds))
      } else {
        setFullMenuSelectedProducts(new Set())
      }
    },
    []
  )

  const handleFullMenuBulkAvailability = () => {
    setBulkSelectedProducts(
      Array.from(fullMenuSelectedProducts) as Id<"menuProducts">[]
    )
    setShowBulkAvailabilityDialog(true)
  }

  const handleFullMenuBatchDelete = () => {
    setBatchDeleteSelectedProducts(fullMenuSelectedProducts)
    setShowBatchDeleteDialog(true)
  }

  // Availability toggle handler
  const handleToggleAvailability = useCallback(
    async (
      productId: string,
      locationId: string,
      currentAvailability: boolean
    ) => {
      if (!activeOrganizationId) {
        toast.error("No se pudo obtener la organización")
        return
      }

      const toggleKey = `${productId}-${locationId}`

      setTogglingAvailability((prev) => new Map(prev.set(toggleKey, true)))

      try {
        await toggleAvailability({
          productId: productId as Id<"menuProducts">,
          locationId: locationId as Id<"restaurantLocations">,
          available: !currentAvailability,
          organizationId: activeOrganizationId,
        })

        toast.success(
          currentAvailability
            ? "Producto removido de la sucursal"
            : "Producto agregado a la sucursal"
        )

        // Update availability overrides for immediate UI update
        setAvailabilityOverrides((prev) => {
          const newMap = new Map(prev)
          newMap.set(toggleKey, !currentAvailability)
          return newMap
        })
      } catch (error) {
        toast.error(handleConvexError(error))
      } finally {
        setTogglingAvailability((prev) => {
          const newMap = new Map(prev)
          newMap.delete(toggleKey)
          return newMap
        })
      }
    },
    [toggleAvailability, activeOrganizationId]
  )

  // Helper functions
  const getCategoryName = (categoryId: string) => {
    const category = allCategories?.find(
      (cat: Doc<"menuProductCategories">) => cat._id === categoryId
    )
    return category?.name || "Sin categoría"
  }

  // Export function
  const handleExport = () => {
    setIsExporting(true)
    setExportTrigger(Date.now().toString())
  }

  // Pagination functions for DataViewerLayout
  const handleCategoriesNext = () => {
    if (categories?.continueCursor) {
      setCategoriesPrevCursors((prev) => [...prev, categoriesCursor || ""])
      setCategoriesCursor(categories.continueCursor)
    }
  }

  const handleCategoriesPrev = () => {
    if (categoriesPrevCursors.length > 0) {
      const newPrevCursors = [...categoriesPrevCursors]
      const prevCursor = newPrevCursors.pop()
      setCategoriesPrevCursors(newPrevCursors)
      setCategoriesCursor(prevCursor || null)
    }
  }

  const handleSubcategoriesNext = () => {
    if (subcategories?.continueCursor) {
      setSubcategoriesPrevCursors((prev) => [
        ...prev,
        subcategoriesCursor || "",
      ])
      setSubcategoriesCursor(subcategories.continueCursor)
    }
  }

  const handleSubcategoriesPrev = () => {
    if (subcategoriesPrevCursors.length > 0) {
      const newPrevCursors = [...subcategoriesPrevCursors]
      const prevCursor = newPrevCursors.pop()
      setSubcategoriesPrevCursors(newPrevCursors)
      setSubcategoriesCursor(prevCursor || null)
    }
  }

  const handleProductsNext = () => {
    if (products?.continueCursor) {
      setProductsPrevCursors((prev) => [...prev, productsCursor || ""])
      setProductsCursor(products.continueCursor)
    }
  }

  const handleProductsPrev = () => {
    if (productsPrevCursors.length > 0) {
      const newPrevCursors = [...productsPrevCursors]
      const prevCursor = newPrevCursors.pop()
      setProductsPrevCursors(newPrevCursors)
      setProductsCursor(prevCursor || null)
    }
  }

  const handleSizesNext = () => {
    if (sizes?.continueCursor) {
      setSizesPrevCursors((prev) => [...prev, sizesCursor || ""])
      setSizesCursor(sizes.continueCursor)
    }
  }

  const handleSizesPrev = () => {
    if (sizesPrevCursors.length > 0) {
      const newPrevCursors = [...sizesPrevCursors]
      const prevCursor = newPrevCursors.pop()
      setSizesPrevCursors(newPrevCursors)
      setSizesCursor(prevCursor || null)
    }
  }

  const resetCategoriesPagination = () => {
    setCategoriesCursor(null)
    setCategoriesPrevCursors([])
  }

  const resetSubcategoriesPagination = () => {
    setSubcategoriesCursor(null)
    setSubcategoriesPrevCursors([])
  }

  const resetProductsPagination = useCallback(() => {
    setProductsCursor(null)
    setProductsPrevCursors([])
  }, [])

  const resetSizesPagination = () => {
    setSizesCursor(null)
    setSizesPrevCursors([])
  }

  // Reset pagination when filters change
  useEffect(() => {
    if (
      categoryFilter !== "all" ||
      subcategoryFilter !== "all" ||
      searchQuery.trim()
    ) {
      resetProductsPagination()
    }
  }, [categoryFilter, subcategoryFilter, searchQuery, resetProductsPagination])

  // Handle export completion
  useEffect(() => {
    if (exportData && exportTrigger) {
      try {
        const date = new Date().toISOString().split("T")[0]
        const filename = `menu-export-${date}.xlsx`

        // Decode base64 and download
        const binaryString = atob(exportData)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast.success("Menú exportado exitosamente")
      } catch (error) {
        toast.error(handleConvexError(error))
      } finally {
        setIsExporting(false)
        setExportTrigger(undefined)
      }
    }
  }, [exportData, exportTrigger])

  // Render card functions
  const renderCategoryCard = (
    category: Doc<"menuProductCategories"> & { productCount: number }
  ) => (
    <Card className="gap-2 transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start gap-2 overflow-hidden">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-1 items-center gap-2 text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <FolderIcon className="h-4 w-4" />
              </div>
              <span className="ellipsis">{category.name}</span>
            </CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Abrir menú</span>
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleStartEditCategory(category)}
              >
                <EditIcon className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleStartDeleteCategory(category)}
                className="text-destructive"
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-1 text-muted-foreground text-sm">Productos</p>
          <span className="text-sm">{category.productCount} productos</span>
        </div>
      </CardContent>
    </Card>
  )

  const renderSubcategoryCard = (
    subcategory: Doc<"menuProductSubcategories"> & {
      categoryName: string
      productCount: number
    }
  ) => (
    <Card className="gap-2 transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start gap-2 overflow-hidden">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-1 items-center gap-2 text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <FolderIcon className="h-4 w-4" />
              </div>
              <span className="ellipsis">{subcategory.name}</span>
            </CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Abrir menú</span>
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleStartEditSubcategory(subcategory)}
              >
                <EditIcon className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleStartDeleteSubcategory(subcategory)}
                className="text-destructive"
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="mb-1 text-muted-foreground text-sm">Categoría</p>
          <Badge variant="secondary">{subcategory.categoryName}</Badge>
        </div>
        <div>
          <p className="mb-1 text-muted-foreground text-sm">Productos</p>
          <span className="text-sm">{subcategory.productCount} productos</span>
        </div>
      </CardContent>
    </Card>
  )

  const renderProductCard = (product: ProductFromList) => (
    <Card className="gap-2 transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-center gap-2 overflow-hidden">
          <Checkbox
            checked={selectedProducts.has(product._id)}
            onCheckedChange={(checked) =>
              handleSelectProduct(product._id, checked as boolean)
            }
            aria-label={`Seleccionar ${product.name}`}
            className="mt-1"
          />
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-1 items-center gap-2 text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                {product.imageUrl ? (
                  <ImageIcon className="h-4 w-4 text-primary" />
                ) : (
                  <PackageIcon className="h-4 w-4" />
                )}
              </div>
              <span className="ellipsis">{product.name}</span>
            </CardTitle>
            <p className="mt-1 line-clamp-2 truncate text-muted-foreground text-sm">
              {product.description}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Abrir menú</span>
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {locations && locations.length > 3 && (
                <DropdownMenuItem
                  onClick={() => handleOpenProductAvailabilitySheet(product)}
                  className="text-alternative-600"
                >
                  <ResturantsIcon className="mr-2 h-4 w-4" />
                  Gestionar Disponibilidad
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleEditProduct(product)}>
                <EditIcon className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleStartDeleteProduct(product)}
                className="text-destructive"
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline">{product.categoryName}</Badge>
          <span className="font-medium">{formatPrice(product.price)}</span>
        </div>
        {product.subcategoryName && (
          <div>
            <p className="mb-1 text-muted-foreground text-sm">Subcategoría</p>
            <Badge variant="secondary">{product.subcategoryName}</Badge>
          </div>
        )}
        <div>
          <p className="mb-1 text-muted-foreground text-sm">Tipo</p>
          <div className="flex flex-col gap-1">
            <Badge variant={product.standAlone ? "default" : "secondary"}>
              {product.standAlone ? "Independiente" : "No independiente"}
            </Badge>
            {product.combinableHalf && (
              <Badge variant="outline">Combinable por mitades</Badge>
            )}
          </div>
        </div>
        {product.sizeName && (
          <div>
            <p className="mb-1 text-muted-foreground text-sm">Tamaño</p>
            <span className="text-sm">{product.sizeName}</span>
          </div>
        )}
        {product.combinableWith && product.combinableWith.length > 0 && (
          <div>
            <p className="mb-1 text-muted-foreground text-sm">Combinable con</p>
            <div className="flex flex-wrap gap-1">
              {product.combinableWith.slice(0, 2).map((combination, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {combination.categoryName}
                  {combination.sizeName && (
                    <span className="ml-1 text-muted-foreground">
                      ({combination.sizeName})
                    </span>
                  )}
                </Badge>
              ))}
              {product.combinableWith.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{product.combinableWith.length - 2} más
                </Badge>
              )}
            </div>
          </div>
        )}
        {locations && locations.length <= 3 && (
          <div>
            <p className="mb-2 text-muted-foreground text-sm">Disponibilidad</p>
            <div className="flex flex-wrap gap-2">
              {locations.map((location) => {
                const key = `${product._id}-${location._id}`
                const isAvailable =
                  availabilityOverrides.get(key) ??
                  product.availability[location._id] ??
                  true
                const isToggling = togglingAvailability.get(
                  `${product._id}-${location._id}`
                )
                return (
                  <TooltipProvider key={location._id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleToggleAvailability(
                              product._id,
                              location._id,
                              isAvailable
                            )
                          }
                          disabled={isToggling}
                          className="flex h-6 items-center gap-1 p-0"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span
                              className="h-2 w-2 flex-shrink-0 rounded-full"
                              style={{
                                backgroundColor: location.color || "#6b7280",
                              }}
                            />
                            <span className="capitalize">{location.name}</span>
                          </div>
                          {isToggling ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                          ) : isAvailable ? (
                            <CheckCircleIcon className="h-4 w-4 text-primary" />
                          ) : (
                            <XCircleIcon className="h-4 w-4 text-red-500" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{location.code}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )

  const renderSizeCard = (size: Doc<"sizes"> & { productCount: number }) => (
    <Card className="gap-2 transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start gap-2 overflow-hidden">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-1 items-center gap-2 text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <ScaleIcon className="h-4 w-4" />
              </div>
              <span className="ellipsis">{size.name}</span>
            </CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Abrir menú</span>
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleStartEditSize(size)}>
                <EditIcon className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleStartDeleteSize(size)}
                className="text-destructive"
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-1 text-muted-foreground text-sm">Productos Usados</p>
          <span className="text-sm">{size.productCount} productos</span>
        </div>
      </CardContent>
    </Card>
  )

  // Table column definitions for DataViewerLayout
  const categoryColumns: Column<
    Doc<"menuProductCategories"> & { productCount: number }
  >[] = [
    {
      key: "name",
      header: "Nombre de la Categoría",
      render: (
        item: Doc<"menuProductCategories"> & { productCount: number }
      ) => (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <FolderIcon className="h-3 w-3" />
            {item.name}
          </Badge>
        </div>
      ),
    },
    {
      key: "productCount",
      header: "Productos",
      render: (
        item: Doc<"menuProductCategories"> & { productCount: number }
      ) => (
        <span className="text-muted-foreground text-sm">
          {item.productCount} productos
        </span>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (
        item: Doc<"menuProductCategories"> & { productCount: number }
      ) => (
        <TooltipProvider>
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStartEditCategory(item)}
                  className="h-8 w-8 p-0"
                >
                  <EditIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Editar categoría</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStartDeleteCategory(item)}
                  className="h-8 w-8 p-0 hover:text-destructive"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Eliminar categoría</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ),
    },
  ]

  const subcategoryColumns: Column<
    Doc<"menuProductSubcategories"> & {
      categoryName: string
      productCount: number
    }
  >[] = [
    {
      key: "name",
      header: "Nombre de la Subcategoría",
      render: (
        item: Doc<"menuProductSubcategories"> & {
          categoryName: string
          productCount: number
        }
      ) => (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <FolderIcon className="h-3 w-3" />
            {item.name}
          </Badge>
        </div>
      ),
    },
    {
      key: "categoryName",
      header: "Categoría",
      render: (
        item: Doc<"menuProductSubcategories"> & {
          categoryName: string
          productCount: number
        }
      ) => <Badge variant="secondary">{item.categoryName}</Badge>,
    },
    {
      key: "productCount",
      header: "Productos",
      render: (
        item: Doc<"menuProductSubcategories"> & {
          categoryName: string
          productCount: number
        }
      ) => (
        <span className="text-muted-foreground text-sm">
          {item.productCount} productos
        </span>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (
        item: Doc<"menuProductSubcategories"> & {
          categoryName: string
          productCount: number
        }
      ) => (
        <TooltipProvider>
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStartEditSubcategory(item)}
                  className="h-8 w-8 p-0"
                >
                  <EditIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Editar subcategoría</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStartDeleteSubcategory(item)}
                  className="h-8 w-8 p-0 hover:text-destructive"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Eliminar subcategoría</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ),
    },
  ]

  const productColumns = useMemo(() => {
    const columns: Column<ProductFromList>[] = [
      {
        key: "select",
        header: (
          <Checkbox
            checked={isAllSelected}
            onCheckedChange={(checked) =>
              handleSelectAllProducts(checked as boolean)
            }
            aria-label="Seleccionar todos los productos"
          />
        ),
        render: (
          item: Omit<Doc<"menuProducts">, "nameNormalized"> & {
            categoryName: string
            subcategoryName?: string
            sizeName: string | null
            availability: Record<string, boolean>
            combinableWith?: Array<{
              categoryName: string
              sizeName: string | null
              sizeId?: Id<"sizes">
              menuProductCategoryId: Id<"menuProductCategories">
            }>
          }
        ) => (
          <Checkbox
            checked={selectedProducts.has(item._id)}
            onCheckedChange={(checked) =>
              handleSelectProduct(item._id, checked as boolean)
            }
            aria-label={`Seleccionar ${item.name}`}
          />
        ),
      },
      {
        key: "name",
        header: "Producto",
        render: (
          item: Omit<Doc<"menuProducts">, "nameNormalized"> & {
            categoryName: string
            subcategoryName?: string
            sizeName: string | null
            availability: Record<string, boolean>
            combinableWith?: Array<{
              categoryName: string
              sizeName: string | null
              sizeId?: Id<"sizes">
              menuProductCategoryId: Id<"menuProductCategories">
            }>
          }
        ) => (
          <div className="min-w-0 max-w-[200px]">
            <div className="flex items-center gap-1">
              <p className="truncate font-medium">{item.name}</p>
              {item.imageUrl && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <ImageIcon className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Tiene imagen</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="line-clamp-2 truncate text-muted-foreground text-sm">
              {item.description}
            </p>
          </div>
        ),
      },
      {
        key: "categoryName",
        header: "Categoría",
        render: (
          item: Omit<Doc<"menuProducts">, "nameNormalized"> & {
            categoryName: string
            subcategoryName?: string
            sizeName: string | null
            availability: Record<string, boolean>
            combinableWith?: Array<{
              categoryName: string
              sizeName: string | null
              sizeId?: Id<"sizes">
              menuProductCategoryId: Id<"menuProductCategories">
            }>
          }
        ) => <Badge variant="outline">{item.categoryName}</Badge>,
      },
      {
        key: "subcategoryName",
        header: "Subcategoría",
        render: (
          item: Omit<Doc<"menuProducts">, "nameNormalized"> & {
            categoryName: string
            subcategoryName?: string
            sizeName: string | null
            availability: Record<string, boolean>
            combinableWith?: Array<{
              categoryName: string
              sizeName: string | null
              sizeId?: Id<"sizes">
              menuProductCategoryId: Id<"menuProductCategories">
            }>
          }
        ) =>
          item.subcategoryName ? (
            <Badge variant="secondary">{item.subcategoryName}</Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        key: "price",
        header: "Precio",
        render: (
          item: Omit<Doc<"menuProducts">, "nameNormalized"> & {
            categoryName: string
            subcategoryName?: string
            sizeName: string | null
            availability: Record<string, boolean>
            combinableWith?: Array<{
              categoryName: string
              sizeName: string | null
              sizeId?: Id<"sizes">
              menuProductCategoryId: Id<"menuProductCategories">
            }>
          }
        ) => <span className="font-medium">{formatPrice(item.price)}</span>,
      },
      {
        key: "sizeName",
        header: "Tamaño",
        render: (
          item: Omit<Doc<"menuProducts">, "nameNormalized"> & {
            categoryName: string
            subcategoryName?: string
            sizeName: string | null
            availability: Record<string, boolean>
            combinableWith?: Array<{
              categoryName: string
              sizeName: string | null
              sizeId?: Id<"sizes">
              menuProductCategoryId: Id<"menuProductCategories">
            }>
          }
        ) => <span>{item.sizeName || "-"}</span>,
      },
      {
        key: "standAlone",
        header: "Tipo",
        render: (
          item: Omit<Doc<"menuProducts">, "nameNormalized"> & {
            categoryName: string
            subcategoryName?: string
            sizeName: string | null
            availability: Record<string, boolean>
            combinableWith?: Array<{
              categoryName: string
              sizeName: string | null
              sizeId?: Id<"sizes">
              menuProductCategoryId: Id<"menuProductCategories">
            }>
          }
        ) => (
          <div className="flex flex-col gap-1">
            <Badge variant={item.standAlone ? "default" : "secondary"}>
              {item.standAlone ? "Independiente" : "No independiente"}
            </Badge>
            {item.combinableHalf && (
              <Badge variant="outline">Combinable por mitades</Badge>
            )}
          </div>
        ),
      },
      {
        key: "combinableWith",
        header: "Combinable",
        render: (
          item: Omit<
            Doc<"menuProducts">,
            "nameNormalized" | "combinableWith"
          > & {
            categoryName: string
            subcategoryName?: string
            sizeName: string | null
            availability: Record<string, boolean>
            combinableWith?: Array<{
              categoryName: string
              sizeName: string | null
              sizeId?: Id<"sizes">
              menuProductCategoryId: Id<"menuProductCategories">
            }>
          }
        ) =>
          item.combinableWith && item.combinableWith.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {item.combinableWith.slice(0, 2).map((combination, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {combination.categoryName}
                  {combination.sizeName && (
                    <span className="ml-1 text-muted-foreground">
                      ({combination.sizeName})
                    </span>
                  )}
                </Badge>
              ))}
              {item.combinableWith.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{item.combinableWith.length - 2} más
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        key: "instructions",
        header: "Instrucciones",
        render: (
          item: Omit<
            Doc<"menuProducts">,
            "nameNormalized" | "combinableWith"
          > & {
            categoryName: string
            subcategoryName?: string
            sizeName: string | null
            availability: Record<string, boolean>
            combinableWith?: Array<{
              categoryName: string
              sizeName: string | null
              sizeId?: Id<"sizes">
              menuProductCategoryId: Id<"menuProductCategories">
            }>
          }
        ) =>
          item.instructions ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-pointer items-center gap-1.5">
                    <FileTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="max-w-[100px] truncate text-sm">
                      {item.instructions.slice(0, 30)}
                      {item.instructions.length > 30 && "..."}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="whitespace-pre-wrap text-sm">
                    {item.instructions}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
    ]

    // Add dynamic location columns if locations <= 3
    if (locations && locations.length <= 3) {
      locations.forEach((location) => {
        columns.push({
          key: `location-${location._id}`,
          header: (
            <div className="flex flex-col items-center">
              {location.code}
              <div
                className="size-2 rounded-full"
                style={{ backgroundColor: location.color }}
              />
            </div>
          ),
          render: (
            item: Omit<Doc<"menuProducts">, "nameNormalized"> & {
              categoryName: string
              subcategoryName?: string
              sizeName: string | null
              availability: Record<string, boolean>
              combinableWith?: Array<{
                categoryName: string
                sizeName: string | null
                sizeId?: Id<"sizes">
                menuProductCategoryId: Id<"menuProductCategories">
              }>
            }
          ) => {
            const key = `${item._id}-${location._id}`
            const isAvailable =
              availabilityOverrides.get(key) ??
              item.availability[location._id] ??
              true
            const isToggling = togglingAvailability.get(
              `${item._id}-${location._id}`
            )
            return (
              <TooltipProvider key={location._id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleToggleAvailability(
                            item._id,
                            location._id,
                            isAvailable
                          )
                        }
                        disabled={isToggling}
                      >
                        {isAvailable ? (
                          <CheckCircleIcon className="h-4 w-4 text-primary" />
                        ) : (
                          <XCircleIcon className="h-4 w-4 text-red-500" />
                        )}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="capitalize">
                      Disponibilidad {location.name} ({location.code})
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          },
        })
      })
    }

    // Actions column
    columns.push({
      key: "actions",
      header: "Acciones",
      render: (
        item: Omit<Doc<"menuProducts">, "nameNormalized"> & {
          categoryName: string
          subcategoryName?: string
          sizeName: string | null
          availability: Record<string, boolean>
          combinableWith?: Array<{
            categoryName: string
            sizeName: string | null
            sizeId?: Id<"sizes">
            menuProductCategoryId: Id<"menuProductCategories">
          }>
        }
      ) => (
        <TooltipProvider>
          <div className="flex items-center justify-center gap-1">
            {locations && locations.length > 3 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenProductAvailabilitySheet(item)}
                    className="h-8 w-8 p-0 text-alternative-600 hover:text-primary"
                  >
                    <ResturantsIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Gestionar disponibilidad</p>
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditProduct(item)}
                  className="h-8 w-8 p-0"
                >
                  <EditIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Editar producto</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStartDeleteProduct(item)}
                  className="h-8 w-8 p-0 hover:text-destructive"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Eliminar producto</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ),
    })

    return columns
  }, [
    locations,
    isAllSelected,
    selectedProducts,
    togglingAvailability,
    availabilityOverrides,
    handleSelectAllProducts,
    handleSelectProduct,
    handleToggleAvailability,
    handleOpenProductAvailabilitySheet,
    handleEditProduct,
    handleStartDeleteProduct,
    ResturantsIcon,
  ])

  const sizeColumns: Column<Doc<"sizes"> & { productCount: number }>[] = [
    {
      key: "name",
      header: "Nombre del Tamaño",
      render: (item: Doc<"sizes"> & { productCount: number }) => (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <ScaleIcon className="h-3 w-3" />
            {item.name}
          </Badge>
        </div>
      ),
    },
    {
      key: "productCount",
      header: "Productos Usados",
      render: (item: Doc<"sizes"> & { productCount: number }) => (
        <span className="text-muted-foreground text-sm">
          {item.productCount} productos
        </span>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (item: Doc<"sizes"> & { productCount: number }) => (
        <TooltipProvider>
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStartEditSize(item)}
                  className="h-8 w-8 p-0"
                >
                  <EditIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Editar tamaño</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStartDeleteSize(item)}
                  className="h-8 w-8 p-0 hover:text-destructive"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Eliminar tamaño</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ),
    },
  ]

  return (
    <>
      <SmartHorizontalScrollArea className="w-full">
        <div className="flex items-center justify-end gap-1">
          <Link href="/menu/import-guide">
            <Button variant="outline" className="flex items-center gap-2">
              <HelpCircleIcon className="h-4 w-4" />
              Guía de Importación
            </Button>
          </Link>
          <Button
            onClick={() => setIsImportDialogOpen(true)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <UploadIcon className="h-4 w-4" />
            Importar
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            variant="outline"
            className="flex items-center gap-2"
          >
            <DownloadIcon className="h-4 w-4" />
            {isExporting ? "Exportando..." : "Exportar"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="flex items-center gap-2">
                <PlusIcon className="h-4 w-4" />
                Agregar
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setShowCreateCategoryDialog(true)}
                className="flex items-center gap-2"
              >
                <FolderIcon className="h-4 w-4" />
                Nueva Categoría
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowCreateSubcategoryDialog(true)}
                className="flex items-center gap-2"
              >
                <FolderIcon className="h-4 w-4" />
                Nueva Subcategoría
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowCreateSizeDialog(true)}
                className="flex items-center gap-2"
              >
                <ScaleIcon className="h-4 w-4" />
                Nuevo Tamaño
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowCreateProductDialog(true)}
                className="flex items-center gap-2"
              >
                <PackageIcon className="h-4 w-4" />
                Nuevo Producto
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SmartHorizontalScrollArea>

      <Tabs defaultValue="categories" className="flex-1">
        <TabsList className="flex h-fit w-full flex-wrap">
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <FolderIcon className="h-4 w-4" />
            Categorías
          </TabsTrigger>
          <TabsTrigger
            value="subcategories"
            className="flex items-center gap-2"
          >
            <FolderIcon className="h-4 w-4" />
            Subcategorías
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <PackageIcon className="h-4 w-4" />
            Productos
          </TabsTrigger>
          <TabsTrigger value="sizes" className="flex items-center gap-2">
            <ScaleIcon className="h-4 w-4" />
            Tamaños
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <DataViewerLayout
            className="p-0"
            viewMode={categoriesViewMode}
            onViewModeChange={setCategoriesViewMode}
            data={categories?.page || []}
            tableColumns={categoryColumns}
            renderCard={renderCategoryCard}
            paginationProps={
              categories !== undefined
                ? {
                    state: {
                      pageSize: categoriesPageSize,
                      cursor: categoriesCursor,
                      prevCursors: categoriesPrevCursors,
                    },
                    actions: {
                      setPageSize: setCategoriesPageSize,
                      handleNext: handleCategoriesNext,
                      handlePrev: handleCategoriesPrev,
                      resetPagination: resetCategoriesPagination,
                    },
                    info: {
                      isDone: categories?.isDone ?? true,
                      continueCursor: categories?.continueCursor ?? null,
                    },
                    pageSizeOptions: [10, 20, 50],
                  }
                : null
            }
            loading={categories === undefined}
            error={
              categories instanceof Error ||
              categories instanceof ConvexError ||
              categories === null
                ? new Error("Error al cargar categorías")
                : null
            }
            emptyState={{
              icon: <FolderIcon className="h-12 w-12" />,
              title: "No hay categorías creadas aún",
              description:
                "Crea tu primera categoría para empezar a construir tu menú",
            }}
            itemName={{ singular: "categoría", plural: "categorías" }}
          />
        </TabsContent>

        <TabsContent value="subcategories">
          <DataViewerLayout
            className="p-0"
            viewMode={subcategoriesViewMode}
            onViewModeChange={setSubcategoriesViewMode}
            data={subcategories?.page || []}
            tableColumns={subcategoryColumns}
            renderCard={renderSubcategoryCard}
            paginationProps={
              subcategories !== undefined
                ? {
                    state: {
                      pageSize: subcategoriesPageSize,
                      cursor: subcategoriesCursor,
                      prevCursors: subcategoriesPrevCursors,
                    },
                    actions: {
                      setPageSize: setSubcategoriesPageSize,
                      handleNext: handleSubcategoriesNext,
                      handlePrev: handleSubcategoriesPrev,
                      resetPagination: resetSubcategoriesPagination,
                    },
                    info: {
                      isDone: subcategories?.isDone ?? true,
                      continueCursor: subcategories?.continueCursor ?? null,
                    },
                    pageSizeOptions: [10, 20, 50],
                  }
                : null
            }
            loading={subcategories === undefined}
            error={
              subcategories instanceof Error ||
              subcategories instanceof ConvexError ||
              subcategories === null
                ? new Error("Error al cargar subcategorías")
                : null
            }
            emptyState={{
              icon: <FolderIcon className="h-12 w-12" />,
              title: "No hay subcategorías creadas aún",
              description:
                "Crea tu primera subcategoría para organizar mejor tu menú",
            }}
            itemName={{ singular: "subcategoría", plural: "subcategorías" }}
          />
        </TabsContent>

        <TabsContent value="products">
          <DataViewerLayout
            className="p-0"
            viewMode={productsViewMode}
            onViewModeChange={setProductsViewMode}
            stickyColumns={2}
            searchProps={{
              value: searchValue,
              onChange: setSearchValue,
              placeholder: "Buscar por nombre...",
            }}
            filters={
              <>
                <Select
                  value={categoryFilter}
                  onValueChange={(value) => {
                    setCategoryFilter(value)
                    setSubcategoryFilter("all")
                    setSelectedProducts(new Set())
                  }}
                  disabled={isSearching}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {allCategories?.map((category) => (
                      <SelectItem key={category._id} value={category._id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={subcategoryFilter}
                  onValueChange={(value) => {
                    setSubcategoryFilter(value)
                    setSelectedProducts(new Set())
                  }}
                  disabled={categoryFilter === "all" || isSearching}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las subcategorías</SelectItem>
                    {allSubcategories
                      ?.filter(
                        (subcategory) =>
                          categoryFilter === "all" ||
                          subcategory.menuProductCategoryId === categoryFilter
                      )
                      .map((subcategory) => (
                        <SelectItem
                          key={subcategory._id}
                          value={subcategory._id}
                        >
                          {subcategory.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              <>
                {selectedProducts.size > 0 && (
                  <>
                    <Button
                      onClick={handleStartBulkAvailability}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <ResturantsIcon className="h-4 w-4" />
                      Gestionar {selectedProducts.size} disponibilidad
                      {selectedProducts.size !== 1 ? "es" : ""}
                    </Button>
                    <Button
                      onClick={handleStartBatchDelete}
                      variant="destructive"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <TrashIcon className="h-4 w-4" />
                      Eliminar {selectedProducts.size} seleccionado
                      {selectedProducts.size !== 1 ? "s" : ""}
                    </Button>
                  </>
                )}
                {locations && locations.length > 3 && (
                  <Button
                    onClick={handleOpenFullMenuAvailabilitySheet}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <ResturantsIcon className="h-4 w-4" />
                    Vista De Disponibilidad
                  </Button>
                )}
              </>
            }
            cardHeader={
              selectedProducts.size > 0 ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={
                      selectedProducts.size === filteredProducts.length &&
                      filteredProducts.length > 0
                    }
                    onCheckedChange={(checked) =>
                      handleSelectAllProducts(checked as boolean)
                    }
                    aria-label="Seleccionar todos los productos"
                  />
                  <span className="font-medium text-sm">
                    {selectedProducts.size === filteredProducts.length &&
                    filteredProducts.length > 0
                      ? "Deseleccionar todos"
                      : "Seleccionar todos"}
                  </span>
                </div>
              ) : undefined
            }
            data={filteredProducts}
            tableColumns={productColumns}
            renderCard={renderProductCard}
            paginationProps={
              products !== undefined
                ? {
                    state: {
                      pageSize: productsPageSize,
                      cursor: productsCursor,
                      prevCursors: productsPrevCursors,
                    },
                    actions: {
                      setPageSize: setProductsPageSize,
                      handleNext: handleProductsNext,
                      handlePrev: handleProductsPrev,
                      resetPagination: resetProductsPagination,
                    },
                    info: {
                      isDone: products?.isDone ?? true,
                      continueCursor: products?.continueCursor ?? null,
                    },
                    pageSizeOptions: [10, 20, 50],
                  }
                : null
            }
            loading={products === undefined}
            error={
              products instanceof Error ||
              products instanceof ConvexError ||
              products === null
                ? new Error("Error al cargar productos")
                : null
            }
            emptyState={{
              icon: <PackageIcon className="h-12 w-12" />,
              title: searchQuery
                ? `No se encontraron productos que coincidan con "${searchQuery}"`
                : "No hay productos creados aún",
              description: searchQuery
                ? `No hay productos que coincidan con "${searchQuery}". Intenta con otro término de búsqueda.`
                : "Crea tu primer producto para empezar a construir tu menú",
            }}
            itemName={{ singular: "producto", plural: "productos" }}
          />
        </TabsContent>

        <TabsContent value="sizes">
          <DataViewerLayout
            className="p-0"
            viewMode={sizesViewMode}
            onViewModeChange={setSizesViewMode}
            data={sizes?.page || []}
            tableColumns={sizeColumns}
            renderCard={renderSizeCard}
            paginationProps={
              sizes !== undefined
                ? {
                    state: {
                      pageSize: sizesPageSize,
                      cursor: sizesCursor,
                      prevCursors: sizesPrevCursors,
                    },
                    actions: {
                      setPageSize: setSizesPageSize,
                      handleNext: handleSizesNext,
                      handlePrev: handleSizesPrev,
                      resetPagination: resetSizesPagination,
                    },
                    info: {
                      isDone: sizes?.isDone ?? true,
                      continueCursor: sizes?.continueCursor ?? null,
                    },
                    pageSizeOptions: [10, 20, 50],
                  }
                : null
            }
            loading={sizes === undefined}
            error={
              sizes instanceof Error ||
              sizes instanceof ConvexError ||
              sizes === null
                ? new Error("Error al cargar tamaños")
                : null
            }
            emptyState={{
              icon: <ScaleIcon className="h-12 w-12" />,
              title: "No hay tamaños creados aún",
              description:
                "Crea tu primer tamaño para empezar a construir tu menú",
            }}
            itemName={{ singular: "tamaño", plural: "tamaños" }}
          />
        </TabsContent>
      </Tabs>

      {/* Category Dialogs */}
      <Dialog
        open={showCreateCategoryDialog}
        onOpenChange={setShowCreateCategoryDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderIcon className="h-5 w-5" />
              Crear Nueva Categoría
            </DialogTitle>
            <DialogDescription>
              Añade una nueva categoría a tu menú. Las categorías te ayudan a
              organizar tus productos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Nombre de la Categoría</Label>
              <Input
                id="category-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ej: Pizzas Clásicas, Bebidas, Entrantes..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateCategory()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateCategoryDialog(false)}
              disabled={isCreatingCategory}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateCategory}
              disabled={isCreatingCategory || !newCategoryName.trim()}
            >
              {isCreatingCategory ? "Creando..." : "Crear Categoría"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditCategoryDialog}
        onOpenChange={handleEditCategoryDialogClose}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EditIcon className="h-5 w-5" />
              Editar Categoría
            </DialogTitle>
            <DialogDescription>
              Modifica el nombre de la categoría seleccionada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-category-name">Nombre de la Categoría</Label>
              <Input
                id="edit-category-name"
                value={editCategoryName}
                onChange={(e) => setEditCategoryName(e.target.value)}
                placeholder="Ej: Pizzas Clásicas, Bebidas, Entrantes..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleEditCategory()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleEditCategoryDialogClose}
              disabled={isEditingCategory}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEditCategory}
              disabled={isEditingCategory || !editCategoryName.trim()}
            >
              {isEditingCategory ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subcategory Dialogs */}
      <Dialog
        open={showCreateSubcategoryDialog}
        onOpenChange={setShowCreateSubcategoryDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderIcon className="h-5 w-5" />
              Crear Nueva Subcategoría
            </DialogTitle>
            <DialogDescription>
              Añade una nueva subcategoría a tu menú. Las subcategorías te
              ayudan a organizar mejor tus productos dentro de cada categoría.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="subcategory-category">Categoría</Label>
              <Select
                value={newSubcategoryCategoryId}
                onValueChange={setNewSubcategoryCategoryId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories?.map((category) => (
                    <SelectItem key={category._id} value={category._id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subcategory-name">
                Nombre de la Subcategoría
              </Label>
              <Input
                id="subcategory-name"
                value={newSubcategoryName}
                onChange={(e) => setNewSubcategoryName(e.target.value)}
                placeholder="Ej: Pizzas Vegetarianas, Cervezas Nacionales..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSubcategoryCategoryId) {
                    handleCreateSubcategory()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateSubcategoryDialog(false)
                setNewSubcategoryName("")
                setNewSubcategoryCategoryId("")
              }}
              disabled={isCreatingSubcategory}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateSubcategory}
              disabled={
                isCreatingSubcategory ||
                !newSubcategoryName.trim() ||
                !newSubcategoryCategoryId
              }
            >
              {isCreatingSubcategory ? "Creando..." : "Crear Subcategoría"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditSubcategoryDialog}
        onOpenChange={handleEditSubcategoryDialogClose}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EditIcon className="h-5 w-5" />
              Editar Subcategoría
            </DialogTitle>
            <DialogDescription>
              Modifica el nombre y categoría de la subcategoría seleccionada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-subcategory-category">Categoría</Label>
              <Select
                value={editSubcategoryCategoryId}
                onValueChange={setEditSubcategoryCategoryId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories?.map((category) => (
                    <SelectItem key={category._id} value={category._id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subcategory-name">
                Nombre de la Subcategoría
              </Label>
              <Input
                id="edit-subcategory-name"
                value={editSubcategoryName}
                onChange={(e) => setEditSubcategoryName(e.target.value)}
                placeholder="Ej: Pizzas Vegetarianas, Cervezas Nacionales..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editSubcategoryCategoryId) {
                    handleEditSubcategory()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleEditSubcategoryDialogClose}
              disabled={isEditingSubcategory}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEditSubcategory}
              disabled={
                isEditingSubcategory ||
                !editSubcategoryName.trim() ||
                !editSubcategoryCategoryId
              }
            >
              {isEditingSubcategory ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Forms */}
      <MenuProductBuilderForm
        open={showCreateProductDialog}
        onOpenChange={handleProductFormClose}
        mode="create"
      />

      <MenuProductBuilderForm
        open={showEditProductDialog}
        onOpenChange={handleProductFormClose}
        product={editingProduct}
        mode="edit"
      />

      {/* Size Dialogs */}
      <Dialog
        open={showCreateSizeDialog}
        onOpenChange={setShowCreateSizeDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScaleIcon className="h-5 w-5" />
              Crear Nuevo Tamaño
            </DialogTitle>
            <DialogDescription>
              Añade un nuevo tamaño a tu menú. Los tamaños te ayudan a
              diferenciar productos por tamaño.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="size-name">Nombre del Tamaño</Label>
              <Input
                id="size-name"
                value={newSizeName}
                onChange={(e) => setNewSizeName(e.target.value)}
                placeholder="Ej: Personal, Mediana, Grande, Familiar..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateSize()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateSizeDialog(false)}
              disabled={isCreatingSize}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateSize}
              disabled={isCreatingSize || !newSizeName.trim()}
            >
              {isCreatingSize ? "Creando..." : "Crear Tamaño"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditSizeDialog}
        onOpenChange={handleEditSizeDialogClose}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EditIcon className="h-5 w-5" />
              Editar Tamaño
            </DialogTitle>
            <DialogDescription>
              Modifica el nombre del tamaño seleccionado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-size-name">Nombre del Tamaño</Label>
              <Input
                id="edit-size-name"
                value={editSizeName}
                onChange={(e) => setEditSizeName(e.target.value)}
                placeholder="Ej: Personal, Mediana, Grande, Familiar..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleEditSize()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleEditSizeDialogClose}
              disabled={isEditingSize}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEditSize}
              disabled={isEditingSize || !editSizeName.trim()}
            >
              {isEditingSize ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialogs */}
      <DeleteProductDialog
        open={showDeleteProductDialog}
        onOpenChange={handleDeleteProductDialogClose}
        product={deletingProduct}
        onConfirm={handleConfirmDeleteProduct}
        isDeleting={isDeletingProduct}
      />

      <AlertDialog
        open={showDeleteCategoryDialog}
        onOpenChange={handleDeleteCategoryDialogClose}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar la categoría "
              {deletingCategory?.name}"? Esta acción no se puede deshacer y
              eliminará todos los productos asociados a esta categoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCategory}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteCategory}
              disabled={isDeletingCategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingCategory ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteSubcategoryDialog}
        onOpenChange={handleDeleteSubcategoryDialogClose}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar la subcategoría "
              {deletingSubcategory?.name}"? Esta acción no se puede deshacer y
              puede afectar productos que usan esta subcategoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingSubcategory}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteSubcategory}
              disabled={isDeletingSubcategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingSubcategory ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteSizeDialog}
        onOpenChange={handleDeleteSizeDialogClose}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar el tamaño "
              {deletingSize?.name}"? Esta acción no se puede deshacer y puede
              afectar productos que usan este tamaño.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingSize}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteSize}
              disabled={isDeletingSize}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingSize ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showBatchDeleteDialog}
        onOpenChange={handleBatchDeleteDialogClose}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación Masiva</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar{" "}
              {batchDeleteSelectedProducts.size} producto
              {batchDeleteSelectedProducts.size !== 1 ? "s" : ""}? Esta acción
              no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBatchDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBatchDelete}
              disabled={isBatchDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBatchDeleting
                ? "Eliminando..."
                : `Eliminar ${batchDeleteSelectedProducts.size} producto${batchDeleteSelectedProducts.size !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkAvailabilityDialog
        open={showBulkAvailabilityDialog}
        onOpenChange={handleBulkAvailabilityDialogClose}
        selectedProducts={bulkSelectedProducts}
        locations={locations || []}
        onSuccess={handleBulkAvailabilitySuccess}
      />

      <ProductAvailabilitySheet
        open={showProductAvailabilitySheet}
        onOpenChange={handleCloseProductAvailabilitySheet}
        product={selectedProductForAvailability}
      />

      <FullMenuAvailabilitySheet
        open={showFullMenuAvailabilitySheet}
        onOpenChange={handleCloseFullMenuAvailabilitySheet}
        searchValue={fullMenuSearchValue}
        onSearchChange={setFullMenuSearchValue}
        categoryFilter={fullMenuCategoryFilter}
        onCategoryFilterChange={setFullMenuCategoryFilter}
        subcategoryFilter={fullMenuSubcategoryFilter}
        onSubcategoryFilterChange={setFullMenuSubcategoryFilter}
        selectedProducts={fullMenuSelectedProducts}
        onSelectProduct={handleFullMenuSelectProduct}
        onSelectAllProducts={handleFullMenuSelectAllProducts}
        onBulkAvailability={handleFullMenuBulkAvailability}
        onBatchDelete={handleFullMenuBatchDelete}
      />

      <MenuImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImportComplete={() => {
          // Refresh data after import
          // The queries will automatically refresh
        }}
      />
    </>
  )
}
