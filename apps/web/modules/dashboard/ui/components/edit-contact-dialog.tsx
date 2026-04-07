"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { api } from "@workspace/backend/_generated/api"
import type { Doc } from "@workspace/backend/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import { useMutation } from "convex/react"
import { EditIcon, UserIcon } from "lucide-react"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useOrganization } from "@/hooks/use-organization"
import { handleConvexError } from "@/lib/error-handling"

const editContactFormSchema = z.object({
  displayName: z.string().optional(),
  isBlocked: z.boolean(),
  lastKnownAddress: z.string().optional(),
})

type EditContactFormData = z.infer<typeof editContactFormSchema>

interface EditContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: Doc<"contacts"> | null
  onSuccess?: () => void
}

export const EditContactDialog = ({
  open,
  onOpenChange,
  contact,
  onSuccess,
}: EditContactDialogProps) => {
  const { activeOrganizationId } = useOrganization()
  const updateContact = useMutation(api.private.contacts.update)

  const form = useForm<EditContactFormData>({
    resolver: zodResolver(editContactFormSchema),
    defaultValues: {
      displayName: "",
      isBlocked: false,
      lastKnownAddress: "",
    },
  })

  // Update form when contact changes
  useEffect(() => {
    if (contact) {
      form.reset({
        displayName: contact.displayName || "",
        isBlocked: contact.isBlocked || false,
        lastKnownAddress: contact.lastKnownAddress || "",
      })
    }
  }, [contact, form])

  const handleSubmit = async (data: EditContactFormData) => {
    if (!contact || !activeOrganizationId) return

    try {
      await updateContact({
        organizationId: activeOrganizationId,
        contactId: contact._id,
        displayName: data.displayName || undefined,
        isBlocked: data.isBlocked,
        lastKnownAddress: data.lastKnownAddress || undefined,
      })

      toast.success("Contacto actualizado exitosamente")
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(handleConvexError(error))
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset()
    }
    onOpenChange(newOpen)
  }

  if (!contact) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EditIcon className="h-5 w-5" />
            Editar Contacto
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6"
          >
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <UserIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">
                  {contact.displayName || "Sin nombre"}
                </div>
                <div className="font-mono text-muted-foreground text-sm">
                  {contact.phoneNumber}
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de Contacto</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Juan Pérez"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lastKnownAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ej: Calle 10 #20-30, Bogotá"
                      {...field}
                      value={field.value || ""}
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isBlocked"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Bloquear Contacto
                    </FormLabel>
                    <div className="text-muted-foreground text-sm">
                      Si está bloqueado, no podrá iniciar nuevas conversaciones
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">Actualizar Contacto</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
