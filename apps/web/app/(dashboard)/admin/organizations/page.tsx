"use client"

import { api } from "@workspace/backend/_generated/api"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { Column } from "@workspace/ui/components/data-table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { DataViewerLayout } from "@workspace/ui/layout/data-viewer-layout"
import { useQuery } from "convex/react"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import { useIsImplementor } from "@/hooks/use-platform-admin"
import { CreateOrganizationDialog } from "@/modules/admin/ui/components/create-organization-dialog"

type OrganizationWithStats = {
  _id: string
  organizationId: string
  name?: string
  slug?: string
  logo?: string | null
  existsInBetterAuth: boolean
  conversationsCount: number
  contactsCount: number
  ordersCount: number
  menuProductsCount: number
  locationsCount: number
  deliveryAreasCount: number
  agentConfigId?: string
  whatsappConfigId?: string
}

export default function OrganizationsPage() {
  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Pagination state
  const [pageSize, setPageSize] = useState(25)
  const [offset, setOffset] = useState(0)
  const [prevOffsets, setPrevOffsets] = useState<number[]>([])

  // Search state
  const {
    value: searchValue,
    debouncedValue: searchQuery,
    setValue: setSearchValue,
  } = useDebouncedSearch("", 300)

  // View mode state
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const isMobile = useIsMobile()

  useEffect(() => {
    setViewMode(isMobile ? "cards" : "table")
  }, [isMobile])

  const isImplementor = useIsImplementor()

  // Get organizations — scoped for implementors, global for admins
  const adminOrgsResult = useQuery(
    api.superAdmin.organizations.listAllOrganizations,
    isImplementor === false
      ? { limit: pageSize, offset: offset, search: searchQuery }
      : "skip"
  )
  const implementorOrgsResult = useQuery(
    api.superAdmin.organizations.listImplementorOrganizations,
    isImplementor === true
      ? { limit: pageSize, offset: offset, search: searchQuery }
      : "skip"
  )
  const organizationsResult =
    isImplementor === true ? implementorOrgsResult : adminOrgsResult

  // Extract data from result or use defaults
  const organizations = organizationsResult?.organizations
  const total = organizationsResult?.total ?? 0
  const hasMore = organizationsResult?.hasMore ?? false
  const adminStatsResult = useQuery(
    api.superAdmin.organizations.getOrganizationStatsBatch,
    isImplementor === false && organizations && organizations.length > 0
      ? { organizationIds: organizations.map((org) => org.organizationId) }
      : "skip"
  )
  const implementorStatsResult = useQuery(
    api.superAdmin.organizations.getOrganizationStatsBatchAny,
    isImplementor === true && organizations && organizations.length > 0
      ? { organizationIds: organizations.map((org) => org.organizationId) }
      : "skip"
  )
  const organizationStatsResult =
    isImplementor === true ? implementorStatsResult : adminStatsResult

  // Paginate - handled by backend now
  const paginatedOrgs = organizations

  // Pagination handlers
  const handleNext = () => {
    if (hasMore) {
      setPrevOffsets((prev) => [...prev, offset])
      setOffset((prev) => prev + pageSize)
    }
  }

  const handlePrev = () => {
    if (prevOffsets.length > 0) {
      const newPrevOffsets = [...prevOffsets]
      const newOffset = newPrevOffsets.pop()
      setPrevOffsets(newPrevOffsets)
      if (newOffset !== undefined) {
        setOffset(newOffset)
      }
    } else if (offset > 0) {
      // Fallback normal logic if prevCursors gets out of sync
      setOffset((prev) => Math.max(0, prev - pageSize))
    }
  }

  const resetPagination = useCallback(() => {
    setOffset(0)
    setPrevOffsets([])
  }, [])

  // Reset pagination when search changes
  useEffect(() => {
    if (typeof searchQuery === "string") {
      setOffset(0)
      setPrevOffsets([])
    }
  }, [searchQuery])

  // Transform data for DataViewerLayout
  const transformedOrgs: (OrganizationWithStats & { _id: string })[] =
    paginatedOrgs?.map((org) => ({
      ...org,
      ...(organizationStatsResult?.statsByOrganization?.[org.organizationId] ??
        {}),
      _id: org.organizationId,
    })) ?? []

  // Define columns
  const columns: Column<OrganizationWithStats & { _id: string }>[] = [
    {
      key: "organization",
      header: "Organización",
      render: (org) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium">{org.name || org.organizationId}</div>
            {org.name && (
              <div className="text-muted-foreground text-xs">
                {org.organizationId}
              </div>
            )}
            <div className="mt-1 flex items-center gap-2 text-xs">
              {org.existsInBetterAuth ? (
                <Badge
                  variant="outline"
                  className="border-green-600 text-green-600 text-xs"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Sincronizada
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-600 text-amber-600 text-xs"
                >
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Sin sincronizar
                </Badge>
              )}
              {org.agentConfigId && (
                <Badge variant="outline" className="text-xs">
                  IA Configurada
                </Badge>
              )}
              {org.whatsappConfigId && (
                <Badge variant="outline" className="text-xs">
                  WhatsApp
                </Badge>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "locations",
      header: "Ubicaciones",
      render: (org) => (
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span>{org.locationsCount}</span>
        </div>
      ),
    },
    {
      key: "conversations",
      header: "Conversaciones",
      render: (org) => (
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span>{org.conversationsCount}</span>
        </div>
      ),
    },
    {
      key: "orders",
      header: "Pedidos",
      render: (org) => (
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <span>{org.ordersCount}</span>
        </div>
      ),
    },
    {
      key: "contacts",
      header: "Contactos",
      render: (org) => (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{org.contactsCount}</span>
        </div>
      ),
    },
    {
      key: "products",
      header: "Productos",
      render: (org) => <span>{org.menuProductsCount}</span>,
    },
    {
      key: "actions",
      header: "Acciones",
      render: (org) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/admin/organizations/${org.organizationId}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Ver detalles
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href={`/admin/organizations/${org.organizationId}/customization`}
              >
                <Settings className="mr-2 h-4 w-4" />
                Personalización IA
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={`/admin/organizations/${org.organizationId}/whatsapp`}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Configurar WhatsApp
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  // Render card function
  const renderCard = (org: OrganizationWithStats & { _id: string }) => (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {org.name || org.organizationId}
              </CardTitle>
              {org.name && (
                <div className="text-muted-foreground text-xs">
                  {org.organizationId}
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {org.existsInBetterAuth ? (
                  <Badge
                    variant="outline"
                    className="border-green-600 text-green-600 text-xs"
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Sincronizada
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-600 text-amber-600 text-xs"
                  >
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Sin sincronizar
                  </Badge>
                )}
                {org.agentConfigId && (
                  <Badge variant="outline" className="text-xs">
                    IA
                  </Badge>
                )}
                {org.whatsappConfigId && (
                  <Badge variant="outline" className="text-xs">
                    WhatsApp
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/admin/organizations/${org.organizationId}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ver detalles
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  href={`/admin/organizations/${org.organizationId}/customization`}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Personalización IA
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Ubicaciones</p>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{org.locationsCount}</span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Conversaciones</p>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{org.conversationsCount}</span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Pedidos</p>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{org.ordersCount}</span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Contactos</p>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{org.contactsCount}</span>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Button asChild variant="outline" className="w-full">
            <Link href={`/admin/organizations/${org.organizationId}`}>
              Ver detalles
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  if (isImplementor === undefined) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">
            {isImplementor ? "Mis Organizaciones" : "Organizaciones"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isImplementor
              ? "Organizaciones que gestionas"
              : "Gestiona todas las organizaciones registradas en el sistema"}
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Organización
        </Button>
      </div>

      <CreateOrganizationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <DataViewerLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchProps={{
          value: searchValue,
          onChange: setSearchValue,
          placeholder: "Buscar organizaciones...",
        }}
        data={transformedOrgs}
        tableColumns={columns}
        renderCard={renderCard}
        paginationProps={{
          state: {
            pageSize,
            cursor: offset.toString(),
            prevCursors: prevOffsets.map(String),
          },
          actions: {
            setPageSize: (size) => {
              setPageSize(size)
              resetPagination()
            },
            handleNext,
            handlePrev,
            resetPagination,
          },
          info: {
            isDone: !hasMore,
            continueCursor: hasMore ? (offset + pageSize).toString() : null,
            totalItems: total,
          },
          pageSizeOptions: [10, 25, 50, 100],
        }}
        loading={organizations === undefined}
        emptyState={{
          icon: <Building2 className="h-12 w-12" />,
          title: searchQuery
            ? "No se encontraron organizaciones"
            : "No hay organizaciones",
          description: searchQuery
            ? `No hay organizaciones que coincidan con "${searchQuery}"`
            : "Las organizaciones aparecerán aquí cuando se registren",
        }}
        itemName={{ singular: "organización", plural: "organizaciones" }}
      />
    </div>
  )
}
