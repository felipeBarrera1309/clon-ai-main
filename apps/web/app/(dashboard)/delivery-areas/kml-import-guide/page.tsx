"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  AlertCircleIcon,
  CheckCircleIcon,
  DownloadIcon,
  FileTextIcon,
  MapPinIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

const kmlStructure = [
  {
    element: "Document",
    required: true,
    description: "Contenedor principal del archivo KML",
    example: "<Document>...</Document>",
  },
  {
    element: "Folder",
    required: false,
    description: "Agrupación opcional de áreas (se usa como restaurante)",
    example: "<Folder><name>Sede Principal</name>...</Folder>",
  },
  {
    element: "Placemark",
    required: true,
    description: "Área de entrega individual",
    example: "<Placemark>...</Placemark>",
  },
  {
    element: "name",
    required: true,
    description: "Nombre único del área de entrega",
    example: "<name>Zona Centro</name>",
  },
  {
    element: "description",
    required: false,
    description: "Información adicional (precios, horarios, etc.)",
    example: "<description>Domicilio $5,500</description>",
  },
  {
    element: "Polygon",
    required: true,
    description: "Geometría del área de entrega",
    example: "<Polygon>...</Polygon>",
  },
  {
    element: "coordinates",
    required: true,
    description: "Coordenadas geográficas (longitud,latitud,elevación)",
    example: "<coordinates>-74.0775,4.6025,0</coordinates>",
  },
]

const exampleKML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Áreas de Entrega - Restaurante</name>
    <Folder>
      <name>Sede Principal</name>
      <Placemark>
        <name>Zona Centro</name>
        <description><![CDATA[
          <b>Domicilio:</b> $5,500
          <br><b>Tiempo aproximado:</b> 25-35 minutos
          <br><b>Horario:</b> Lunes a Domingo 11:00 AM - 10:00 PM
        ]]></description>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
                -74.075000,4.600000,0
                -74.080000,4.600000,0
                -74.080000,4.605000,0
                -74.075000,4.605000,0
                -74.075000,4.600000,0
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
    </Folder>
  </Document>
