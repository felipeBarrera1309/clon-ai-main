"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Building2, MapPin } from "lucide-react"

interface Location {
  _id: string
  name: string
  code: string
  address: string
  available: boolean
}

interface LocationsTabProps {
  locations: Location[]
}

export function LocationsTab({ locations }: LocationsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Ubicaciones del Restaurante
        </CardTitle>
        <CardDescription>
          {locations.length} ubicaciones configuradas
        </CardDescription>
      </CardHeader>
      <CardContent>
        {locations.length > 0 ? (
          <div className="space-y-3">
            {locations.map((location) => (
              <div
                key={location._id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{location.name}</div>
                    <div className="text-muted-foreground text-sm">
                      {location.code} · {location.address}
                    </div>
                  </div>
                </div>
                <Badge
                  variant={location.available ? "default" : "secondary"}
                  className={
                    location.available
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }
                >
                  {location.available ? "Disponible" : "No disponible"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            No hay ubicaciones configuradas
          </div>
        )}
      </CardContent>
    </Card>
  )
}
