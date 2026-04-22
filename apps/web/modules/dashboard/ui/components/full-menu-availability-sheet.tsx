"use client"

import { api } from "@workspace/backend/_generated/api"
import type { Id } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import type { Column } from "@workspace/ui/components/data-table"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useMutation, useQuery } from "convex/react"
import {
	CheckCircleIcon,
	Loader2Icon,
	MapPinIcon,
	TrashIcon,
	XCircleIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"
import { DASHBOARD_VIEWS } from "../../constants"

interface FullMenuAvailabilitySheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	// Search props
	searchValue: string
	onSearchChange: (value: string) => void
	// Filter props
	categoryFilter: string
	onCategoryFilterChange: (value: string) => void
	subcategoryFilter: string
	onSubcategoryFilterChange: (value: string) => void
	// Selection props
	selectedProducts: Set<string>
	onSelectProduct: (productId: string, checked: boolean) => void
	onSelectAllProducts: (productIds: string[], checked: boolean) => void
	// Bulk actions
	onBulkAvailability: () => void
	onBatchDelete: () => void
}

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
	externalCode?: string
	instructions?: string
	componentsId?: Id<"menuProducts">[]
	organizationId: string
	categoryName: string
	subcategoryName?: string
	sizeName: string | null
	availability: Record<string, boolean>
}

