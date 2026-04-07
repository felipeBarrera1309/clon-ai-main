"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
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
  BotIcon,
  CheckCircleIcon,
  DownloadIcon,
  FileTextIcon,
  LayersIcon,
  LinkIcon,
  ZapIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

const columnDefinitions = [
  {
    column: "A",
    field: "id_producto",
    header: "ID del Producto",
    type: "ID",
    required: false,
    validation:
      "SOLO PARA ACTUALIZACIONES. Dejar vacío para productos nuevos (el sistema asignará uno). Si se incluye un ID en un producto nuevo, será ignorado.",
    example: "6f8a...2e1",
  },
  {
    column: "B",
    field: "nombre_producto",
    header: "Nombre del Producto",
    type: "Texto",
    required: true,
    validation: "Max. 100 caracteres, sin duplicados por tamaño",
    example: "Pizza Margarita",
  },
  {
    column: "C",
    field: "descripcion",
    header: "Descripcion",
    type: "Texto",
    required: true,
    validation: "Max. 500 caracteres",
    example: "Salsa de tomate, queso mozzarella fresco, albahaca",
  },
  {
    column: "D",
    field: "instrucciones",
    header: "Instrucciones ",
    type: "Texto",
    required: false,
    validation:
      "Reglas del producto según logica del negocio (Ej: 'Solo Martes', 'Cambio x Yuca', '+$500 por empaque')",
    example: "Sin cebolla; Solo Fines de Semana",
  },
  {
    column: "E",
    field: "categoria",
    header: "Categoria",
    type: "Texto",
    required: true,
    validation: "Debe existir o se creara automaticamente",
    example: "Pizzas",
  },
  {
    column: "F",
    field: "subcategoria",
    header: "Subcategoria",
    type: "Texto",
    required: false,
    validation: "Se creara automaticamente y se vincula a la categoria",
    example: "Clasicas",
  },
  {
    column: "G",
    field: "tamaño",
    header: "Tamaño",
    type: "Texto",
    required: false,
    validation: "Debe existir o se creara automaticamente",
    example: "Personal",
  },
  {
    column: "H",
    field: "precio",
    header: "Precio (COP)",
    type: "Numero",
    required: false,
    validation:
      "Opcional. Si no se especifica, se toma como 0. Min. 0, Max. 1,000,000 (sin puntos ni comas)",
    example: "15000",
  },
  {
    column: "I",
    field: "individual",
    header: "Producto Individual",
    type: "Texto",
    required: true,
    validation: "Solo 'si' o 'no' (sin acentos, mayusculas o minusculas)",
    example: "si",
  },
  {
    column: "J",
    field: "combinable_mitad",
    header: "Combinable Mitad",
    type: "Texto",
    required: true,
    validation: "Solo 'si' o 'no' (sin acentos, mayusculas o minusculas)",
    example: "si",
  },
  {
    column: "K",
    field: "cantidad_minima",
    header: "Cantidad Minima",
    type: "Numero",
    required: false,
    validation: "Min. 1, Max. 100",
    example: "1",
  },
  {
    column: "L",
    field: "cantidad_maxima",
    header: "Cantidad Maxima",
    type: "Numero",
    required: false,
    validation: "Min. 1, Max. 1000",
    example: "5",
  },
  {
    column: "M",
    field: "combinable_con",
    header: "Combinable Con",
    type: "Texto",
    required: false,
    validation:
      "Categorías, Tamaños o Productos separados por punto y coma (;). Formato: Categoria[:Producto][&Tamaño]",
    example: "Bebidas&350ml;Bebidas:Coca Cola;Adicionales",
  },
  {
    column: "N",
    field: "codigo_externo",
    header: "Codigo Externo ",
    type: "Texto",
    required: false,
    validation: "Identificador para integracion con sistemas externos",
    example: "PIZZA-MARG-P",
  },
  {
    column: "O",
    field: "link_imagen",
    header: "Link Imagen",
    type: "Texto",
    required: false,
    validation: "URL pública de la imagen del producto",
    example: "https://ejemplo.com/pizza.jpg",
  },
  {
    column: "P",
    field: "deshabilitar_en",
    header: "Deshabilitar En ",
    type: "Texto",
    required: false,
    validation:
      "Ubicaciones donde el producto no esta disponible, separadas por punto y coma",
    example: "BOG;MED;BGA",
  },
]

const exampleCSV = `id_producto,nombre_producto,descripcion,instrucciones,categoria,subcategoria,tamaño,precio,individual,combinable_mitad,cantidad_minima,cantidad_maxima,combinable_con,codigo_externo,link_imagen,deshabilitar_en
,Pizza Margarita,Salsa de tomate queso mozzarella fresco albahaca,Sin cebolla,Pizzas,Clasicas,Personal,15000,si,si,1,5,Bebidas&350ml;Bebidas:Coca Cola&350ml;Adicionales,PIZZA-MARG-P,https://ejemplo.com/margarita.jpg,
,Pizza Margarita,Salsa de tomate queso mozzarella fresco albahaca,,Pizzas,Clasicas,Mediana,22000,si,si,1,5,Bebidas;Adicionales,PIZZA-MARG-M,,
,Pizza Pepperoni,Salsa de tomate queso mozzarella pepperoni,Extra crocante,Pizzas,Clasicas,Personal,16000,si,si,1,5,Bebidas&350ml;Bebidas&500ml;Adicionales,PIZZA-PEPP-P,,SE1
,Pizza BBQ,Pizza con salsa barbacoa pollo y cebolla morada,,Pizzas,Especiales,Personal,18000,si,si,1,5,Bebidas&350ml;Bebidas&500ml;Adicionales,PIZZA-BBQ-P,,BGA
,Pizza Especial,Salsa de tomate queso mozzarella jamon pepperoni pimenton,,Pizzas,Especiales,Familiar,35000,si,si,1,3,Bebidas;Adicionales;Entrantes,PIZZA-ESP-F,,
,Coca Cola 350ml,Bebida gaseosa sabor original,,Bebidas,Gaseosas,350ml,3500,si,no,1,10,,COCACOLA-350,,
,Agua Natural,Agua embotellada 500ml,,Bebidas,Aguas,,2500,si,no,1,10,,AGUA-500,,
,Queso Extra,Porcion adicional de queso mozzarella,,Adicionales,Quesos,,2500,no,no,1,3,,EXTRA-QUESO,,
,Jamon Extra,Porcion adicional de jamon,,Adicionales,Carnes,,3000,no,no,1,3,,EXTRA-JAMON,,
,Aros de Cebolla,Aros de cebolla empanizados y fritos,,Entrantes,Fritos,,8500,si,no,1,2,Bebidas,AROS-CEBOLLA,,MED;CAL
,Deditos de Queso,Bastones de queso empanizados,,Entrantes,Fritos,,9500,si,no,1,2,Bebidas,DEDOS-QUESO,,
,Combo Familiar,2 Pizzas medianas + 2 bebidas + aros de cebolla,,Promociones,Ofertas,,45000,si,no,1,1,,COMBO-FAM,,BAQ
,Producto Sin Precio,Ejemplo de producto sin precio especificado,,Adicionales,Varios,,,si,no,1,5,,SIN-PRECIO,,`