</kml>`

export default function KMLImportGuidePage() {
  const [isDownloading, setIsDownloading] = useState(false)

  const downloadExampleKML = async () => {
    setIsDownloading(true)

    try {
      // Create blob with KML content
      const blob = new Blob([exampleKML], {
        type: "application/vnd.google-earth.kml+xml;charset=utf-8;",
      })

      // Create download link
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", "plantilla-areas-entrega.kml")
      link.style.visibility = "hidden"

      // Add to DOM, click, and remove
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up
      URL.revokeObjectURL(url)

      toast.success("Archivo de ejemplo descargado exitosamente")
    } catch (error) {
      console.error("Download error:", error)
      toast.error("Error al descargar el archivo de ejemplo")
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-4 text-center">
          <h1 className="font-bold text-4xl tracking-tight">
            🗺️ Guía de Importación KML
          </h1>
          <p className="mx-auto max-w-3xl text-muted-foreground text-xl">
            Aprende cómo importar áreas de entrega desde archivos KML de Google
            My Maps. Crea zonas de cobertura geográficas para tu sistema de
            entregas.
          </p>
        </div>

        {/* Quick Start */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              Inicio Rápido
            </CardTitle>
            <CardDescription>
              Los pasos básicos para importar tus áreas de entrega exitosamente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600">
                  1
                </div>
                <div>
                  <h4 className="font-semibold">Crea en Google My Maps</h4>
                  <p className="text-muted-foreground text-sm">
                    Dibuja tus áreas de entrega usando Google My Maps
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600">
                  2
                </div>
                <div>
                  <h4 className="font-semibold">Agrega Información</h4>
                  <p className="text-muted-foreground text-sm">
                    Incluye precios de domicilio y tiempos de entrega
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600">
                  3
                </div>
                <div>
                  <h4 className="font-semibold">Importa y Verifica</h4>
                  <p className="text-muted-foreground text-sm">
                    Sube el archivo KML y revisa la vista previa antes de
                    importar
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              <Button
                onClick={downloadExampleKML}
                disabled={isDownloading}
                className="flex items-center gap-2"
              >
                <DownloadIcon className="h-4 w-4" />
                {isDownloading ? "Descargando..." : "Descargar Plantilla KML"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* KML Structure */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileTextIcon className="h-5 w-5" />
              Estructura del Archivo KML
            </CardTitle>
            <CardDescription>
              Elementos requeridos y opcionales en un archivo KML válido
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Elemento</TableHead>
                    <TableHead>Obligatorio</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Ejemplo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kmlStructure.map((item) => (
                    <TableRow key={item.element}>
                      <TableCell className="font-mono font-semibold">
                        {item.element}
                      </TableCell>
                      <TableCell>
                        {item.required ? (
                          <Badge
                            variant="default"
                            className="bg-red-100 text-red-800"
                          >
                            Sí
                          </Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {item.description}
                      </TableCell>
                      <TableCell className="rounded bg-muted/50 px-2 py-1 font-mono text-xs">
                        {item.example}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Important Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5 text-orange-600" />
              Reglas Importantes
            </CardTitle>
            <CardDescription>
              Consideraciones críticas para evitar errores durante la
              importación
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <h4 className="font-semibold text-green-700">
                  ✅ Requisitos Obligatorios
                </h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>
                      Cada área debe tener un nombre único dentro de la
                      organización
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>
                      Las coordenadas deben estar en formato:
                      longitud,latitud,elevación
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>
                      Los polígonos deben tener al menos 3 coordenadas
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>El archivo debe estar codificado en UTF-8</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>
                      Las coordenadas deben estar dentro del territorio
                      colombiano
                    </span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-orange-700">
                  ⚠️ Consideraciones Especiales
                </h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" />
                    <span>
                      Los folders se usan para agrupar áreas por restaurante
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" />
                    <span>
                      La información de precios se extrae automáticamente de las
                      descripciones
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" />
                    <span>
                      Los polígonos deben estar cerrados (primer y último punto
                      coinciden)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" />
                    <span>
                      Revisa la vista previa antes de confirmar la importación
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* How to Create KML */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinIcon className="h-5 w-5" />
              Cómo Crear un Archivo KML
            </CardTitle>
            <CardDescription>
              Pasos para crear áreas de entrega usando Google My Maps
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <h4 className="font-semibold">
                  Método 1: Google My Maps (Recomendado)
                </h4>
                <ol className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600 text-xs">
                      1
                    </span>
                    <span>
                      Ve a{" "}
                      <a
                        href="https://maps.google.com"
                        className="text-blue-600 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Google My Maps
                      </a>
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600 text-xs">
                      2
                    </span>
                    <span>
                      Crea un nuevo mapa y usa la herramienta de polígonos
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600 text-xs">
                      3
                    </span>
                    <span>Dibuja cada área de entrega como un polígono</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600 text-xs">
                      4
                    </span>
                    <span>Agrega descripciones con precios y tiempos</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600 text-xs">
                      5
                    </span>
                    <span>Exporta como archivo KML</span>
                  </li>
                </ol>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Método 2: Edición Manual</h4>
                <ol className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-600 text-xs">
                      1
                    </span>
                    <span>Descarga la plantilla KML de ejemplo</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-600 text-xs">
                      2
                    </span>
                    <span>Abre el archivo en un editor de texto</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-600 text-xs">
                      3
                    </span>
                    <span>Modifica nombres, coordenadas y descripciones</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-600 text-xs">
                      4
                    </span>
                    <span>Guarda con extensión .kml</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-600 text-xs">
                      5
                    </span>
                    <span>Importa en el sistema</span>
                  </li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Example Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Vista Previa de la Plantilla KML</CardTitle>
            <CardDescription>
              Estructura del archivo KML de ejemplo con áreas de entrega
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <h4 className="mb-2 font-semibold">Estructura del Archivo</h4>
                <pre className="overflow-x-auto rounded border bg-background p-3 text-xs">
                  {`📁 Document
  ├── 📁 Folder: "Sede Principal"
  │   └── 🗺️ Placemark: "Zona Centro"
  │       ├── 📍 Name: "Zona Centro"
  │       ├── 📝 Description: "Domicilio $5,500..."
  │       └── 🔶 Polygon: 5 coordenadas`}
                </pre>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Área</TableHead>
                      <TableHead className="min-w-[200px]">
                        Descripción
                      </TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Tiempo</TableHead>
                      <TableHead>Coordenadas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Zona Centro</TableCell>
                      <TableCell className="text-sm">
                        Área comercial del centro histórico
                      </TableCell>
                      <TableCell className="font-mono">$5,500</TableCell>
                      <TableCell>25-35 min</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline">5 puntos</Badge>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card>
          <CardHeader>
            <CardTitle>💡 Consejos Útiles</CardTitle>
            <CardDescription>
              Tips para hacer la importación más eficiente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <h4 className="font-semibold">Preparación del Archivo</h4>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• Usa Google My Maps para dibujar áreas precisas</li>
                  <li>• Incluye información de precios en las descripciones</li>
                  <li>• Usa nombres descriptivos y únicos para cada área</li>
                  <li>
                    • Verifica que los polígonos estén correctamente cerrados
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold">Validación de Datos</h4>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• Revisa la vista previa antes de importar</li>
                  <li>• Verifica que las coordenadas estén en Colombia</li>
                  <li>• Asegúrate de que los nombres sean únicos</li>
                  <li>
                    • Confirma que los precios estén correctamente extraídos
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Common Issues */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5 text-red-600" />
              Problemas Comunes y Soluciones
            </CardTitle>
            <CardDescription>
              Errores frecuentes y cómo solucionarlos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <h4 className="font-semibold text-red-700">
                  ❌ Coordenadas Inválidas
                </h4>
                <p className="text-muted-foreground text-sm">
                  Las coordenadas están fuera del rango colombiano o mal
                  formateadas.
                </p>
                <p className="font-medium text-sm">Solución:</p>
                <ul className="space-y-1 text-muted-foreground text-sm">
                  <li>• Verifica formato: longitud,latitud,elevación</li>
                  <li>• Colombia: Lat -4° to 13°, Lng -82° to -66°</li>
                  <li>• Usa Google Maps para validar posiciones</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-red-700">
                  ❌ Polígonos Malformados
                </h4>
                <p className="text-muted-foreground text-sm">
                  Los polígonos no están cerrados o tienen menos de 3
                  coordenadas.
                </p>
                <p className="font-medium text-sm">Solución:</p>
                <ul className="space-y-1 text-muted-foreground text-sm">
                  <li>• Mínimo 3 coordenadas por polígono</li>
                  <li>• Primer y último punto deben coincidir</li>
                  <li>• Evita auto-intersecciones</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
