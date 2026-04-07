"use client"

import { api } from "@workspace/backend/_generated/api"
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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { useMutation } from "convex/react"
import { Ban } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { handleConvexError } from "@/lib/error-handling"

interface BanUserDialogProps {
  user: {
    _id: string
    name: string
    email: string
    banned?: boolean | null
  } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type BanDuration = "permanent" | "1day" | "7days" | "30days" | "custom"

export function BanUserDialog({
  user,
  open,
  onOpenChange,
}: BanUserDialogProps) {
  const [banReason, setBanReason] = useState("")
  const [banDuration, setBanDuration] = useState<BanDuration>("permanent")
  const [customDays, setCustomDays] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const setUserBanStatus = useMutation(api.superAdmin.users.setUserBanStatus)

  const calculateExpiry = (): number | undefined => {
    if (banDuration === "permanent") return undefined

    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000

    switch (banDuration) {
      case "1day":
        return now + dayInMs
      case "7days":
        return now + 7 * dayInMs
      case "30days":
        return now + 30 * dayInMs
      case "custom": {
        const days = Number.parseInt(customDays, 10)
        if (Number.isNaN(days) || days <= 0) return undefined
        return now + days * dayInMs
      }
      default:
        return undefined
    }
  }

  const handleBan = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      await setUserBanStatus({
        userId: user._id,
        banned: true,
        banReason: banReason || undefined,
        banExpires: calculateExpiry(),
      })
      toast.success(`${user.name} ha sido bloqueado`)
      onOpenChange(false)
      // Reset form
      setBanReason("")
      setBanDuration("permanent")
      setCustomDays("")
    } catch (error) {
      toast.error(handleConvexError(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-500" />
            Bloquear Usuario
          </AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que quieres bloquear a{" "}
            <strong>{user?.name}</strong> ({user?.email})? El usuario no podrá
            acceder al sistema mientras esté bloqueado.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="banReason">Razón del bloqueo (opcional)</Label>
            <Textarea
              id="banReason"
              placeholder="Describe la razón del bloqueo..."
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="banDuration">Duración del bloqueo</Label>
            <Select
              value={banDuration}
              onValueChange={(value) => setBanDuration(value as BanDuration)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona la duración" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="permanent">Permanente</SelectItem>
                <SelectItem value="1day">1 día</SelectItem>
                <SelectItem value="7days">7 días</SelectItem>
                <SelectItem value="30days">30 días</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {banDuration === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="customDays">Número de días</Label>
              <Input
                id="customDays"
                type="number"
                min="1"
                placeholder="Ingresa el número de días"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
              />
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBan}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? "Bloqueando..." : "Bloquear Usuario"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
