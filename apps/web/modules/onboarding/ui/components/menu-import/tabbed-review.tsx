"use client"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
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
import { cn } from "@workspace/ui/lib/utils"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  Loader2Icon,
  PackageIcon,
  PlusIcon,
  RulerIcon,
  TagIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type {
  ExtractedCategory,
  ExtractedProduct,
  ExtractedSize,
  ExtractedSubcategory,
  MenuImportState,
} from "@/modules/onboarding/types"
import { generateTempId } from "@/modules/onboarding/types"

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50] as const
const DEFAULT_ITEMS_PER_PAGE = 25

interface TabbedReviewProps {
  state: MenuImportState
  onStateChange: (updater: (prev: MenuImportState) => MenuImportState) => void
  onImport: () => void
  onAddMoreFiles: () => void
  isImporting: boolean
}

export function TabbedReview({
  state,
  onStateChange,
  onImport,
  onAddMoreFiles,
  isImporting,
}: TabbedReviewProps) {
  return (
    <div className="space-y-6">
      <SummaryCards state={state} />

      <Tabs defaultValue="categories">
        <TabsList className="w-full">
          <TabsTrigger value="categories">
            Categorías ({state.categories.length})
          </TabsTrigger>
          <TabsTrigger value="subcategories">
            Subcategorías ({state.subcategories.length})
          </TabsTrigger>
          <TabsTrigger value="sizes">
            Tamaños ({state.sizes.length})
          </TabsTrigger>
          <TabsTrigger value="products">
            Productos ({state.products.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <CategoriesTab state={state} onStateChange={onStateChange} />
        </TabsContent>
        <TabsContent value="subcategories">
          <SubcategoriesTab state={state} onStateChange={onStateChange} />
        </TabsContent>
        <TabsContent value="sizes">
          <SizesTab state={state} onStateChange={onStateChange} />
        </TabsContent>
        <TabsContent value="products">
          <ProductsTab state={state} onStateChange={onStateChange} />
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={onAddMoreFiles}
          disabled={isImporting}
        >
          <UploadIcon className="mr-2 h-4 w-4" />
          Subir más archivos
        </Button>
        <Button onClick={onImport} disabled={isImporting}>
          {isImporting ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Importando...
            </>
          ) : (
            "Importar Menú"
          )}
        </Button>
      </div>
    </div>
  )
}

function SummaryCards({ state }: { state: MenuImportState }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <FolderIcon className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Categorías</span>
        </div>
        <p className="mt-2 font-bold text-2xl">{state.categories.length}</p>
      </div>
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <TagIcon className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Subcategorías</span>
        </div>
        <p className="mt-2 font-bold text-2xl">{state.subcategories.length}</p>
      </div>
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <RulerIcon className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Tamaños</span>
        </div>
        <p className="mt-2 font-bold text-2xl">{state.sizes.length}</p>
      </div>
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <PackageIcon className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Productos</span>
        </div>
        <p className="mt-2 font-bold text-2xl">{state.products.length}</p>
      </div>
    </div>
  )
}

interface TabProps {
  state: MenuImportState
  onStateChange: (updater: (prev: MenuImportState) => MenuImportState) => void
}

