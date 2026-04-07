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
  AlertCircleIcon,
  ArrowLeftIcon,
  BotIcon,
  CheckCircleIcon,
  InfoIcon,
  LinkIcon,
  ShieldIcon,
  TargetIcon,
  XCircleIcon,
  ZapIcon,
} from "lucide-react"
import Link from "next/link"

function CodeBlock({
  label,
  variant,
  code,
}: {
  label: string
  variant: "good" | "bad" | "neutral"
  code: string
}) {
  const styles = {
    good: "bg-green-50 text-green-900",
    bad: "bg-red-50 text-red-900",
    neutral: "bg-gray-900 text-gray-100",
  }
  const icon =
    variant === "good" ? (
      <CheckCircleIcon className="h-4 w-4 text-green-500" />
    ) : variant === "bad" ? (
      <XCircleIcon className="h-4 w-4 text-red-500" />
    ) : null
  const labelColor =
    variant === "good"
      ? "text-green-700"
      : variant === "bad"
        ? "text-red-700"
        : "text-gray-600"

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon}
        <span className={`font-medium text-sm ${labelColor}`}>{label}</span>
      </div>
      <pre
        className={`overflow-x-auto rounded-lg p-4 font-mono text-xs leading-relaxed ${styles[variant]}`}
      >
        {code}
      </pre>
    </div>
  )
}