export default function MenuImportGuidePage() {
  const [isDownloading, setIsDownloading] = useState(false)

  const downloadExampleCSV = async () => {
    setIsDownloading(true)

    try {
      // Create blob with CSV content
      const blob = new Blob([exampleCSV], { type: "text/csv;charset=utf-8;" })

      // Create download link
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", "ejemplo-menu-importacion.csv")
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
            📊 Guia de Importacion de Menu
          </h1>
          <p className="mx-auto max-w-3xl text-muted-foreground text-xl">
            Aprende como importar productos a tu menu usando archivos CSV o
            Excel. Sigue esta guia para evitar errores y importar tus productos
            correctamente.
          </p>
        </div>

        {/* Quick Start */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              Inicio Rapido
            </CardTitle>
            <CardDescription>
              Los pasos basicos para importar tu menu exitosamente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600">
                  1
                </div>
                <div>
                  <h4 className="font-semibold">Descarga la Plantilla</h4>
                  <p className="text-muted-foreground text-sm">
                    Usa el archivo de ejemplo como base para tu menu
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600">
                  2
                </div>
                <div>
                  <h4 className="font-semibold">Llena los Datos</h4>
                  <p className="text-muted-foreground text-sm">
                    Completa cada columna siguiendo las reglas especificadas
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
                    Sube el archivo y revisa la vista previa antes de importar
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              <Button
                onClick={downloadExampleCSV}
                disabled={isDownloading}
                className="flex items-center gap-2"
              >
                <DownloadIcon className="h-4 w-4" />
                {isDownloading
                  ? "Descargando..."
                  : "Descargar Archivo de Ejemplo"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Column Definitions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileTextIcon className="h-5 w-5" />
              Definicion de Columnas
            </CardTitle>
            <CardDescription>
              Detalle completo de cada columna requerida en el archivo CSV
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Col</TableHead>
                    <TableHead>Campo</TableHead>
                    <TableHead>Encabezado</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Obligatorio</TableHead>
                    <TableHead>Validacion</TableHead>
                    <TableHead>Ejemplo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columnDefinitions.map((col) => (
                    <TableRow key={col.field}>
                      <TableCell className="font-mono font-semibold">
                        {col.column}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {col.field}
                      </TableCell>
                      <TableCell className="font-medium">
                        {col.header}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{col.type}</Badge>
                      </TableCell>
                      <TableCell>
                        {col.required ? (
                          <Badge
                            variant="default"
                            className="bg-red-100 text-red-800"
                          >
                            Si
                          </Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {col.validation}
                      </TableCell>
                      <TableCell className="rounded bg-muted/50 px-2 py-1 font-mono text-sm">
                        {col.example}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* External Code Field */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileTextIcon className="h-5 w-5 text-purple-600" />
              Campo Código Externo
            </CardTitle>
            <CardDescription>
              Campo opcional para integración con sistemas externos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="mb-2 font-semibold text-lg">
                ¿Qué es el Código Externo?
              </h4>
              <p className="mb-4 text-muted-foreground text-sm">
                El campo{" "}
                <code className="rounded bg-muted px-2 py-1 font-mono">
                  codigo_externo
                </code>{" "}
                es completamente opcional y permite almacenar identificadores
                que corresponden a tus productos en otros sistemas como POS,
                inventarios, o plataformas de delivery.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h5 className="font-medium text-green-700">
                    ✅ Casos de Uso
                  </h5>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                      <span>Códigos SKU de tu inventario</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                      <span>IDs de productos en tu sistema POS</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                      <span>Códigos de plataformas como Uber Eats, Rappi</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                      <span>Referencias de sistemas de gestión externos</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h5 className="font-medium text-blue-700">
                    💡 Ejemplos de Códigos
                  </h5>
                  <div className="space-y-2 text-sm">
                    <div className="rounded bg-blue-50 p-3">
                      <code className="font-mono">PIZZA-MARG-P</code>
                      <p className="mt-1 text-muted-foreground">
                        Código descriptivo para Pizza Margarita Personal
                      </p>
                    </div>
                    <div className="rounded bg-blue-50 p-3">
                      <code className="font-mono">SKU-001</code>
                      <p className="mt-1 text-muted-foreground">
                        Código SKU del sistema de inventario
                      </p>
                    </div>
                    <div className="rounded bg-blue-50 p-3">
                      <code className="font-mono">POS-ITEM-456</code>
                      <p className="mt-1 text-muted-foreground">
                        ID del producto en el sistema POS
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded bg-gray-50 p-4">
                <h5 className="mb-2 font-medium text-gray-800">
                  📝 Notas Importantes
                </h5>
                <ul className="space-y-1 text-gray-700 text-sm">
                  <li>
                    • Es completamente opcional - puedes dejarlo vacío si no lo
                    necesitas
                  </li>
                  <li>• Máximo 50 caracteres</li>
                  <li>
                    • Se puede editar posteriormente desde el formulario de
                    productos
                  </li>
                  <li>• Facilita futuras integraciones con otros sistemas</li>
                  <li>• No afecta el funcionamiento del menú si está vacío</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Combinable Format */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-blue-600" />
              Formato de Combinaciones
            </CardTitle>
            <CardDescription>
              Como especificar que productos pueden combinarse con otros
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 font-semibold text-lg">
                  Formatos Soportados
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <h5 className="font-medium text-blue-700">
                      Combinaciones Basicas
                    </h5>
                    <div className="space-y-2 text-sm">
                      <div className="rounded bg-blue-50 p-3">
                        <code className="font-mono">Bebidas</code>
                        <p className="mt-1 text-muted-foreground">
                          Puede combinarse con cualquier producto de la
                          categoria Bebidas
                        </p>
                      </div>
                      <div className="rounded bg-blue-50 p-3">
                        <code className="font-mono">Bebidas;Adicionales</code>
                        <p className="mt-1 text-muted-foreground">
                          Puede combinarse con productos de Bebidas O
                          Adicionales
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h5 className="font-medium text-green-700">
                      Combinaciones con Tamaño
                    </h5>
                    <div className="space-y-2 text-sm">
                      <div className="rounded bg-green-50 p-3">
                        <code className="font-mono">Bebidas&350ml</code>
                        <p className="mt-1 text-muted-foreground">
                          Solo con Bebidas que tengan tamaño 350ml
                        </p>
                      </div>
                      <div className="rounded bg-green-50 p-3">
                        <code className="font-mono">
                          Bebidas&350ml;Bebidas&500ml
                        </code>
                        <p className="mt-1 text-muted-foreground">
                          Con Bebidas de 350ml O 500ml
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h5 className="font-medium text-purple-700">
                      Combinaciones con Producto
                    </h5>
                    <div className="space-y-2 text-sm">
                      <div className="rounded bg-purple-50 p-3">
                        <code className="font-mono">Bebidas:Coca Cola</code>
                        <p className="mt-1 text-muted-foreground">
                          Solo con el producto &quot;Coca Cola&quot; de la
                          categoría Bebidas
                        </p>
                      </div>
                      <div className="rounded bg-purple-50 p-3">
                        <code className="font-mono">
                          Bebidas:Coca Cola&Lata
                        </code>
                        <p className="mt-1 text-muted-foreground">
                          Solo con el producto &quot;Coca Cola&quot; tamaño
                          &quot;Lata&quot;
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-semibold text-lg">
                  Ejemplos Practicos
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="rounded border p-3">
                    <code className="font-mono text-orange-600">
                      Pizzas&Personal;Bebidas;Entrantes
                    </code>
                    <p className="mt-1 text-muted-foreground">
                      Puede combinarse con: Pizzas tamaño Personal, cualquier
                      Bebida, o cualquier Entrante
                    </p>
                  </div>
                  <div className="rounded border p-3">
                    <code className="font-mono text-purple-600">
                      Pizzas&Personal;Pizzas&Mediana;Pizzas&Grande
                    </code>
                    <p className="mt-1 text-muted-foreground">
                      Puede combinarse con Pizzas de cualquier tamaño (Personal,
                      Mediana, o Grande)
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded bg-yellow-50 p-4">
                <h5 className="mb-2 font-medium text-yellow-800">
                  Reglas Importantes
                </h5>
                <ul className="space-y-1 text-sm text-yellow-700">
                  <li>
                    • Use <code className="rounded bg-yellow-200 px-1">;</code>{" "}
                    (punto y coma) para separar opciones
                  </li>
                  <li>
                    • Use <code className="rounded bg-yellow-200 px-1">&</code>{" "}
                    (ampersand) para especificar tamaño y{" "}
                    <code className="rounded bg-yellow-200 px-1">:</code> (dos
                    puntos) para producto
                  </li>
                  <li>
                    • Los nombres deben coincidir exactamente (sin importar
                    mayusculas)
                  </li>
                  <li>
                    • Campo vacío significa que no puede combinarse con otros
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instrucciones — Agent Bridge */}
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BotIcon className="h-5 w-5 text-green-600" />
              Campo Instrucciones — El puente con los agentes
            </CardTitle>
            <CardDescription>
              El campo de instrucciones de cada producto es la herramienta más
              poderosa del menú. Aquí viven las reglas por producto que el
              sistema lee y respeta automáticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border-green-400 border-l-4 bg-green-50 p-4 text-green-900 text-sm">
              <strong>Principio de balanceo de carga:</strong> el campo de
              instrucciones del producto es el lugar correcto para reglas
              específicas de ese producto. El Agente de Menú las lee{" "}
              <strong>verbatim</strong> y actúa en consecuencia. Todo lo que
              puedas poner aquí <em>no tienes que repetirlo</em> en la
              personalización del agente — si lo pones en ambos lados, solo
              creas deuda de sincronización innecesaria.
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
                <h5 className="mb-2 font-semibold text-red-800">
                  ❌ Sin usar instrucciones del producto
                </h5>
                <p className="mb-2 text-red-700">
                  Las reglas terminan en el campo de personalización del agente:
                </p>
                <pre className="overflow-x-auto rounded bg-red-100 p-2 font-mono text-red-900 text-xs">
                  {`# En personalización del agente:
REGLAS_ESPECIALES:
  - El Pollo Asado no puede llevar
    mostaza, solo miel mostaza
  - Siempre preguntar el término de
    cocción en la Costilla
  - El Aguacate Relleno solo se vende
    los fines de semana`}
                </pre>
                <p className="mt-2 text-red-700 text-xs">
                  Resultado: si el menú cambia, hay que actualizar el agente. El
                  acoplamiento es total.
                </p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
                <h5 className="mb-2 font-semibold text-green-800">
                  ✅ Usando instrucciones del producto
                </h5>
                <p className="mb-2 text-green-700">
                  Las reglas viven en cada producto del menú:
                </p>
                <pre className="overflow-x-auto rounded bg-green-100 p-2 font-mono text-green-900 text-xs">
                  {`# En instrucciones del producto:
# --Pollo Asado--
RESTRICCIÓN: Solo miel mostaza, no mostaza.

# --Costilla--
CONSULTAR: ¿Término de cocción?

# --Aguacate Relleno--
RESTRICCIÓN: Solo disponible fines de semana.`}
                </pre>
                <p className="mt-2 text-green-700 text-xs">
                  Resultado: cada producto es autónomo. El agente aplica las
                  reglas sin necesitar instrucciones globales.
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-3 font-semibold text-lg">
                Sistema de palabras clave
              </h4>
              <p className="mb-4 text-muted-foreground text-sm">
                El Agente de Menú reconoce un conjunto de palabras clave que
                definen cómo actuar ante cada producto. Se dividen en tres
                grupos según su visibilidad:
              </p>

              <Accordion type="multiple" className="w-full">
                <AccordionItem value="activas">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-500 text-xs">ACTIVAS</Badge>
                      <span>Requieren acción antes de aceptar el producto</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      El agente no puede confirmar un producto con instrucción
                      activa sin haberla resuelta primero.
                    </p>
                    <div className="space-y-3">
                      {[
                        [
                          "CONSULTAR",
                          "Hacer una pregunta específica al cliente antes de confirmar el producto. La respuesta se interpreta como selección (no como un extra adicional, salvo que el cliente diga 'adicional', 'aparte' o 'extra' explícitamente).",
                          `CONSULTAR: ¿Cuál es el término de cocción? (Rojo, Al punto, Bien cocido)`,
                          `CONSULTAR: ¿Con qué salsa prefiere? (BBQ, Mostaza, Rosada)`,
                        ],
                        [
                          "OFRECIMIENTO",
                          "Ofrecer un producto relacionado al cliente. Si acepta, se busca y agrega al pedido. Si rechaza, se continúa sin él.",
                          `OFRECIMIENTO: ¿Le gustaría agregar una bebida?`,
                          `OFRECIMIENTO: Tenemos postre del día, ¿desea incluirlo?`,
                        ],
                      ].map(([kw, desc, ex1, ex2]) => (
                        <div
                          key={kw}
                          className="rounded-lg border border-amber-200 p-4"
                        >
                          <code className="rounded bg-amber-100 px-2 py-1 font-bold font-mono text-amber-800 text-sm">
                            {kw}
                          </code>
                          <p className="mt-2 text-muted-foreground text-sm">
                            {desc}
                          </p>
                          <div className="mt-2 space-y-1">
                            <pre className="rounded bg-amber-50 p-2 font-mono text-amber-900 text-xs">
                              {ex1}
                            </pre>
                            <pre className="rounded bg-amber-50 p-2 font-mono text-amber-900 text-xs">
                              {ex2}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="pasivas">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-600 text-xs">PASIVAS</Badge>
                      <span>
                        De bajo perfil — solo se activan si el cliente las
                        menciona
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      El agente las conoce pero{" "}
                      <strong>nunca las comunica proactivamente</strong>. Solo
                      actúa cuando el cliente menciona, pregunta o entra en
                      conflicto con ellas.
                    </p>
                    <div className="space-y-3">
                      {[
                        [
                          "CAMBIOS",
                          "Define las únicas sustituciones permitidas. Si el cliente pide un cambio que no está aquí, el agente lo rechaza amablemente.",
                          `CAMBIOS: Se puede cambiar arroz por papas (sin costo adicional).\nCAMBIOS: Yuca en lugar de papa. Chipotle en lugar de BBQ.`,
                        ],
                        [
                          "AL GUSTO",
                          "Ajustes opcionales que el cliente puede solicitar. No se ofrecen, solo se aplican si el cliente los pide.",
                          `AL GUSTO:\n  - con o sin cebolla\n  - sin tomate\n  - poco aderezo`,
                        ],
                        [
                          "RESTRICCIÓN",
                          "Condición o solicitud no permitida. El agente la bloquea si el cliente intenta activarla.",
                          `RESTRICCIÓN: Solo disponible fines de semana.\nRESTRICCIÓN: No se puede pedir sin salsa. No reemplazable.`,
                        ],
                        [
                          "NO EXCLUIBLE",
                          "Componente que no puede eliminarse del producto aunque el cliente lo pida.",
                          `NO EXCLUIBLE: La salsa de la preparación es parte integral del producto.`,
                        ],
                        [
                          "DESECHABLES INCLUIDOS",
                          "Indica que el producto ya incluye desechables. El agente no los ofrece como adicional.",
                          `DESECHABLES INCLUIDOS: Tenedor, cuchillo, servilleta.`,
                        ],
                      ].map(([kw, desc, ex]) => (
                        <div
                          key={kw}
                          className="rounded-lg border border-blue-200 p-4"
                        >
                          <code className="rounded bg-blue-100 px-2 py-1 font-bold font-mono text-blue-800 text-sm">
                            {kw as string}
                          </code>
                          <p className="mt-2 text-muted-foreground text-sm">
                            {desc as string}
                          </p>
                          <pre className="mt-2 rounded bg-blue-50 p-2 font-mono text-blue-900 text-xs">
                            {ex as string}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="ia">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-gray-700 text-xs">IA</Badge>
                      <span>
                        Mudas — instrucciones internas que el cliente nunca ve
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      Instrucciones que el modelo lee para gestionar la lógica
                      interna del producto. Bajo ningún concepto se comunican al
                      cliente.
                    </p>
                    <div className="rounded-lg border border-gray-200 p-4">
                      <code className="rounded bg-gray-100 px-2 py-1 font-bold font-mono text-gray-700 text-sm">
                        PROTOCOLO
                      </code>
                      <p className="mt-2 text-muted-foreground text-sm">
                        Instrucción sobre cómo gestionar este producto en el
                        flujo del pedido. Útil para productos que requieren
                        lógica especial de procesamiento.
                      </p>
                      <pre className="mt-2 rounded bg-gray-100 p-2 font-mono text-gray-900 text-xs">
                        {`PROTOCOLO: Este producto debe pedirse junto con su base.
  Si el cliente lo pide solo, confirmar antes de agregar.`}
                      </pre>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h5 className="mb-2 font-semibold text-amber-900">
                💡 Ejemplo de producto con instrucciones completas
              </h5>
              <pre className="overflow-x-auto rounded bg-amber-100 p-3 font-mono text-amber-900 text-xs">
                {`# Instrucciones del producto: Churrasco 250g
CONSULTAR: ¿Término de cocción? (Rojo, Al punto, Tres cuartos, Bien cocido)
CONSULTAR: ¿Tipo de papa? (Francesa, Al vapor, Gratinada)
CAMBIOS: Papa puede cambiarse por arroz sin costo.
AL GUSTO:
  - sin chimichurri
  - salsa aparte
  - sin ajo
RESTRICCIÓN: No disponible en modalidad domicilio después de las 9pm.`}
              </pre>
              <p className="mt-2 text-amber-800 text-xs">
                El agente preguntará el término de cocción Y el tipo de papa
                antes de confirmar. Si el cliente pide cambiar por arroz, lo
                acepta. Si pide pedirlo a domicilio tarde, lo bloquea. Nada de
                esto necesita estar en la personalización del agente.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800 text-sm">
              <ZapIcon className="h-4 w-4 flex-shrink-0" />
              <span>
                <strong>¿Quieres entender más a fondo este sistema?</strong> La{" "}
                <Link
                  href="/customization/menu-agent-guide"
                  className="font-semibold underline underline-offset-2"
                >
                  Guía de Agentes de Menú
                </Link>{" "}
                explica en detalle cómo el agente interpreta cada palabra clave
                y cuándo actúa sobre ellas.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* standAlone + combinableHalf + combinableWith Matrix */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayersIcon className="h-5 w-5 text-purple-600" />
              Sistema de combinación de productos — Guía completa
            </CardTitle>
            <CardDescription>
              Los atributos <code>individual</code>,{" "}
              <code>combinable_mitad</code> y <code>combinable_con</code>{" "}
              trabajan en conjunto para definir qué puede existir solo, qué
              necesita combinarse, y con qué.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* The 3 attributes explained */}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="mb-1 font-bold font-mono text-sm">
                  individual (standAlone)
                </div>
                <p className="text-muted-foreground text-xs">
                  Define si el producto puede existir solo en un pedido o si
                  siempre necesita acompañar a otro producto que sí sea
                  individual.
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Badge className="bg-green-600 text-xs">si</Badge>
                    <span>Puede pedirse solo</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Badge variant="secondary" className="text-xs">
                      no
                    </Badge>
                    <span>Solo como acompañante</span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-1 font-bold font-mono text-sm">
                  combinable_mitad (combinableHalf)
                </div>
                <p className="text-muted-foreground text-xs">
                  Define si el producto puede dividirse en mitades con otro
                  producto de la misma categoría y tamaño. Aplica cuando dos
                  variantes pueden compartir una unidad física.
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Badge className="bg-blue-600 text-xs">si</Badge>
                    <span>Puede ser una mitad</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Badge variant="secondary" className="text-xs">
                      no
                    </Badge>
                    <span>No divisible</span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-1 font-bold font-mono text-sm">
                  combinable_con (combinableWith)
                </div>
                <p className="text-muted-foreground text-xs">
                  Define con qué categorías, tamaños o productos específicos
                  puede combinarse este producto en el mismo ítem de pedido.
                  Bidireccional — si A puede ir con B, el agente ya lo sabe.
                </p>
                <div className="mt-2 text-muted-foreground text-xs">
                  Formato: <code>Categoría</code>, <code>Categoría&Tamaño</code>
                  , o <code>Categoría:Producto</code>
                </div>
              </div>
            </div>

            {/* Configuration matrix */}
            <div>
              <h4 className="mb-3 font-semibold text-lg">
                Matriz de configuraciones posibles
              </h4>
              <p className="mb-4 text-muted-foreground text-sm">
                Cada combinación de <code>individual</code> y{" "}
                <code>combinable_mitad</code> produce un arquetipo de producto
                diferente. Entiende cuál aplica a cada caso de uso.
              </p>

              <Accordion type="multiple" className="w-full">
                {/* Case 1: individual=si, combinable_mitad=no */}
                <AccordionItem value="case1">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <Badge className="bg-green-600 text-xs">
                          individual: si
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          mitad: no
                        </Badge>
                      </div>
                      <span className="font-medium">
                        Producto independiente estándar
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      El arquetipo más común. Puede pedirse solo y no se divide
                      en mitades. Define opcionalmente con qué puede
                      acompañarse.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <h5 className="mb-2 font-semibold text-green-700 text-sm">
                          ✅ Casos de uso
                        </h5>
                        <ul className="space-y-1 text-muted-foreground text-sm">
                          <li>
                            • Platos principales completos (Pollo asado, Bandeja
                            paisa)
                          </li>
                          <li>• Bebidas (Coca Cola, Agua mineral)</li>
                          <li>• Combos cerrados (Combo Familiar)</li>
                          <li>• Entradas independientes (Aros de cebolla)</li>
                          <li>• Postres individuales</li>
                        </ul>
                      </div>
                      <div>
                        <h5 className="mb-2 font-semibold text-sm">
                          Configuración CSV
                        </h5>
                        <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                          {`individual: si
combinable_mitad: no
combinable_con: Bebidas;Entrantes
# combinable_con vacío = no sugiere
# acompañamientos configurados`}
                        </pre>
                        <p className="mt-1 text-muted-foreground text-xs">
                          <code>combinable_con</code> vacío no impide el pedido
                          — solo hace que el agente infiera acompañamientos por
                          fallback.
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Case 2: individual=si, combinable_mitad=si */}
                <AccordionItem value="case2">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <Badge className="bg-green-600 text-xs">
                          individual: si
                        </Badge>
                        <Badge className="bg-blue-600 text-xs">mitad: si</Badge>
                      </div>
                      <span className="font-medium">
                        Variante que puede pedirse sola o en mitad
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      El producto puede pedirse completo por sí mismo, pero{" "}
                      <em>también</em> puede usarse como una mitad combinada con
                      otra variante de la misma categoría y tamaño. Este es el
                      arquetipo de las pizzas, pollos a mitades, bandejitas
                      combinadas, etc.
                    </p>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                      <strong>Restricción del sistema:</strong> para que dos
                      productos se combinen en mitades, ambos deben tener{" "}
                      <code>combinable_mitad: si</code>, pertenecer a la misma
                      categoría, y tener el mismo tamaño. Si el tamaño difiere,
                      no pueden combinarse aunque ambos sean mitad.
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <h5 className="mb-2 font-semibold text-green-700 text-sm">
                          ✅ Casos de uso
                        </h5>
                        <ul className="space-y-1 text-muted-foreground text-sm">
                          <li>
                            • Pizzas por variante (Margarita, Pepperoni, BBQ) —
                            misma categoría y tamaños múltiples
                          </li>
                          <li>
                            • Pollos asados por tipo (Apanado, BBQ, Original)
                            con tamaño Entero/Medio
                          </li>
                          <li>
                            • Sándwiches con rellenos distintos que comparten
                            pan
                          </li>
                          <li>
                            • Cualquier producto donde el cliente quiere «mitad
                            de X y mitad de Y»
                          </li>
                        </ul>
                      </div>
                      <div>
                        <h5 className="mb-2 font-semibold text-sm">
                          Configuración CSV
                        </h5>
                        <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                          {`# Pizza Margarita - Personal
nombre_producto: Pizza Margarita
categoria: Pizzas
tamaño: Personal
individual: si
combinable_mitad: si
combinable_con: Bebidas&350ml;Adicionales

# Pizza Pepperoni - Personal
nombre_producto: Pizza Pepperoni
categoria: Pizzas
tamaño: Personal
individual: si
combinable_mitad: si
combinable_con: Bebidas&350ml;Adicionales`}
                        </pre>
                        <p className="mt-1 text-muted-foreground text-xs">
                          Resultado: el cliente puede pedir «una pizza personal
                          mitad Margarita mitad Pepperoni» y el sistema lo
                          valida correctamente.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-3 text-amber-900 text-sm">
                      <strong>⚠️ Error frecuente:</strong> poner{" "}
                      <code>combinable_mitad: si</code> en solo algunos tamaños
                      de un mismo producto. Si una Pizza Personal puede ser
                      mitad, la Pizza Mediana también debe tenerlo configurado o
                      el sistema no permite combinarlas.
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Case 3: individual=no, combinable_mitad=no */}
                <AccordionItem value="case3">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-xs">
                          individual: no
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          mitad: no
                        </Badge>
                      </div>
                      <span className="font-medium">
                        Extra / Adicional — siempre acompañante
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      El producto no puede existir solo en un pedido. Siempre
                      debe ir acompañando a un producto con{" "}
                      <code>individual: si</code>. Es el arquetipo típico de
                      extras, toppings, salsas adicionales, ingredientes a
                      parte, etc.
                    </p>
                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-orange-900 text-sm">
                      <strong>Importante:</strong> un producto con{" "}
                      <code>individual: no</code> que no tenga categorías
                      configuradas en <code>combinable_con</code> de los
                      productos principales no será sugerido por el agente. La
                      relación se define desde el producto principal, no desde
                      el extra.
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <h5 className="mb-2 font-semibold text-green-700 text-sm">
                          ✅ Casos de uso
                        </h5>
                        <ul className="space-y-1 text-muted-foreground text-sm">
                          <li>
                            • Ingrediente extra (Queso Extra, Jamón Extra)
                          </li>
                          <li>• Topping (Crema de leche, Guacamole, extra)</li>
                          <li>• Salsa en sobre suelta</li>
                          <li>• Pan adicional, porción extra de salsa</li>
                          <li>• Componentes de combo que no se piden solos</li>
                        </ul>
                      </div>
                      <div>
                        <h5 className="mb-2 font-semibold text-sm">
                          Configuración CSV
                        </h5>
                        <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                          {`# Queso Extra
nombre_producto: Queso Extra
categoria: Adicionales
individual: no
combinable_mitad: no
combinable_con: (vacío)
# El producto principal es quien
# declara 'Adicionales' en su
# combinable_con`}
                        </pre>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Case 4: individual=no, combinable_mitad=si */}
                <AccordionItem value="case4">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-xs">
                          individual: no
                        </Badge>
                        <Badge className="bg-blue-600 text-xs">mitad: si</Badge>
                      </div>
                      <span className="font-medium">
                        Mitad pura — solo existe combinada
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      El producto existe únicamente como una mitad dentro de una
                      combinación. No puede pedirse solo (individual: no), pero
                      puede ser una mitad para combinar con otro producto de su
                      misma categoría y tamaño. Es el caso de variantes que no
                      tienen sentido por sí solas.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <h5 className="mb-2 font-semibold text-green-700 text-sm">
                          ✅ Casos de uso
                        </h5>
                        <ul className="space-y-1 text-muted-foreground text-sm">
                          <li>
                            • Variante de presas de pollo que solo se vende como
                            mitad de pollo completo (presas sueltas que no se
                            venden solas)
                          </li>
                          <li>
                            • Sabores de helado que solo existen en combo de dos
                            sabores
                          </li>
                          <li>
                            • Rellenos de empanada que solo se definen para
                            combinaciones de pack
                          </li>
                        </ul>
                      </div>
                      <div>
                        <h5 className="mb-2 font-semibold text-sm">
                          Configuración CSV
                        </h5>
                        <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                          {`# Sabor de helado - solo en dúo
nombre_producto: Helado Fresa
categoria: Helados
tamaño: Dúo
individual: no
combinable_mitad: si
# Helado Maracuyá - misma categ/tamaño
nombre_producto: Helado Maracuyá
categoria: Helados
tamaño: Dúo
individual: no
combinable_mitad: si`}
                        </pre>
                        <p className="mt-1 text-muted-foreground text-xs">
                          Resultado: el cliente puede pedir «Dúo de helado Fresa
                          y Maracuyá». Ninguno de los dos puede pedirse solo.
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* combinable_con in depth */}
            <div className="space-y-6">
              <div>
                <h4 className="mb-3 font-semibold text-lg">
                  <code>combinable_con</code> — Formatos y lógica de validación
                </h4>
                <p className="mb-4 text-muted-foreground text-sm">
                  Este atributo define con qué productos puede compartir ítem en
                  un pedido. El Agente lo usa con prioridad máxima al sugerir
                  acompañamientos. Pero tiene una mecánica de validación
                  diferente según si el producto es{" "}
                  <strong>individual (standalone)</strong> o{" "}
                  <strong>no-individual</strong>.
                </p>
              </div>
              <div className="mb-4 overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-3 py-2 text-left font-semibold">
                        Formato CSV
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Significado
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Cuándo usar
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {[
                      [
                        <code key="1">Bebidas</code>,
                        "Cualquier producto de la categoría Bebidas, sin importar tamaño ni nombre.",
                        "Cuando cualquier bebida del menú califica.",
                      ],
                      [
                        <code key="2">Bebidas;Entrantes</code>,
                        "Cualquier producto de Bebidas O cualquier producto de Entrantes.",
                        "Cuando hay múltiples categorías que aplican.",
                      ],
                      [
                        <code key="3">Bebidas&350ml</code>,
                        "Solo productos de Bebidas de tamaño 350ml.",
                        "Combos donde el tamaño de la bebida importa.",
                      ],
                      [
                        <code key="4">Bebidas:Coca Cola</code>,
                        "Solo el producto exacto 'Coca Cola' dentro de Bebidas.",
                        "Combos cerrados con bebida específica.",
                      ],
                      [
                        <code key="5">Bebidas:Coca Cola&Lata</code>,
                        "Solo 'Coca Cola' en tamaño 'Lata'. El nivel más específico.",
                        "Promociones con producto y presentación exactos.",
                      ],
                    ].map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">{row[0]}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row[1]}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row[2]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* The 5 combination types */}
            <div>
              <h4 className="mb-2 font-semibold text-lg">
                Los 5 tipos de combinación del sistema
              </h4>
              <p className="mb-4 text-muted-foreground text-sm">
                El validador reconoce exactamente 5 tipos de combinación válida.
                Cada configuración de <code>individual</code> +{" "}
                <code>combinable_mitad</code> + <code>combinable_con</code>{" "}
                produce uno de estos tipos:
              </p>

              <Accordion type="multiple" className="w-full">
                <AccordionItem value="type1">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-gray-600 font-mono text-xs">
                        single_standalone
                      </Badge>
                      <span className="font-medium">
                        Producto individual solo
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      Un único producto con <code>individual: si</code> y{" "}
                      <code>combinable_mitad: no</code>. El{" "}
                      <code>combinable_con</code> solo define qué extras puede{" "}
                      <strong>sugerir</strong> el agente, no afecta la validez
                      del ítem por sí mismo.
                    </p>
                    <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                      {`# Bandeja Paisa (individual=si, mitad=no)
combinable_con: Bebidas;Jugos
# Ítem válido solo con la Bandeja
# combinable_con controla las sugerencias del agente`}
                    </pre>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="type2">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-600 font-mono text-xs">
                        combinable_halves
                      </Badge>
                      <span className="font-medium">
                        Dos mitades combinadas (sin extras)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      Dos productos con <code>individual: si</code> y{" "}
                      <code>combinable_mitad: si</code>, de la{" "}
                      <strong>misma categoría y mismo tamaño</strong>. El
                      sistema las valida por categoría+tamaño,{" "}
                      <strong>no</strong> por el <code>combinable_con</code>{" "}
                      declarado.
                    </p>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900 text-sm">
                      <strong>Regla del sistema:</strong> para combinarse como
                      mitades deben tener
                      <code>combinable_mitad: si</code>,{" "}
                      <strong>misma categoría</strong> y{" "}
                      <strong>mismo tamaño</strong>. Si alguna falla, se
                      rechaza.
                    </div>
                    <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                      {`# ✅ Pizza Margarita Personal + Pizza Pepperoni Personal
# Misma categoría (Pizzas), mismo tamaño (Personal)
# → combinable_halves válido

# ❌ Pizza Margarita Personal + Pizza BBQ Mediana → tamaños distintos
# ❌ Pizza Margarita Personal + Calzone Personal → categorías distintas`}
                    </pre>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="type3">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600 font-mono text-xs">
                        standalone_with_extras
                      </Badge>
                      <span className="font-medium">
                        Individual + acompañantes no-individuales
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      Un producto <code>individual: si</code> (o dos mitades)
                      junto con uno o más productos <code>individual: no</code>.
                      Aquí sí entra en juego el <code>combinable_con</code> con
                      lógica <strong>OR</strong>:
                    </p>
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
                      <strong className="text-green-900">
                        Lógica OR (unidireccional):
                      </strong>
                      <p className="mt-1 text-green-800">
                        Basta que <strong>uno de los dos</strong> declare la
                        relación: el individual en su{" "}
                        <code>combinable_con</code>, o el no-individual en el
                        suyo. No es necesario que ambos lo declaren.
                      </p>
                      <ul className="mt-2 space-y-1 text-green-800 text-xs">
                        <li>
                          ✅ El individual declara la categoría del
                          no-individual
                        </li>
                        <li>
                          ✅ El no-individual declara la categoría del
                          individual
                        </li>
                        <li>✅ Ambos lo declaran (redundante pero válido)</li>
                        <li>❌ Ninguno lo declara → rechazo</li>
                      </ul>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 font-semibold text-green-700 text-xs">
                          ✅ Declaración desde el individual (recomendado)
                        </p>
                        <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                          {`# Pizza: combinable_con: Bebidas;Adicionales
# Queso Extra: combinable_con: (vacío)
# → Válido: Pizza declara Adicionales
# El agente sugiere extras (punto fuerte)`}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 font-semibold text-amber-700 text-xs">
                          ⚠️ Declaración solo desde el no-individual
                        </p>
                        <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                          {`# Pizza: combinable_con: (vacío)
# Queso Extra: combinable_con: Pizzas
# → Válido en validación
# Pero el agente NO sugerirá Queso Extra
# (no está en combinable_con del individual)`}
                        </pre>
                      </div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 text-xs">
                      <strong>Distinción importante:</strong> el{" "}
                      <code>combinable_con</code> del{" "}
                      <strong>individual</strong> controla lo que el agente{" "}
                      <strong>sugiere proactivamente</strong>. El del{" "}
                      <strong>no-individual</strong> solo afecta la{" "}
                      <strong>validación</strong> cuando el cliente lo pide
                      explícitamente. Para que el agente sugiera un extra, ponlo
                      en el individual.
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="type4">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-600 font-mono text-xs">
                        mutual_non_standalone
                      </Badge>
                      <span className="font-medium">
                        Núcleo de no-individuales (sin ningún individual)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      Cuando un ítem contiene{" "}
                      <strong>
                        únicamente productos con <code>individual: no</code>
                      </strong>
                      , el sistema intenta formar un <strong>núcleo</strong>: el
                      grupo de productos más grande donde todos se conectan
                      mutuamente entre sí. Usa un algoritmo DFS para encontrar
                      el componente conectado más grande.
                    </p>
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 text-sm">
                      <strong className="text-purple-900">
                        Lógica AND (bidireccional):
                      </strong>
                      <p className="mt-1 text-purple-800">
                        Para que dos no-individuales formen un núcleo,{" "}
                        <strong>ambos deben declararse mutuamente</strong>. Si A
                        declara la categoría de B, B también debe declarar la
                        categoría de A. Un solo lado no es suficiente.
                      </p>
                      <ul className="mt-2 space-y-1 text-purple-800 text-xs">
                        <li>
                          ✅ A declara categ. de B <strong>Y</strong> B declara
                          categ. de A → forman núcleo
                        </li>
                        <li>
                          ❌ Solo A declara B (unidireccional) → no pueden
                          combinarse
                        </li>
                        <li>⚠️ Núcleo mínimo: 2 productos conectados</li>
                        <li>
                          ⚠️ El núcleo debe ser completamente conexo (todos con
                          todos)
                        </li>
                      </ul>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 font-semibold text-green-700 text-xs">
                          ✅ Núcleo válido (declaración mutua)
                        </p>
                        <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                          {`# Salsa BBQ (ind=no) → categ: Salsas
combinable_con: Salsas
# Salsa Rosada (ind=no) → categ: Salsas
combinable_con: Salsas
# Cada uno declara la categ. del otro
# → Núcleo [BBQ + Rosada] válido`}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 font-semibold text-red-700 text-xs">
                          ❌ No forma núcleo (unidireccional)
                        </p>
                        <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                          {`# Salsa BBQ (ind=no)
combinable_con: Salsas
# Salsa Rosada (ind=no)
combinable_con: (vacío)
# BBQ apunta hacia Rosada
# Pero Rosada no apunta a BBQ
# → No forman núcleo → INVÁLIDO`}
                        </pre>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="type5">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-600 font-mono text-xs">
                        mutual_non_standalone_with_extras
                      </Badge>
                      <span className="font-medium">
                        Núcleo mutuo + extras periféricos
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <p className="text-muted-foreground text-sm">
                      Extensión del núcleo mutuo: existe un núcleo de
                      no-individuales más productos adicionales (extras) que se
                      conectan a él. Los extras pueden conectarse directamente
                      al núcleo, o a través de <strong>sub-núcleos</strong> que
                      a su vez se conectan al núcleo principal. Un extra que no
                      puede alcanzar el núcleo de ninguna forma hace que el ítem
                      completo sea rechazado.
                    </p>
                    <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                      {`# Núcleo: [Salsa BBQ + Salsa Rosada] (se declaran mutuamente)
# Extra A: combinable_con: Salsas → conecta directo al núcleo ✅
# Extra B: combinable_con: Extras → no conecta al núcleo aún
# Extra C: combinable_con: Extras → no conecta al núcleo aún
# B y C se declaran mutuamente → forman sub-núcleo [B+C]
# Si alguno de B/C declara Salsas → sub-núcleo alcanza el núcleo ✅
# Si ninguno de B/C declara Salsas → sub-núcleo se rechaza ❌`}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* Practical examples grid */}
            <div>
              <h5 className="mb-3 font-semibold">
                Ejemplos de configuración por escenario
              </h5>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="mb-1 font-semibold text-blue-700 text-sm">
                    🍕 Pizzería — Standalone con extras
                  </div>
                  <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                    {`# Pizza (ind=si, mitad=si)
combinable_con: Bebidas&350ml;Adicionales
# Queso Extra (ind=no, mitad=no)
combinable_con: (vacío) ← pizza lo declara
# Resultado: standalone_with_extras
# Agente sugiere Bebidas y Adicionales`}
                  </pre>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="mb-1 font-semibold text-green-700 text-sm">
                    🍗 Pollo — Mitad + mitad
                  </div>
                  <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                    {`# Pollo Apanado Medio (ind=si, mitad=si)
# Pollo BBQ Medio (ind=si, mitad=si)
# Ambos: categ=Pollos, tamaño=Medio
# combinable_con no valida mitades
# El sistema usa categ+tamaño
# → combinable_halves válido`}
                  </pre>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="mb-1 font-semibold text-purple-700 text-sm">
                    🥣 Cafetería — Núcleo mutuo puro
                  </div>
                  <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                    {`# Porridge Fruta (ind=no) → categ: Desayunos
combinable_con: Desayunos
# Porridge Granola (ind=no) → categ: Desayunos
combinable_con: Desayunos
# Declaración mutua → núcleo válido
# → mutual_non_standalone`}
                  </pre>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="mb-1 font-semibold text-orange-700 text-sm">
                    🍔 Burger — OR vs AND en práctica
                  </div>
                  <pre className="rounded bg-gray-100 p-2 font-mono text-xs">
                    {`# Hamburguesa (ind=si) categ: Burgers
combinable_con: Bebidas;Papas;Salsas
# Salsa BBQ (ind=no) categ: Salsas
combinable_con: (vacío)
# → OR: Hamburguesa declara Salsas
# → standalone_with_extras válido
# Extra sugerido porque está en el ind`}
                  </pre>
                </div>
              </div>
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
                      La columna <strong>ID (Col A)</strong> es solo para
                      actualizar productos existentes. El sistema asigna IDs
                      automáticos a los nuevos; cualquier valor en esta columna
                      para un producto nuevo será ignorado.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>
                      Los encabezados deben estar exactamente como se especifica
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>
                      Campos marcados como obligatorios no pueden estar vacíos
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>
                      Los valores booleanos deben ser 'si' o 'no' (sin acentos,
                      mayúsculas o minúsculas)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>El archivo debe estar codificado en UTF-8</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>
                      Los precios son opcionales (se toma como 0 si no se
                      especifica) y deben estar en pesos colombianos sin formato
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
                      Productos con tamaños requieren una fila por cada tamaño
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" />
                    <span>
                      Categorías, subcategorías y tamaños nuevos se crean
                      automáticamente
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" />
                    <span>
                      Los productos "No individuales" necesitan categorías
                      combinables
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

        {/* Example Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Vista Previa del Archivo de Ejemplo</CardTitle>
            <CardDescription>
              Así se verán los datos en el archivo CSV de ejemplo (primeras 6
              filas)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[100px]">ID</TableHead>
                    <TableHead className="min-w-[150px]">Producto</TableHead>
                    <TableHead className="min-w-[200px]">Descripción</TableHead>
                    <TableHead className="min-w-[150px]">
                      Instrucciones
                    </TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Subcategoría</TableHead>
                    <TableHead>Tamaño</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Individual</TableHead>
                    <TableHead>Combinable Mitad</TableHead>
                    <TableHead>Cant. Mín</TableHead>
                    <TableHead>Cant. Máx</TableHead>
                    <TableHead className="min-w-[150px]">
                      Combinable Con
                    </TableHead>
                    <TableHead>Código Externo</TableHead>
                    <TableHead>Link Imagen</TableHead>
                    <TableHead>Deshabilitar En</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      -
                    </TableCell>
                    <TableCell className="font-medium">
                      Pizza Margarita
                    </TableCell>
                    <TableCell className="text-sm">
                      Salsa de tomate queso mozzarella fresco albahaca
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm italic">
                      Sin cebolla
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Pizzas</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Clásicas</Badge>
                    </TableCell>
                    <TableCell>Personal</TableCell>
                    <TableCell className="font-mono">$15.000</TableCell>
                    <TableCell>
                      <Badge variant="default">si</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">si</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">1</TableCell>
                    <TableCell className="font-mono text-sm">5</TableCell>
                    <TableCell className="text-sm">
                      Bebidas&350ml;Bebidas:Coca Cola&350ml;Adicionales
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      PIZZA-MARG-P
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs">
                      https://ejemplo.com/margarita.jpg
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      -
                    </TableCell>
                    <TableCell className="font-medium">
                      Pizza Margarita
                    </TableCell>
                    <TableCell className="text-sm">
                      Salsa de tomate queso mozzarella fresco albahaca
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm italic">
                      -
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Pizzas</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Clásicas</Badge>
                    </TableCell>
                    <TableCell>Mediana</TableCell>
                    <TableCell className="font-mono">$22.000</TableCell>
                    <TableCell>
                      <Badge variant="default">si</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">si</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">1</TableCell>
                    <TableCell className="font-mono text-sm">5</TableCell>
                    <TableCell className="text-sm">
                      Bebidas;Adicionales
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      PIZZA-MARG-M
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      -
                    </TableCell>
                    <TableCell className="font-medium">
                      Coca Cola 350ml
                    </TableCell>
                    <TableCell className="text-sm">
                      Bebida gaseosa sabor original
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm italic">
                      -
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Bebidas</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Gaseosas</Badge>
                    </TableCell>
                    <TableCell>350ml</TableCell>
                    <TableCell className="font-mono">$3.500</TableCell>
                    <TableCell>
                      <Badge variant="default">si</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">no</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">1</TableCell>
                    <TableCell className="font-mono text-sm">10</TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="font-mono text-sm">
                      COCACOLA-350
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      -
                    </TableCell>
                    <TableCell className="font-medium">Queso Extra</TableCell>
                    <TableCell className="text-sm">
                      Porción adicional de queso mozzarella
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm italic">
                      -
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Adicionales</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Quesos</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="font-mono">$2.500</TableCell>
                    <TableCell>
                      <Badge variant="secondary">no</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">no</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">1</TableCell>
                    <TableCell className="font-mono text-sm">3</TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="font-mono text-sm">
                      EXTRA-QUESO
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      -
                    </TableCell>
                    <TableCell className="font-medium">
                      Combo Familiar
                    </TableCell>
                    <TableCell className="text-sm">
                      2 Pizzas medianas + 2 bebidas + aros de cebolla
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm italic">
                      -
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Promociones</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Ofertas</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="font-mono">$45.000</TableCell>
                    <TableCell>
                      <Badge variant="default">si</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">no</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">1</TableCell>
                    <TableCell className="font-mono text-sm">1</TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="font-mono text-sm">
                      COMBO-FAM
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell>CAL;BGA;BOG</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      -
                    </TableCell>
                    <TableCell className="font-medium">
                      Producto Sin Precio
                    </TableCell>
                    <TableCell className="text-sm">
                      Ejemplo de producto sin precio especificado
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm italic">
                      -
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Adicionales</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Varios</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      0
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">si</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">no</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">1</TableCell>
                    <TableCell className="font-mono text-sm">5</TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="font-mono text-sm">
                      SIN-PRECIO
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
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
                  <li>• Usa Excel o Google Sheets para editar el CSV</li>
                  <li>• Guarda siempre como CSV con codificación UTF-8</li>
                  <li>• Verifica que no haya filas completamente vacías</li>
                  <li>• Usa el archivo de ejemplo como plantilla</li>
                  <li>
                    • Las subcategorías ayudan a organizar mejor productos
                    dentro de categorías
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold">Validación de Datos</h4>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• Revisa la vista previa antes de importar</li>
                  <li>• Corrige cualquier error mostrado en rojo</li>
                  <li>
                    • Verifica que las categorías y subcategorías estén bien
                    escritas
                  </li>
                  <li>• Asegúrate de que los precios sean números válidos</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