function CategoriesTab({ state, onStateChange }: TabProps) {
  const addCategory = () => {
    const newCategory: ExtractedCategory = {
      tempId: generateTempId(),
      name: "",
    }
    onStateChange((prev) => ({
      ...prev,
      categories: [...prev.categories, newCategory],
    }))
  }

  const updateCategory = (tempId: string, name: string) => {
    onStateChange((prev) => ({
      ...prev,
      categories: prev.categories.map((cat) =>
        cat.tempId === tempId ? { ...cat, name } : cat
      ),
    }))
  }

  const removeCategory = (tempId: string) => {
    onStateChange((prev) => ({
      ...prev,
      categories: prev.categories.filter((cat) => cat.tempId !== tempId),
      subcategories: prev.subcategories.filter(
        (sub) => sub.categoryTempId !== tempId
      ),
      products: prev.products.filter((prod) => prod.categoryTempId !== tempId),
    }))
  }

  if (state.categories.length === 0) {
    return (
      <EmptyState
        message="No hay categorías. Agrega al menos una para continuar."
        onAdd={addCategory}
        addLabel="Agregar categoría"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre de la categoría</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.categories.map((category) => (
              <TableRow key={category.tempId}>
                <TableCell>
                  <Input
                    value={category.name}
                    onChange={(e) =>
                      updateCategory(category.tempId, e.target.value)
                    }
                    placeholder="Ej: Pizzas, Bebidas, Entradas"
                    className="h-9"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCategory(category.tempId)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button
        variant="outline"
        onClick={addCategory}
        className="w-full border-dashed"
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Agregar categoría
      </Button>
    </div>
  )
}

function SubcategoriesTab({ state, onStateChange }: TabProps) {
  const addSubcategory = () => {
    if (state.categories.length === 0) {
      toast.error("Primero debes agregar al menos una categoría")
      return
    }

    const newSubcategory: ExtractedSubcategory = {
      tempId: generateTempId(),
      name: "",
      categoryTempId: state.categories[0]?.tempId ?? "",
    }
    onStateChange((prev) => ({
      ...prev,
      subcategories: [...prev.subcategories, newSubcategory],
    }))
  }

  const updateSubcategory = (
    tempId: string,
    field: "name" | "categoryTempId",
    value: string
  ) => {
    onStateChange((prev) => ({
      ...prev,
      subcategories: prev.subcategories.map((sub) =>
        sub.tempId === tempId ? { ...sub, [field]: value } : sub
      ),
    }))
  }

  const removeSubcategory = (tempId: string) => {
    onStateChange((prev) => ({
      ...prev,
      subcategories: prev.subcategories.filter((sub) => sub.tempId !== tempId),
      products: prev.products.map((prod) =>
        prod.subcategoryTempId === tempId
          ? { ...prod, subcategoryTempId: undefined }
          : prod
      ),
    }))
  }

  if (state.subcategories.length === 0) {
    return (
      <EmptyState
        message="No hay subcategorías. Son opcionales para organizar mejor tu menú."
        onAdd={addSubcategory}
        addLabel="Agregar subcategoría"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.subcategories.map((subcategory) => (
              <TableRow key={subcategory.tempId}>
                <TableCell>
                  <Input
                    value={subcategory.name}
                    onChange={(e) =>
                      updateSubcategory(
                        subcategory.tempId,
                        "name",
                        e.target.value
                      )
                    }
                    placeholder="Ej: Clásicas, Especiales"
                    className="h-9"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={subcategory.categoryTempId}
                    onValueChange={(value) =>
                      updateSubcategory(
                        subcategory.tempId,
                        "categoryTempId",
                        value
                      )
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {state.categories.map((cat) => (
                        <SelectItem key={cat.tempId} value={cat.tempId}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSubcategory(subcategory.tempId)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button
        variant="outline"
        onClick={addSubcategory}
        className="w-full border-dashed"
        disabled={state.categories.length === 0}
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Agregar subcategoría
      </Button>
    </div>
  )
}

function SizesTab({ state, onStateChange }: TabProps) {
  const addSize = () => {
    const newSize: ExtractedSize = {
      tempId: generateTempId(),
      name: "",
    }
    onStateChange((prev) => ({
      ...prev,
      sizes: [...prev.sizes, newSize],
    }))
  }

  const updateSize = (tempId: string, name: string) => {
    onStateChange((prev) => ({
      ...prev,
      sizes: prev.sizes.map((size) =>
        size.tempId === tempId ? { ...size, name } : size
      ),
    }))
  }

  const removeSize = (tempId: string) => {
    onStateChange((prev) => ({
      ...prev,
      sizes: prev.sizes.filter((size) => size.tempId !== tempId),
      products: prev.products.map((prod) =>
        prod.sizeTempId === tempId ? { ...prod, sizeTempId: undefined } : prod
      ),
    }))
  }

  if (state.sizes.length === 0) {
    return (
      <EmptyState
        message="No hay tamaños definidos. Son opcionales si tus productos no tienen variaciones."
        onAdd={addSize}
        addLabel="Agregar tamaño"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre del tamaño</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.sizes.map((size) => (
              <TableRow key={size.tempId}>
                <TableCell>
                  <Input
                    value={size.name}
                    onChange={(e) => updateSize(size.tempId, e.target.value)}
                    placeholder="Ej: Personal, Grande, 1L"
                    className="h-9"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSize(size.tempId)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button
        variant="outline"
        onClick={addSize}
        className="w-full border-dashed"
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Agregar tamaño
      </Button>
    </div>
  )
}

function ProductsTab({ state, onStateChange }: TabProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE)

  const totalPages = Math.ceil(state.products.length / itemsPerPage)
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return state.products.slice(startIndex, startIndex + itemsPerPage)
  }, [state.products, currentPage, itemsPerPage])

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const addProduct = () => {
    if (state.categories.length === 0) {
      toast.error("Primero debes agregar al menos una categoría")
      return
    }

    const newProduct: ExtractedProduct = {
      tempId: generateTempId(),
      name: "",
      description: "",
      price: 0,
      categoryTempId: state.categories[0]?.tempId ?? "",
      standAlone: true,
      combinableHalf: false,
    }
    onStateChange((prev) => ({
      ...prev,
      products: [...prev.products, newProduct],
    }))
  }

  const updateProduct = (
    tempId: string,
    field: keyof ExtractedProduct,
    value: string | number | boolean | string[] | undefined
  ) => {
    onStateChange((prev) => ({
      ...prev,
      products: prev.products.map((prod) =>
        prod.tempId === tempId ? { ...prod, [field]: value } : prod
      ),
    }))
  }

  const removeProduct = (tempId: string) => {
    onStateChange((prev) => ({
      ...prev,
      products: prev.products.filter((prod) => prod.tempId !== tempId),
    }))
  }

  const getSubcategoriesForCategory = (categoryTempId: string) => {
    return state.subcategories.filter(
      (sub) => sub.categoryTempId === categoryTempId
    )
  }

  if (state.products.length === 0) {
    return (
      <EmptyState
        message="No hay productos. Agrega al menos uno para importar tu menú."
        onAdd={addProduct}
        addLabel="Agregar producto"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[1400px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[140px]">Nombre</TableHead>
              <TableHead className="min-w-[180px]">Descripción</TableHead>
              <TableHead className="min-w-[110px]">Categoría</TableHead>
              <TableHead className="min-w-[110px]">Subcategoría</TableHead>
              <TableHead className="min-w-[90px]">Tamaño</TableHead>
              <TableHead className="min-w-[85px]">Precio</TableHead>
              <TableHead className="w-[70px] text-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">Solo</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>¿Se puede pedir solo?</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="w-[70px] text-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">Mitad</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>¿Es combinable como mitad?</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="min-w-[140px]">Combinable con</TableHead>
              <TableHead className="w-[60px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProducts.map((product) => (
              <TableRow key={product.tempId}>
                <TableCell>
                  <Input
                    value={product.name}
                    onChange={(e) =>
                      updateProduct(product.tempId, "name", e.target.value)
                    }
                    placeholder="Nombre"
                    className="h-9"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={product.description}
                    onChange={(e) =>
                      updateProduct(
                        product.tempId,
                        "description",
                        e.target.value
                      )
                    }
                    placeholder="Descripción"
                    className="h-9"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={product.categoryTempId}
                    onValueChange={(value) => {
                      updateProduct(product.tempId, "categoryTempId", value)
                      updateProduct(
                        product.tempId,
                        "subcategoryTempId",
                        undefined
                      )
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {state.categories.map((cat) => (
                        <SelectItem key={cat.tempId} value={cat.tempId}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={product.subcategoryTempId ?? "none"}
                    onValueChange={(value) =>
                      updateProduct(
                        product.tempId,
                        "subcategoryTempId",
                        value === "none" ? undefined : value
                      )
                    }
                    disabled={
                      getSubcategoriesForCategory(product.categoryTempId)
                        .length === 0
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="--" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Ninguna --</SelectItem>
                      {getSubcategoriesForCategory(product.categoryTempId).map(
                        (sub) => (
                          <SelectItem key={sub.tempId} value={sub.tempId}>
                            {sub.name}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={product.sizeTempId ?? "none"}
                    onValueChange={(value) =>
                      updateProduct(
                        product.tempId,
                        "sizeTempId",
                        value === "none" ? undefined : value
                      )
                    }
                    disabled={state.sizes.length === 0}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="--" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Ninguno --</SelectItem>
                      {state.sizes.map((size) => (
                        <SelectItem key={size.tempId} value={size.tempId}>
                          {size.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={product.price || ""}
                    onChange={(e) =>
                      updateProduct(
                        product.tempId,
                        "price",
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                    placeholder="0"
                    className="h-9"
                    min={0}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={product.standAlone}
                    onCheckedChange={(checked) =>
                      updateProduct(
                        product.tempId,
                        "standAlone",
                        checked === true
                      )
                    }
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={product.combinableHalf}
                    onCheckedChange={(checked) =>
                      updateProduct(
                        product.tempId,
                        "combinableHalf",
                        checked === true
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-9 w-full justify-between",
                          !product.combinableWithCategoryTempIds?.length &&
                            "text-muted-foreground"
                        )}
                      >
                        <span className="truncate">
                          {product.combinableWithCategoryTempIds?.length
                            ? product.combinableWithCategoryTempIds
                                .map(
                                  (id) =>
                                    state.categories.find(
                                      (c) => c.tempId === id
                                    )?.name
                                )
                                .filter(Boolean)
                                .join(", ")
                            : "Ninguna"}
                        </span>
                        <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <div className="space-y-1">
                        {state.categories.map((cat) => {
                          const isSelected =
                            product.combinableWithCategoryTempIds?.includes(
                              cat.tempId
                            ) ?? false
                          return (
                            <button
                              type="button"
                              key={cat.tempId}
                              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted"
                              onClick={() => {
                                const current =
                                  product.combinableWithCategoryTempIds ?? []
                                const updated = isSelected
                                  ? current.filter((id) => id !== cat.tempId)
                                  : [...current, cat.tempId]
                                updateProduct(
                                  product.tempId,
                                  "combinableWithCategoryTempIds",
                                  updated.length > 0 ? updated : undefined
                                )
                              }}
                            >
                              <Checkbox checked={isSelected} tabIndex={-1} />
                              <span className="text-sm">{cat.name}</span>
                            </button>
                          )
                        })}
                        {state.categories.length === 0 && (
                          <p className="px-2 py-1 text-muted-foreground text-sm">
                            No hay categorías
                          </p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeProduct(product.tempId)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {state.products.length > 10 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              Mostrando {(currentPage - 1) * itemsPerPage + 1}-
              {Math.min(currentPage * itemsPerPage, state.products.length)} de{" "}
              {state.products.length}
            </span>
            <Select
              value={String(itemsPerPage)}
              onValueChange={(value) => {
                setItemsPerPage(Number(value))
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-sm">por página</span>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <Button
        variant="outline"
        onClick={addProduct}
        className="w-full border-dashed"
        disabled={state.categories.length === 0}
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Agregar producto
      </Button>
    </div>
  )
}

function EmptyState({
  message,
  onAdd,
  addLabel,
}: {
  message: string
  onAdd: () => void
  addLabel: string
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="mb-4 text-muted-foreground text-sm">{message}</p>
      </div>
      <Button
        variant="outline"
        onClick={onAdd}
        className="w-full border-dashed"
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  )
}