export default function MenuAgentGuidePage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="space-y-8">
        <Link href="/customization">
          <Button variant="ghost" className="flex items-center gap-2">
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a Personalización
          </Button>
        </Link>

        {/* Header */}
        <div className="space-y-4 text-center">
          <h1 className="font-bold text-4xl tracking-tight">
            🍽️ Guía de Agentes de Menú
          </h1>
          <p className="mx-auto max-w-3xl text-muted-foreground text-xl">
            Los agentes especializados que resuelven búsquedas de productos y
            validan pedidos. Su personalización define las reglas de negocio que
            el sistema no puede inferir por sí solo.
          </p>
          <div className="mx-auto max-w-2xl rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 text-sm">
            <strong>🔗 Complementa con:</strong> La{" "}
            <Link
              href="/customization/agent-guide"
              className="font-semibold underline underline-offset-2"
            >
              Guía del Agente Principal
            </Link>{" "}
            explica cómo el agente principal interactúa con estos agentes y el
            rol de las instrucciones de producto como puente.
          </div>
        </div>

        {/* Critical: never talks to user */}
        <Card className="border-red-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5 text-red-600" />
              Lo más importante — Lo que estos agentes NO son
            </CardTitle>
            <CardDescription>
              El error de concepto más frecuente al configurarlos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-red-400 border-l-4 bg-red-50 p-4 text-red-900 text-sm">
              <strong>Los agentes de menú nunca hablan con el usuario.</strong>{" "}
              Son agentes internos del sistema. El Agente Principal los consulta
              para resolver búsquedas y validar pedidos — el cliente no los ve
              ni los percibe. Configurarlos como si intervinieran en la
              conversación produce instrucciones que no tienen ningún efecto en
              el sistema.
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 font-semibold text-red-700 text-sm">
                  ❌ Instrucciones sin ningún efecto
                </h4>
                <ul className="space-y-1 text-sm">
                  {[
                    "Tono, estilo o forma de comunicarse ('ser amable')",
                    "Cómo saludar o iniciar conversación",
                    "Horarios o datos del restaurante",
                    "Cómo formatear productos en pantalla",
                    "Cuántos productos mostrar por respuesta",
                    "Protocolo de escalamiento a humano",
                    "Método de pago, datos bancarios, instrucciones de entrega",
                  ].map((i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XCircleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                      <span className="text-muted-foreground">{i}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 font-semibold text-green-700 text-sm">
                  ✅ Instrucciones con efecto real
                </h4>
                <ul className="space-y-1 text-sm">
                  {[
                    "Criterio de interpretación de solicitudes (literal vs. interpretativo)",
                    "Equivalencias y traducciones de unidades del negocio",
                    "Filtros de acceso a categorías específicas",
                    "Cómo resolver pedidos de volumen o construcción algorítmica",
                    "Interpretación de palabras clave de instrucciones de producto",
                    "Lógica de precios aproximados",
                    "Reglas de modificaciones, restricciones y salsas",
                  ].map((i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                      <span className="text-muted-foreground">{i}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Two agents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BotIcon className="h-5 w-5 text-purple-600" />
              Los dos agentes — Función, limitantes y regla 1:1
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-blue-200 p-4">
                <h4 className="mb-1 font-semibold text-blue-800">
                  🔍 Agente de Menú
                </h4>
                <p className="mb-2 text-muted-foreground text-sm">
                  Recibe como contexto inyectado los productos disponibles del
                  menú real. Resuelve solicitudes: identifica qué productos
                  corresponden a lo que el cliente pide, gestiona combinaciones
                  y devuelve una respuesta estructurada al Agente Principal.
                </p>
                <div className="rounded bg-blue-50 p-2 text-blue-800 text-xs">
                  <strong>Herramienta nativa:</strong> no usa
                  `searchMenuProductsTool` — los productos ya están en su
                  contexto. El sistema base maneja la lógica de combinación por
                  `combinableWith` configurado en el menú.
                </div>
              </div>
              <div className="rounded-lg border border-purple-200 p-4">
                <h4 className="mb-1 font-semibold text-purple-800">
                  ✅ Agente de Validación de Menú
                </h4>
                <p className="mb-2 text-muted-foreground text-sm">
                  Recibe los productos ya identificados con sus IDs reales.
                  Estructura el pedido en `orderItems` (agrupa según lógica de
                  consumo) y llama a `validateMenuCombinationsTool` para validar
                  reglas de negocio. Propaga la estructura validada de vuelta al
                  Agente Principal.
                </p>
                <div className="rounded bg-purple-50 p-2 text-purple-800 text-xs">
                  <strong>Limitante clave:</strong> solo puede validar lo que
                  los atributos del menú le permiten. No inventa reglas — las
                  lee de `standAlone`, `combinableHalf` y `combinableWith`
                  configurados en los productos.
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
              <strong>⚠️ Regla fundamental — configuración 1:1:</strong> Ambos
              agentes deben tener instrucciones{" "}
              <strong>idénticas en ambos campos</strong>. El Agente Principal
              puede, dependiendo del modelo y la solicitud, consultar cualquiera
              de los dos. Si sus instrucciones difieren, el comportamiento es
              impredecible. No hay razón funcional para que difieran.
            </div>

            <CodeBlock
              variant="neutral"
              label="Estructura del archivo de implementación"
              code={`===========Personalización del Agente de Menú===========

BLOQUE_1:
  ...

BLOQUE_2:
  ...

===========Personalización del Agente de Validación de Menú===========

# Mismo contenido — copia exacta del bloque anterior
BLOQUE_1:
  ...

BLOQUE_2:
  ...`}
            />
          </CardContent>
        </Card>

        {/* Native vs custom */}
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <InfoIcon className="h-5 w-5 text-blue-600" />
              Qué hace el sistema nativamente — y qué no
            </CardTitle>
            <CardDescription>
              La base del criterio para decidir qué promptear
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-blue-400 border-l-4 bg-blue-50 p-4 text-blue-900 text-sm">
              Al igual que con el Agente Principal, antes de escribir cualquier
              instrucción revisa el{" "}
              <Link
                href="/prompt-builder"
                className="font-semibold underline underline-offset-2"
              >
                Constructor de Prompts
              </Link>{" "}
              para ver el system prompt base completo. Lo que ya está manejado
              nativamente no necesita repetirse — duplicarlo no suma, confunde.
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-3 py-2 text-left font-semibold">
                      Comportamiento
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      ¿Nativo?
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Implicación
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {[
                    [
                      "Leer y propagar instrucciones de producto verbatim",
                      "✅ Nativo",
                      "El sistema ya lee el campo de instrucciones de cada producto y lo propaga. No necesitas instruirle esto.",
                      "green",
                    ],
                    [
                      "Lógica de combinación por `combinableWith`",
                      "✅ Nativo",
                      "Está configutado en el menú por producto. El agente ya lo usa como prioridad máxima.",
                      "green",
                    ],
                    [
                      "Fallback inteligente de combinaciones (bebidas, postres)",
                      "✅ Nativo",
                      "Si no hay `combinableWith`, el agente infiere por tendencias de consumo comunes.",
                      "green",
                    ],
                    [
                      "Formato y estilo de respuesta",
                      "✅ Nativo",
                      "El agente maneja el formato de respuesta internamente. Instrucciones de presentación no aplican aquí.",
                      "green",
                    ],
                    [
                      "Estructuración de orderItems (qué agrupar juntos)",
                      "✅ Nativo",
                      "El Agente de Validación ya sabe agrupar productos según lógica de consumo y tipos.",
                      "green",
                    ],
                    [
                      "Criterio de interpretación de solicitudes ambiguas",
                      "❌ No nativo",
                      "El sistema no sabe si tu negocio es literal o interpretativo. Debes definirlo.",
                      "red",
                    ],
                    [
                      "Equivalencias de unidades propias del negocio",
                      "❌ No nativo",
                      "El sistema no sabe que '2 personas = 4 presas' en tu contexto específico.",
                      "red",
                    ],
                    [
                      "Filtros de acceso a categorías específicas",
                      "❌ No nativo",
                      "Reglas como 'categoría solo para clientes tipo X' requieren instrucción explícita.",
                      "red",
                    ],
                    [
                      "Lógica de precios aproximados",
                      "❌ No nativo",
                      "El sistema no infiere producto por precio referenciado ('el de 20mil').",
                      "red",
                    ],
                    [
                      "Reglas de modificaciones permisivas o restrictivas",
                      "❌ No nativo",
                      "Sin instrucción, el agente usa razonamiento general. El criterio del negocio debe definirse.",
                      "red",
                    ],
                  ].map(([behavior, status, imp, color]) => (
                    <tr key={behavior}>
                      <td className="px-3 py-2 font-medium text-xs">
                        {behavior}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-medium text-xs ${
                            color === "green"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {imp}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Position in flow */}
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TargetIcon className="h-5 w-5 text-green-600" />
              El rol en el pedido — el Jefe de los productos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-green-400 border-l-4 bg-green-50 p-4 text-green-900 text-sm">
              Los agentes de menú son la{" "}
              <strong>autoridad sobre los productos</strong>. El Agente
              Principal obedece su output. Cuando un cliente pide algo, el flujo
              es:{" "}
              <em>
                cliente → Principal → Agente de Menú → Principal → cliente
              </em>
              . Si el agente de menú resuelve bien, la toma de pedido es rápida.
              Si resuelve mal, el Principal no puede corregirlo — solo puede
              presentar lo que recibió.
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-3 py-2 text-left font-semibold">
                      Situación
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Sin regla
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Con regla
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {[
                    [
                      "Cliente pide por precio ('el de 20mil')",
                      "El agente no resuelve — pide aclaración",
                      "PRECIOS_APROXIMADOS identifica el producto exacto",
                    ],
                    [
                      "Cliente pide 'pollo para 3 personas'",
                      "Busca 'pollo para 3 personas' literalmente — falla",
                      "Equivalencia: 3p = 6 presas — busca el producto correcto",
                    ],
                    [
                      "Cliente pide categoría restringida",
                      "El agente la devuelve sin filtrar",
                      "Filtro de acceso bloquea hasta verificar condición",
                    ],
                    [
                      "Cliente pide modificación poco común",
                      "El agente usa criterio general — puede ser muy permisivo o restrictivo",
                      "PROTOCOLO_MODIFICACIONES define exactamente qué aplica",
                    ],
                    [
                      "Producto tiene CONSULTAR en instrucciones",
                      "El sistema lo lee y propaga — pero si no hay regla de interpretación puede malentenderse",
                      "INSTRUCCIONES_DEL_PRODUCTO/ACTIVAS define exactamente cómo responder",
                    ],
                  ].map(([sit, sin, con]) => (
                    <tr key={sit}>
                      <td className="px-3 py-2 font-medium">{sit}</td>
                      <td className="px-3 py-2 text-red-700 text-xs">{sin}</td>
                      <td className="px-3 py-2 text-green-700 text-xs">
                        {con}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* What to configure */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ZapIcon className="h-5 w-5 text-orange-600" />
              Qué personalizar — Los bloques que sí marcan diferencia
            </CardTitle>
            <CardDescription>
              Cada bloque responde a un vacío real del sistema nativo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {/* Search strategy */}
              <AccordionItem value="search">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-600 text-xs">Core</Badge>
                    <span>
                      Criterio de búsqueda e interpretación de solicitudes
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <p className="text-muted-foreground text-sm">
                    El sistema nativo no sabe si tu restaurante es permisivo o
                    restrictivo. Sin instrucción usa razonamiento general. El
                    implementador define el enfoque: <strong>literal</strong>{" "}
                    (solo lo que existe exactamente) o{" "}
                    <strong>interpretativo</strong> (construir con lo disponible
                    si el insumo existe). La metodología{" "}
                    <em>Segmentar → Conquistar → Construir</em> es una práctica
                    común entre implementadores — no viene del sistema.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <CodeBlock
                      variant="good"
                      label="✅ Enfoque literal (Fipes) — menú de carta definida"
                      code={`PROTOCOLO_BUSQUEDA_PRODUCTO:
  CRITERIOS_DE_FILTRADO:
    ENFOQUE: "literal_estricto"
    REGLA_PROMOCIONES:
      palabras_clave: ["promo", "ofertas"]
      accion: "Solo COMBOS oficiales. NUNCA
        inventar descuentos."

  FASE_2_CONSTRUCCION_POR_VOLUMEN:
    condicion: "Cantidad > producto más grande"
    algoritmo:
      1. "Fijar objetivo total"
      2. "Ítem máximo disponible < objetivo"
      3. "Calcular restante. Repetir."`}
                    />
                    <CodeBlock
                      variant="good"
                      label="✅ Enfoque interpretativo (Wasabi) — máxima permisividad"
                      code={`PROTOCOLO_BUSQUEDA_PRODUCTO:
  CRITERIOS_DE_FILTRADO:
    ENFOQUE: "interpretativo_contextual"

  FASE_2_REBUSQUE:
    condicion: "Base existe, variante no existe"
    logica:
      1. "¿El ingrediente existe en el menú?"
      2. "Si sí → BASE + Nota/Cobro. ¡Hay venta!"
      3. "Explicar lógica al orquestador"
    ejemplo:
      input: "'Gyosas de arroz'"
      razon: "Gyosas sí, arroz sí (en Woks)"
      output: "Gyosas + nota de arroz"`}
                    />
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3 text-amber-900 text-sm">
                    <strong>Elige según la política del negocio:</strong>{" "}
                    `literal_estricto` para restaurantes con carta cerrada donde
                    no se improvisa. `interpretativo_contextual` para negocios
                    que maximizan venta con lo disponible.
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Product instructions */}
              <AccordionItem value="instructions">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-600 text-xs">Core</Badge>
                    <span>Interpretación de instrucciones de producto</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-900 text-sm">
                    <strong>Lo que el sistema hace nativamente:</strong> el
                    Agente de Menú ya lee y propaga verbatim el bloque{" "}
                    <code>INSTRUCCIONES DEL PRODUCTO:</code> de cada producto.
                    No necesitas instruirle que lo haga — ya lo hace.
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Lo que <em>sí</em> puedes personalizar es{" "}
                    <strong>cómo interpretar las palabras clave</strong> que
                    definen esas instrucciones. Sin esta regla, el agente las
                    lee pero puede interpretarlas de forma genérica. Con ella,
                    sabe exactamente cómo actuar ante cada palabra clave.
                  </p>
                  <div className="space-y-3">
                    {[
                      {
                        kw: "CONSULTAR",
                        cat: "ACTIVA",
                        color: "amber",
                        desc: "El producto requiere que el cliente elija algo antes de confirmarlo. El agente DEBE preguntar. La respuesta se interpreta como selección (no como extra, salvo 'adicional', 'aparte' o 'extra' explícito).",
                      },
                      {
                        kw: "OFRECIMIENTO",
                        cat: "ACTIVA",
                        color: "amber",
                        desc: "Ofrecer un producto relacionado. Si acepta, aplicar el protocolo de búsqueda. (Jarris, Wasabi)",
                      },
                      {
                        kw: "CAMBIOS",
                        cat: "PASIVA",
                        color: "blue",
                        desc: "Únicas sustituciones permitidas. Solo se activa si el cliente pide un cambio — nunca comunicar proactivamente.",
                      },
                      {
                        kw: "AL GUSTO",
                        cat: "PASIVA",
                        color: "blue",
                        desc: "Ajustes opcionales disponibles. El agente los gestiona si el cliente los pide. No se enuncian por defecto.",
                      },
                      {
                        kw: "RESTRICCIÓN",
                        cat: "PASIVA",
                        color: "blue",
                        desc: "Condición no permitida según la lógica del negocio. El agente la aplica si el cliente intenta contradecirla.",
                      },
                      {
                        kw: "NO EXCLUIBLE",
                        cat: "PASIVA",
                        color: "blue",
                        desc: "Componente que no puede quitarse del producto, aunque el cliente lo solicite. (Jarris)",
                      },
                      {
                        kw: "PROTOCOLO",
                        cat: "IA",
                        color: "gray",
                        desc: "Instrucción interna de gestión del pedido. Muda — el modelo la lee pero nunca la comunica al cliente.",
                      },
                    ].map(({ kw, cat, color, desc }) => (
                      <div
                        key={kw}
                        className="flex gap-3 rounded-lg border p-3"
                      >
                        <div className="flex shrink-0 flex-col items-center gap-1">
                          <code
                            className={`rounded px-1.5 py-0.5 font-bold font-mono text-xs ${
                              color === "amber"
                                ? "bg-amber-100 text-amber-800"
                                : color === "blue"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {kw}
                          </code>
                          <span
                            className={`rounded px-1 py-0.5 text-xs ${
                              cat === "ACTIVA"
                                ? "bg-amber-50 text-amber-700"
                                : cat === "PASIVA"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-gray-50 text-gray-600"
                            }`}
                          >
                            {cat}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm">{desc}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900 text-sm">
                    <strong>Regla de oro:</strong> las reglas de cada producto
                    específico van en el{" "}
                    <Link
                      href="/menu"
                      className="font-semibold underline underline-offset-2"
                    >
                      campo de instrucciones del producto en el Menú
                    </Link>
                    , no aquí. Este bloque define{" "}
                    <em>cómo interpretar las palabras clave</em> — no sus
                    contenidos particulares.
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Approximate prices */}
              <AccordionItem value="prices">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-600 text-xs">Común</Badge>
                    <span>
                      Precios aproximados — cuando el cliente habla en precios
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <p className="text-muted-foreground text-sm">
                    El sistema no sabe que &ldquo;el de 20mil&rdquo; significa
                    un producto específico. Sin este bloque, el agente no puede
                    resolver estas referencias.
                  </p>
                  <CodeBlock
                    variant="good"
                    label="✅ Implementación estándar (Fipes, Jarris, Wasabi)"
                    code={`PRECIOS_APROXIMADOS:
  proceso_deteccion:
    1. "Normalizar precio del cliente"
    2. "Coincidencia exacta → seleccionar"
    3. "Redondeo a mil (1 opción) → seleccionar"
    4. "Proximidad (min(2000, 3%)) → seleccionar"
    5. "Ambigüedad (múltiples) → pedir aclaración"
  prioridad: "VARIANTES_DE_PRODUCTO > ADICIONALES"
  salida:
    - "Confirmar con NOMBRE, no con precio"
    - "PROHIBIDO: 'el de 20mil'"
    - "CORRECTO: 'Medio Pollo'"`}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Business-specific */}
              <AccordionItem value="business">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-orange-600 text-xs">Específico</Badge>
                    <span>Reglas específicas del negocio</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <p className="text-muted-foreground text-sm">
                    Son las instrucciones más diferenciadoras entre
                    implementaciones. Resuelven vacíos muy concretos del negocio
                    que el sistema nativo no puede inferir.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <h5 className="mb-2 font-semibold text-sm">
                        Equivalencias de unidades (Jarris)
                      </h5>
                      <p className="mb-2 text-muted-foreground text-sm">
                        Cuando el cliente usa jerga del negocio que el sistema
                        no entiende sin traducción previa.
                      </p>
                      <CodeBlock
                        variant="good"
                        label="✅ LOGICA_DE_EQUIVALENCIAS_Y_TRADUCCION"
                        code={`LOGICA_DE_EQUIVALENCIAS_Y_TRADUCCION:
  descripcion: "Convertir intención → unidades
    de sistema ANTES de buscar."
  reglas:
    - "1 persona = 2 presas (1/4 pollo)"
    - "2 personas = 4 presas (1/2 pollo)"
    - "Pollo familiar = 8 presas"
    - "Pierna-Pernil = Muslo"
  prohibido: "Mezclas anatómicamente incorrectas
    como 'Ala Ala' o 'Pechuga Pierna' → aclarar
    y especificar las presas correctas."`}
                      />
                    </div>

                    <div>
                      <h5 className="mb-2 font-semibold text-sm">
                        Filtros de acceso a categorías (Jarris)
                      </h5>
                      <p className="mb-2 text-muted-foreground text-sm">
                        Para modelos de negocio con categorías restringidas a
                        tipos de cliente (corporativo, VIP, contraseña). El
                        agente principal bloquea o permite según el output de
                        este agente.
                      </p>
                      <CodeBlock
                        variant="good"
                        label="✅ FILTRO_DE_SEGURIDAD_CORPORATIVA"
                        code={`FILTRO_DE_SEGURIDAD_CORPORATIVA:
  mandato: "Categoría 'Promociones' BLOQUEADA
    para usuario estándar."
  acceso:
    - "Solo con frase clave explícita:
      'PROMOCIONES EMPRESARIALES'"
    - "Sin la frase: actuar como si la
      categoría no existiera."
    - "Redirigir al cliente a Combos
      o Menús estándar."`}
                      />
                    </div>

                    <div>
                      <h5 className="mb-2 font-semibold text-sm">
                        Modificaciones permisivas o lógica de Rebusque (Wasabi)
                      </h5>
                      <p className="mb-2 text-muted-foreground text-sm">
                        Para negocios donde casi todo es posible si el insumo
                        existe. Define cuándo cobrar, cuándo usar nota gratis, y
                        cómo comunicar la construcción al Agente Principal.
                      </p>
                      <CodeBlock
                        variant="good"
                        label="✅ PROTOCOLO_MODIFICACIONES con jerarquía de evaluación"
                        code={`PROTOCOLO_MODIFICACIONES:
  PASO_1 - COBRO: "Insumo existe con precio
    → AGREGAR AL PEDIDO (cobrar)"
  PASO_2 - NOTA_PROPIA: "Componente inherente
    del producto → NOTA GRATIS"
  PASO_3 - REBUSQUE: "Insumo en cualquier
    producto del menú → NOTA GRATIS"
  PASO_4 - IMPOSIBLE: "No existe en absoluto
    → rechazar amablemente"

  MANDATO_DE_CLARIDAD: "Si se cobra un producto
    adicional por modificación, declarar su
    relación con el producto base para que el
    orquestador no los interprete como ítems
    independientes."`}
                      />
                    </div>

                    <div>
                      <h5 className="mb-2 font-semibold text-sm">
                        Reglas de salsas (Fipes, Wasabi, Jarris)
                      </h5>
                      <CodeBlock
                        variant="good"
                        label="✅ GESTION_DE_SALSAS — interpretación de ambigüedad"
                        code={`GESTION_DE_SALSAS:
  condicion: "Solicitud relacionada con salsas"
  protocolo:
    1_verificar: "¿El producto tiene salsas
      explícitas o en preparación?"
    2_descarte_defecto: "Sin especificar →
      solo quitar de preparación (sobres quedan)"
    3_descarte_absoluto: "Solo si dice 'NADA DE
      SALSAS' explícitamente → descartar todo"`}
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* No hardcoded data */}
        <Card className="border-yellow-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldIcon className="h-5 w-5 text-yellow-600" />
              Alta cohesión y bajo acoplamiento — aplica igual que al Principal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-yellow-400 border-l-4 bg-yellow-50 p-4 text-sm text-yellow-900">
              La misma regla aplica aquí: las instrucciones de este agente no
              deben contener datos que ya están gestionados determinísticamente
              en otra sección del proyecto. Datos del menú hardcodeados en el
              agente crean acoplamiento — cuando el menú cambie, las
              instrucciones quedan desactualizadas.
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <CodeBlock
                variant="bad"
                label="❌ Mal — reglas de productos específicos hardcodeadas"
                code={`REGLAS_NEGOCIO:
  - "El Pollo Asado no lleva mostaza,
    solo miel mostaza"
  - "El Combo Familiar incluye 4 bebidas,
    se pueden cambiar sin costo"
  - "La Hamburguesita vale $18.000 y
    tiene opción doble carne por $5.000"`}
              />
              <CodeBlock
                variant="good"
                label="✅ Bien — reglas genéricas que se aplican a cualquier producto"
                code={`GESTION_DE_SALSAS:
  # Se aplica a cualquier producto con salsas
  # No nombra productos específicos

PRECIOS_APROXIMADOS:
  # Se aplica a cualquier precio mencionado
  # No hardcodea precios puntuales

LOGICA_DE_EQUIVALENCIAS_Y_TRADUCCION:
  # Traduce unidades — no nombra productos`}
              />
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <strong>La excepción correcta:</strong> si una regla aplica a{" "}
              <em>todos los productos de una categoría</em> sin nombrarlos
              individualmente (ej: &ldquo;todos los productos bañados pedir
              salsa aparte no tiene costo extra&rdquo;), se puede definir aquí.
              Lo que no puede ir: reglas que mencionen nombres de productos,
              precios puntuales o categorías específicas del menú.
            </div>
          </CardContent>
        </Card>

        {/* Golden rules */}
        <Card>
          <CardHeader>
            <CardTitle>🏆 Reglas de Oro — Agentes de Menú</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "1",
                  "No hablan con el usuario.",
                  "Toda instrucción orientada al cliente es letra muerta.",
                ],
                [
                  "2",
                  "Configuración 1:1.",
                  "Ambos agentes con instrucciones idénticas siempre.",
                ],
                [
                  "3",
                  "Son el Jefe de los productos.",
                  "El Principal obedece su output — calibrarlos bien acelera el pedido.",
                ],
                [
                  "4",
                  "El sistema ya lee instrucciones de producto.",
                  "No instruyas este comportamiento — ya es nativo.",
                ],
                [
                  "5",
                  "Define la interpretación, no los datos.",
                  "El criterio de qué significa CONSULTAR, CAMBIOS, etc. va aquí. Los contenidos van en el menú.",
                ],
                [
                  "6",
                  "Sin datos hardcodeados.",
                  "Sin nombres de productos, precios ni categorías específicas.",
                ],
                [
                  "7",
                  "Elige el enfoque correcto.",
                  "literal_estricto vs interpretativo_contextual según la permisividad del negocio.",
                ],
                [
                  "8",
                  "El Agente de Validación tiene limitante.",
                  "Solo valida lo que los atributos del menú le permiten — no inventa reglas.",
                ],
              ].map(([n, b, r]) => (
                <div key={n} className="flex items-start gap-2 text-sm">
                  <span className="font-bold text-amber-600">{n}.</span>
                  <span>
                    <strong>{b}</strong> {r}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap justify-center gap-3 pt-2">
              <Link href="/customization/agent-guide">
                <Button variant="outline" className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />← Guía del Agente Principal
                </Button>
              </Link>
              <Link href="/customization">
                <Button variant="outline" className="flex items-center gap-2">
                  <ZapIcon className="h-4 w-4" />
                  Ir a Personalización
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center pb-8">
          <Link href="/customization">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeftIcon className="h-4 w-4" />
              Volver a Personalización
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
