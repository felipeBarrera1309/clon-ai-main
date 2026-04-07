"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useMutation, useQuery } from "convex/react"
import { Building2, Loader2, Search } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"
import { useIsImplementor } from "@/hooks/use-platform-admin"
import { handleConvexError } from "@/lib/error-handling"

const createOrganizationSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  slug: z
    .string()
    .min(2, "El slug debe tener al menos 2 caracteres")
    .regex(
      /^[a-z0-9-]+$/,
      "El slug solo puede contener letras minúsculas, números y guiones"
    ),
})

type CreateOrganizationFormValues = z.infer<typeof createOrganizationSchema>

interface CreateOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: CreateOrganizationDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null)

  const isImplementor = useIsImplementor()

  const form = useForm<CreateOrganizationFormValues>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: "",
      slug: "",
    },
  })

  // Search users based on role
  const adminUsersData = useQuery(
    api.superAdmin.users.listUsers,
    isImplementor === false && searchQuery.length >= 2
      ? {
          limit: 10,
          offset: 0,
          search: searchQuery,
        }
      : "skip"
  )

  const implUsersData = useQuery(
    api.superAdmin.users.listImplementorUsers,
    isImplementor === true && searchQuery.length >= 2
      ? {
          limit: 10,
          offset: 0,
          search: searchQuery,
        }
      : "skip"
  )

  const usersData = isImplementor === true ? implUsersData : adminUsersData

  const createOrganization = useMutation(
    api.superAdmin.organizations.createOrganization
  )

  const selectedUser = usersData?.users.find((u) => u._id === selectedOwnerId)

  const onSubmit = async (values: CreateOrganizationFormValues) => {
    if (!selectedOwnerId) {
      toast.error("Selecciona un propietario para la organización")
      return
    }

    try {
      await createOrganization({
        name: values.name,
        slug: values.slug,
        ownerId: selectedOwnerId,
      })

      toast.success(`Organización "${values.name}" creada exitosamente`)
      onOpenChange(false)
      form.reset()
      setSearchQuery("")
      setSelectedOwnerId(null)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    form.setValue("name", name)
    // Only auto-generate if slug hasn't been manually edited
    const currentSlug = form.getValues("slug")
    if (!currentSlug || currentSlug === generateSlug(form.getValues("name"))) {
      form.setValue("slug", generateSlug(name))
    }
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single
      .trim()
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset()
      setSearchQuery("")
      setSelectedOwnerId(null)
    }
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Crear Nueva Organización
          </DialogTitle>
          <DialogDescription>
            Crea una nueva organización y asigna un propietario. El propietario
            tendrá acceso completo a la organización.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Organización</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Mi Restaurante"
                      {...field}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug (URL)</FormLabel>
                  <FormControl>
                    <Input placeholder="mi-restaurante" {...field} />
                  </FormControl>
                  <FormDescription>
                    Identificador único para URLs. Solo letras minúsculas,
                    números y guiones.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Owner Selection */}
            <div className="space-y-2">
              <Label>Propietario</Label>
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuario por nombre o email..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setSelectedOwnerId(null)
                  }}
                  className="pl-9"
                />
              </div>
              {searchQuery.length > 0 && searchQuery.length < 2 && (
                <p className="text-muted-foreground text-xs">
                  Escribe al menos 2 caracteres para buscar
                </p>
              )}
            </div>

            {/* Search Results */}
            {searchQuery.length >= 2 && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">
                  Resultados
                </Label>
                <div className="max-h-40 overflow-y-auto rounded-md border">
                  {usersData === undefined ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : usersData.users.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No se encontraron usuarios
                    </div>
                  ) : (
                    <div className="divide-y">
                      {usersData.users.map((user) => (
                        <button
                          key={user._id}
                          type="button"
                          className={`w-full p-3 text-left transition-colors hover:bg-muted ${
                            selectedOwnerId === user._id ? "bg-primary/10" : ""
                          }`}
                          onClick={() => setSelectedOwnerId(user._id)}
                        >
                          <div className="font-medium">{user.name}</div>
                          <div className="text-muted-foreground text-sm">
                            {user.email}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Selected Owner */}
            {selectedUser && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <Label className="text-muted-foreground text-xs">
                  Propietario seleccionado
                </Label>
                <div className="mt-1 font-medium">{selectedUser.name}</div>
                <div className="text-muted-foreground text-sm">
                  {selectedUser.email}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting || !selectedOwnerId}
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  "Crear Organización"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
