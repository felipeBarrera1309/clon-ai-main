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
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Download,
  FileSpreadsheet,
  Info,
  MapPin,
  XCircle,
} from "lucide-react"
import Link from "next/link"

const CSVImportGuidePage = () => {
  return (
    <div className="container mx-auto max-w-4xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/delivery-areas">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Áreas de Entrega
          </Button>
        </Link>
        <div>
          <h1 className="font-bold text-3xl">Guía de Importación CSV</h1>
          <p className="text-muted-foreground">
            Aprende cómo importar áreas de entrega desde archivos CSV
          </p>
        </div>
      </div>

      {/* Quick Start */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Inicio Rápido
          </CardTitle>
          <CardDescription>
            Descarga la plantilla y sigue estos pasos para importar tus áreas de
            entrega
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <Download className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-medium">1. Descargar Plantilla</h3>
              <p className="text-muted-foreground text-sm">
                Obtén el archivo CSV con el formato correcto
              </p>
            </div>
            <div className="space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <FileSpreadsheet className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-medium">2. Completar Datos</h3>
              <p className="text-muted-foreground text-sm">
                Agrega tus áreas con coordenadas y información
              </p>
            </div>
            <div className="space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                <MapPin className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="font-medium">3. Importar</h3>
              <p className="text-muted-foreground text-sm">
                Sube tu archivo y revisa antes de confirmar
              </p>
            </div>
          </div>
          <div className="flex justify-center">
            <a
              href="/delivery-areas-import-template.csv"
              download="plantilla-areas-entrega.csv"
            >
              <Button className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Descargar Plantilla CSV
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Column Structure */}
      <Card>
        <CardHeader>
          <CardTitle>Estructura del Archivo CSV</CardTitle>
          <CardDescription>
            Columnas requeridas y opcionales para la importación
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Columna</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Requerida</TableHead>
                <TableHead>Descripción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono">area_name</TableCell>
                <TableCell>Texto</TableCell>
                <TableCell>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </TableCell>
                <TableCell>Nombre único del área de entrega</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">coordinates</TableCell>
                <TableCell>Texto</TableCell>
                <TableCell>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </TableCell>
                <TableCell>
                  Coordenadas del polígono en formato "lat,lng;lat,lng;..."
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">
                  restaurant_location_code
                </TableCell>
                <TableCell>Texto</TableCell>
                <TableCell>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </TableCell>
                <TableCell>Código de la sucursal del restaurante</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">is_active</TableCell>
                <TableCell>Booleano</TableCell>
                <TableCell>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </TableCell>
                <TableCell>
                  Si el área está activa (true/false, 1/0, sí/no)
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">description</TableCell>
                <TableCell>Texto</TableCell>
                <TableCell>
                  <XCircle className="h-4 w-4 text-gray-400" />
                </TableCell>
                <TableCell>Descripción o notas del área</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">delivery_fee</TableCell>
                <TableCell>Número</TableCell>
                <TableCell>
                  <XCircle className="h-4 w-4 text-gray-400" />
                </TableCell>
                <TableCell>Costo de domicilio en pesos colombianos</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">minimum_order</TableCell>
                <TableCell>Número</TableCell>
                <TableCell>
                  <XCircle className="h-4 w-4 text-gray-400" />
                </TableCell>
                <TableCell>Pedido mínimo en pesos colombianos</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">
                  estimated_delivery_time
                </TableCell>
                <TableCell>Texto</TableCell>
                <TableCell>
                  <XCircle className="h-4 w-4 text-gray-400" />
                </TableCell>
                <TableCell>Tiempo estimado (ej: "30-45 min")</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Coordinate Format */}
      <Card>
        <CardHeader>
          <CardTitle>Formato de Coordenadas</CardTitle>
          <CardDescription>
            Cómo especificar las coordenadas del polígono correctamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <h4 className="mb-2 font-medium">Formato Estándar</h4>
            <code className="text-sm">
              lat1,lng1;lat2,lng2;lat3,lng3;lat1,lng1
            </code>
          </div>

          <div className="rounded-lg bg-blue-50 p-4">
            <h4 className="mb-2 font-medium text-blue-800">Ejemplo</h4>
            <code className="break-all text-blue-700 text-sm">
              4.6097,-74.0817;4.6120,-74.0800;4.6100,-74.0750;4.6080,-74.0780;4.6097,-74.0817
            </code>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium text-green-600">✅ Requisitos</h4>
              <ul className="space-y-1 text-sm">
                <li>• Mínimo 3 puntos de coordenadas</li>
                <li>• Polígono cerrado (primer = último punto)</li>
                <li>• Latitud: -90 a 90</li>
                <li>• Longitud: -180 a 180</li>
                <li>• Separados por punto y coma (;)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-red-600">❌ Evitar</h4>
              <ul className="space-y-1 text-sm">
                <li>• Polígonos abiertos</li>
                <li>• Menos de 3 coordenadas</li>
                <li>• Coordenadas fuera de Colombia</li>
                <li>• Más de 50 vértices</li>
                <li>• Espacios extra o formato incorrecto</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Example Data */}
      <Card>
        <CardHeader>
          <CardTitle>Ejemplo de Datos</CardTitle>
          <CardDescription>
            Ejemplo de cómo debe verse tu archivo CSV completado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <pre className="rounded-lg bg-muted p-4 text-xs">
              {`area_name,description,coordinates,restaurant_location_code,is_active,delivery_fee,minimum_order,estimated_delivery_time
"Chapinero Norte","Zona residencial premium","4.6500,-74.0600;4.6550,-74.0580;4.6540,-74.0550;4.6500,-74.0600","BOG001",true,7500,35000,"30-45 min"
"Zona Rosa","Área de restaurantes","4.6400,-74.0650;4.6430,-74.0630;4.6420,-74.0600;4.6400,-74.0650","BOG001",true,6000,28000,"25-35 min"
"La Candelaria","Centro histórico","4.5950,-74.0750;4.5980,-74.0730;4.5970,-74.0700;4.5950,-74.0750","BOG002",false,5500,22000,"35-50 min"`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Common Errors */}
      <Card>
        <CardHeader>
          <CardTitle>Errores Comunes y Soluciones</CardTitle>
          <CardDescription>
            Problemas frecuentes y cómo resolverlos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <h4 className="font-medium text-red-800">
                  Formato de Coordenadas Inválido
                </h4>
              </div>
              <p className="mb-2 text-red-700 text-sm">
                Error: "Coordinate format invalid in row 5"
              </p>
              <p className="text-red-600 text-sm">
                <strong>Solución:</strong> Usar formato "lat,lng;lat,lng;..."
                con números decimales
              </p>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <h4 className="font-medium text-red-800">
                  Sucursal No Encontrada
                </h4>
              </div>
              <p className="mb-2 text-red-700 text-sm">
                Error: "Restaurant location 'BOG999' not found"
              </p>
              <p className="text-red-600 text-sm">
                <strong>Solución:</strong> Verificar que los códigos de sucursal
                existan
              </p>
            </div>

            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Info className="h-5 w-5 text-yellow-600" />
                <h4 className="font-medium text-yellow-800">
                  Nombres Duplicados
                </h4>
              </div>
              <p className="mb-2 text-sm text-yellow-700">
                Error: "Area name 'Zona Norte' already exists"
              </p>
              <p className="text-sm text-yellow-600">
                <strong>Solución:</strong> Usar opciones de resolución de
                conflictos
              </p>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <h4 className="font-medium text-red-800">Polígono Inválido</h4>
              </div>
              <p className="mb-2 text-red-700 text-sm">
                Error: "Polygon must have at least 3 coordinates"
              </p>
              <p className="text-red-600 text-sm">
                <strong>Solución:</strong> Asegurar mínimo 3 pares de
                coordenadas
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Best Practices */}
      <Card>
        <CardHeader>
          <CardTitle>Mejores Prácticas</CardTitle>
          <CardDescription>
            Recomendaciones para una importación exitosa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <h4 className="font-medium">Preparación de Datos</h4>
              <ul className="space-y-1 text-sm">
                <li>• Usar convenciones de nombres consistentes</li>
                <li>• Incluir información descriptiva detallada</li>
                <li>• Verificar todas las coordenadas antes de importar</li>
                <li>• Probar con archivo pequeño primero</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium">Precisión de Coordenadas</h4>
              <ul className="space-y-1 text-sm">
                <li>• Usar herramientas GPS para coordenadas precisas</li>
                <li>• Asegurar que polígonos representen áreas reales</li>
                <li>• Evitar polígonos muy complejos (&lt;50 vértices)</li>
                <li>• Verificar orden: latitud primero, longitud después</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        <a
          href="/delivery-areas-import-template.csv"
          download="plantilla-areas-entrega.csv"
        >
          <Button className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Descargar Plantilla
          </Button>
        </a>
        <Link href="/delivery-areas">
          <Button variant="outline">Ir a Importar CSV</Button>
        </Link>
      </div>
    </div>
  )
}

export default CSVImportGuidePage
