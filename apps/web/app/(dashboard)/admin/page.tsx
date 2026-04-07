"use client"

import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "convex/react"
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  MessageSquare,
  ReceiptText,
  ShoppingCart,
  SlidersHorizontal,
  Users,
} from "lucide-react"
import Link from "next/link"
import { usePlatformSuperAdmin } from "@/hooks/use-platform-admin"

export default function AdminPage() {
  const isSuperAdmin = usePlatformSuperAdmin()
  const globalStats = useQuery(
    api.superAdmin.organizations.getGlobalPlatformStats
  )
  const isLoading = globalStats === undefined

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-bold text-3xl tracking-tight">
          Panel de Super Administrador
        </h1>
        <p className="mt-2 text-muted-foreground">
          Gestiona organizaciones, usuarios y configuraciones del sistema
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Organizaciones
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="font-bold text-2xl">
                  {globalStats?.totalOrganizations ?? 0}
                </div>
                <p className="text-muted-foreground text-xs">
                  Total en el sistema
                </p>
              </>
            )}
          </CardContent>
          <div className="absolute right-0 bottom-0 h-16 w-16 translate-x-4 translate-y-4 rounded-full bg-primary/10" />
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Usuarios</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="font-bold text-2xl">
                  {globalStats?.totalUsers ?? 0}
                </div>
                <p className="text-muted-foreground text-xs">
                  Usuarios registrados
                </p>
              </>
            )}
          </CardContent>
          <div className="absolute right-0 bottom-0 h-16 w-16 translate-x-4 translate-y-4 rounded-full bg-blue-500/10" />
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Conversaciones
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="font-bold text-2xl">
                  {globalStats?.totalConversations ?? 0}
                </div>
                <p className="text-muted-foreground text-xs">
                  En todas las organizaciones
                </p>
              </>
            )}
          </CardContent>
          <div className="absolute right-0 bottom-0 h-16 w-16 translate-x-4 translate-y-4 rounded-full bg-green-500/10" />
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Pedidos</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="font-bold text-2xl">
                  {globalStats?.totalOrders ?? 0}
                </div>
                <p className="text-muted-foreground text-xs">
                  Pedidos procesados
                </p>
              </>
            )}
          </CardContent>
          <div className="absolute right-0 bottom-0 h-16 w-16 translate-x-4 translate-y-4 rounded-full bg-orange-500/10" />
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Organizaciones
            </CardTitle>
            <CardDescription>
              Ver y gestionar todas las organizaciones del sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/admin/organizations">
                Ver Organizaciones
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-emerald-500" />
              Costos IA
            </CardTitle>
            <CardDescription>
              Revisar consumo AI consolidado y conciliación mensual
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/admin/costs">
                Ver Reporte
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              Gestión de Usuarios
            </CardTitle>
            <CardDescription>
              Administrar usuarios, roles y permisos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/admin/users">
                Ver Usuarios
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-emerald-500" />
              Permisos por Defecto
            </CardTitle>
            <CardDescription>
              Configurar permisos por defecto para nuevas organizaciones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/admin/platform-permissions">
                Abrir Editor
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {isSuperAdmin ? (
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-amber-500" />
                Debug Conversaciones
              </CardTitle>
              <CardDescription>
                Buscar y revisar conversaciones de cualquier organización
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/admin/conversations">
                  Ver Debug
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {isSuperAdmin ? (
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Escalaciones
              </CardTitle>
              <CardDescription>
                Revisa el histórico de motivos de escalación y casos recientes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/admin/escalations">
                  Ver Escalaciones
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