export const FullMenuAvailabilitySheet = ({
	open,
	onOpenChange,
	searchValue,
	onSearchChange,
	categoryFilter,
	onCategoryFilterChange,
	subcategoryFilter,
	onSubcategoryFilterChange,
	selectedProducts,
	onSelectProduct,
	onSelectAllProducts,
	onBulkAvailability,
	onBatchDelete,
}: FullMenuAvailabilitySheetProps) => {
	const { activeOrganizationId } = useOrganization()

	// Local pagination state
	const [localCursor, setLocalCursor] = useState<string | null>(null)
	const [localPrevCursors, setLocalPrevCursors] = useState<string[]>([])
	const [localPageSize, setLocalPageSize] = useState<number>(10)

	// Reset pagination when sheet opens
	useEffect(() => {
		if (open) {
			setLocalCursor(null)
			setLocalPrevCursors([])
			setLocalPageSize(10)
		}
	}, [open])

	const locations = useQuery(
		api.private.restaurantLocations.list,
		activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
	)
	const allCategories = useQuery(
		api.private.menuProductCategories.listAll,
		activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
	)
	const allSubcategories = useQuery(
		api.private.menuProductSubcategories.listAll,
		activeOrganizationId ? { organizationId: activeOrganizationId } : "skip"
	)

	const filterKey = `${searchValue.trim()}-${categoryFilter}-${subcategoryFilter}`

	const products = useQuery(
		api.private.menuProducts.list,
		activeOrganizationId
			? {
				organizationId: activeOrganizationId,
				paginationOpts: { numItems: localPageSize, cursor: localCursor },
				searchQuery: searchValue.trim() || undefined,
				categoryId:
					categoryFilter !== "all"
						? (categoryFilter as Id<"menuProductCategories">)
						: undefined,
				subcategoryId:
					subcategoryFilter !== "all"
						? (subcategoryFilter as Id<"menuProductSubcategories">)
						: undefined,
				sheetId: "availability",
				filterKey,
			}
			: "skip"
	)

	const toggleAvailability = useMutation(
		api.private.menuProductAvailability.toggleAvailability
	)

	const RestaurantsIcon = DASHBOARD_VIEWS["/restaurant-locations"].icon

	// Loading state for individual toggles
	const [togglingAvailability, setTogglingAvailability] = useState<
		Map<string, boolean>
	>(new Map())

	// Availability overrides for immediate UI updates
	const [availabilityOverrides, setAvailabilityOverrides] = useState<
		Map<string, boolean>
	>(new Map())

	const handleToggleAvailability = useCallback(
		async (
			productId: string,
			locationId: string,
			currentAvailability: boolean
		) => {
			if (!activeOrganizationId) return

			const toggleKey = `${productId}-${locationId}`

			setTogglingAvailability((prev) => new Map(prev.set(toggleKey, true)))

			try {
				await toggleAvailability({
					organizationId: activeOrganizationId,
					productId: productId as Id<"menuProducts">,
					locationId: locationId as Id<"restaurantLocations">,
					available: !currentAvailability,
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
		[activeOrganizationId, toggleAvailability]
	)

	const transformedProducts: ProductFromList[] =
		(products?.page as ProductFromList[]) || []

	const filteredProducts = useMemo(() => {
		return transformedProducts
	}, [transformedProducts])

	// Selection state for table header checkbox
	const isAllSelected =
		filteredProducts.length > 0 &&
		filteredProducts.every((p) => selectedProducts.has(p._id))
	const isIndeterminate = selectedProducts.size > 0 && !isAllSelected

	// Pagination functions
	const handleNext = () => {
		if (products?.continueCursor) {
			setLocalPrevCursors(
				localCursor ? [...localPrevCursors, localCursor] : localPrevCursors
			)
			setLocalCursor(products.continueCursor)
		}
	}

	const handlePrev = () => {
		if (localPrevCursors.length > 0) {
			const newPrevCursors = [...localPrevCursors]
			const prevCursor = newPrevCursors.pop()
			setLocalPrevCursors(newPrevCursors)
			setLocalCursor(prevCursor ?? null)
		}
	}

	const resetPagination = () => {
		setLocalCursor(null)
		setLocalPrevCursors([])
	}

	const handleToggleSelectAll = useCallback(
		(checked: boolean | "indeterminate") => {
			const shouldSelect = checked === "indeterminate" ? true : checked
			onSelectAllProducts(
				filteredProducts.map((p) => p._id),
				shouldSelect
			)
		},
		[filteredProducts, onSelectAllProducts]
	)

	// Table columns definition
	const tableColumns = useMemo(() => {
		const columns: Column<ProductFromList>[] = [
			{
				key: "select",
				header: (
					<Checkbox
						checked={isAllSelected}
						onCheckedChange={handleToggleSelectAll}
						aria-label="Seleccionar todos los productos"
					/>
				),
				render: (item: ProductFromList) => (
					<Checkbox
						checked={selectedProducts.has(item._id)}
						onCheckedChange={(checked) =>
							onSelectProduct(item._id, checked as boolean)
						}
						aria-label={`Seleccionar ${item.name}`}
					/>
				),
			},
			{
				key: "product",
				header: "Producto",
				render: (item: ProductFromList) => (
					<div className="min-w-0 max-w-[200px]">
						<p className="truncate font-medium">{item.name}</p>
						<p className="truncate text-muted-foreground text-sm">
							{item.categoryName}
							{item.subcategoryName && ` • ${item.subcategoryName}`}
						</p>
					</div>
				),
			},
		]

		// Add dynamic location columns
		if (locations && locations.length > 0) {
			locations.forEach((location) => {
				columns.push({
					key: `location-${location._id}`,
					header: (
						<div className="flex flex-col items-center">
							<span className="font-medium text-xs">{location.code}</span>
							<div
								className="size-2 rounded-full"
								style={{ backgroundColor: location.color || "#6b7280" }}
							/>
						</div>
					),
					render: (item: ProductFromList) => {
						const key = `${item._id}-${location._id}`
						const isAvailable =
							availabilityOverrides.get(key) ??
							item.availability[location._id] ??
							true
						const isToggling = togglingAvailability.get(key) || false

						return (
							<div className="flex justify-center">
								<Button
									variant="ghost"
									size="sm"
									className="h-8 w-8 p-0 hover:bg-transparent"
									onClick={() =>
										handleToggleAvailability(
											item._id,
											location._id,
											isAvailable
										)
									}
									disabled={isToggling}
								>
									{isToggling ? (
										<Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
									) : isAvailable ? (
										<CheckCircleIcon className="h-5 w-5 text-primary" />
									) : (
										<XCircleIcon className="h-5 w-5 text-red-500" />
									)}
								</Button>
							</div>
						)
					},
				})
			})
		}

		return columns
	}, [
		locations,
		isAllSelected,
		selectedProducts,
		handleToggleSelectAll,
		onSelectProduct,
		togglingAvailability,
		availabilityOverrides,
		handleToggleAvailability,
	])

	const hasLocations = locations && locations.length > 0

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="min-w-full gap-0 p-0">
				<SheetHeader className="border-b px-6 py-4">
					<SheetTitle className="flex items-center gap-2">
						<RestaurantsIcon className="h-5 w-5" />
						Disponibilidad Completa del Menú
					</SheetTitle>
					<SheetDescription>
						Gestiona la disponibilidad de todos los productos en cada sucursal
					</SheetDescription>
				</SheetHeader>
				<ScrollArea childProps={{ style: { display: "block" } }}>
					{!hasLocations ? (
						<div className="flex h-full flex-col items-center justify-center py-8 text-center">
							<MapPinIcon className="mb-2 h-8 w-8 text-muted-foreground" />
							<p className="text-muted-foreground text-sm">
								No hay sucursales configuradas
							</p>
						</div>
					) : (
						<DataViewerLayout
							className="p-6"
							viewMode="table"
							disableViewSwitch={true}
							onViewModeChange={() => { }} // No-op since disabled
							stickyColumns={2}
							searchProps={{
								value: searchValue,
								onChange: onSearchChange,
								placeholder: "Buscar por nombre...",
							}}
							filters={
								<>
									<Select
										value={categoryFilter}
										onValueChange={(value) => {
											onCategoryFilterChange(value)
											onSubcategoryFilterChange("all")
											resetPagination()
										}}
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
											onSubcategoryFilterChange(value)
											resetPagination()
										}}
										disabled={categoryFilter === "all"}
									>
										<SelectTrigger className="w-[200px]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">
												Todas las subcategorías
											</SelectItem>
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
								selectedProducts.size > 0 && (
									<div className="flex items-center gap-2">
										<Button
											onClick={onBulkAvailability}
											variant="outline"
											size="sm"
											className="flex items-center gap-2"
										>
											<MapPinIcon className="h-4 w-4" />
											Gestionar {selectedProducts.size} disponibilidad
											{selectedProducts.size !== 1 ? "es" : ""}
										</Button>
										<Button
											onClick={onBatchDelete}
											variant="destructive"
											size="sm"
											className="flex items-center gap-2"
										>
											<TrashIcon className="h-4 w-4" />
											Eliminar {selectedProducts.size} seleccionado
											{selectedProducts.size !== 1 ? "s" : ""}
										</Button>
									</div>
								)
							}
							data={filteredProducts}
							tableColumns={tableColumns}
							paginationProps={
								products !== undefined
									? {
										state: {
											pageSize: localPageSize,
											cursor: localCursor,
											prevCursors: localPrevCursors,
										},
										actions: {
											setPageSize: setLocalPageSize,
											handleNext,
											handlePrev,
											resetPagination,
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
							error={null}
							emptyState={{
								icon: <MapPinIcon className="h-12 w-12" />,
								title: searchValue
									? `No se encontraron productos que coincidan con "${searchValue}"`
									: "No hay productos creados aún",
								description: searchValue
									? `No hay productos que coincidan con "${searchValue}". Intenta con otro término de búsqueda.`
									: "Crea tu primer producto para empezar a construir tu menú",
							}}
							itemName={{ singular: "producto", plural: "productos" }}
						/>
					)}
				</ScrollArea>
			</SheetContent>
		</Sheet>
	)
}
