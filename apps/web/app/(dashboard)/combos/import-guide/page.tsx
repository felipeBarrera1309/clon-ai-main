"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { DownloadIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

const exampleCSV = `id_combo,nombre_combo,descripcion_combo,precio_base_combo,activo_combo,link_imagen_combo,slot_orden,slot_nombre,slot_min,slot_max,opcion_orden,opcion_default,opcion_recargo,menu_product_id,menu_producto,menu_categoria,menu_tamaño,deshabilitar_en
,Combo Burger,Combo hamburguesa con bebida y acompañante,25000,si,,1,Proteína,1,1,1,si,0,,Hamburguesa sencilla,Hamburguesas,,
,Combo Burger,Combo hamburguesa con bebida y acompañante,25000,si,,1,Proteína,1,1,2,no,3000,,Hamburguesa doble,Hamburguesas,,
,Combo Burger,Combo hamburguesa con bebida y acompañante,25000,si,,2,Bebida,1,1,1,si,0,,Coca Cola,Bebidas,350ml,
,Combo Burger,Combo hamburguesa con bebida y acompañante,25000,si,,2,Bebida,1,1,2,no,0,,Limonada,Bebidas,,SE1
`

export default function ComboImportGuidePage() {
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = () => {
    setIsDownloading(true)
    try {
      const blob = new Blob([exampleCSV], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "ejemplo-combos-importacion.csv"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success("Ejemplo descargado")
    } catch {
      toast.error("No se pudo descargar el ejemplo")
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="font-bold text-3xl">Guía de Importación de Combos</h1>
          <p className="mt-2 text-muted-foreground">
            Usa este formato para importar o actualizar combos por archivo.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Columnas requeridas</CardTitle>
            <CardDescription>
              El archivo representa una opción por fila (estructura
              denormalizada).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>Combo:</strong> id_combo (opcional), nombre_combo,
              descripcion_combo, precio_base_combo, activo_combo,
              link_imagen_combo.
            </p>
            <p>
              <strong>Slot:</strong> slot_orden, slot_nombre, slot_min,
              slot_max.
            </p>
            <p>
              <strong>Opción:</strong> opcion_orden, opcion_default,
              opcion_recargo, menu_product_id o fallback por menu_producto +
              menu_categoria + menu_tamaño.
            </p>
            <p>
              <strong>Disponibilidad:</strong> deshabilitar_en con códigos de
              sucursal separados por <code>;</code>.
            </p>
          </CardContent>
        </Card>

        <Button onClick={handleDownload} disabled={isDownloading}>
          <DownloadIcon className="mr-2 h-4 w-4" />
          {isDownloading ? "Descargando..." : "Descargar CSV de Ejemplo"}
        </Button>
      </div>
    </div>
  )
}
