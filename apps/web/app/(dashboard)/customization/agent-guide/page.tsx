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
  ExternalLinkIcon,
  InfoIcon,
  LinkIcon,
  MessageSquareIcon,
  TargetIcon,
  UserIcon,
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
  variant: "good" | "bad"
  code: string
}) {
  const isGood = variant === "good"
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        {isGood ? (
          <CheckCircleIcon className="h-4 w-4 text-green-500" />
        ) : (
          <XCircleIcon className="h-4 w-4 text-red-500" />
        )}
        <span
          className={`font-medium text-sm ${isGood ? "text-green-700" : "text-red-700"}`}
        >
          {label}
        </span>
      </div>
      <pre
        className={`overflow-x-auto rounded-lg p-4 font-mono text-xs leading-relaxed ${
          isGood ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"
        }`}
      >
        {code}
      </pre>
    </div>
  )
}

export default function AgentGuidePage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="space-y-8">
        <Link href="/customization">
          <Button variant="ghost" className="flex items-center gap-2">
            <ArrowLeftIcon className="h-4 w-4" />
            Volver a Personalización
          </Button>
        </Link>

        <div className="space-y-4 text-center">
          <h1 className="font-bold text-4xl tracking-tight">
            🤖 Guía del Agente Principal
          </h1>
          <p className="mx-auto max-w-3xl text-muted-foreground text-xl">
            Entiende cómo funciona tu asistente virtual, qué puedes
            personalizar, y cómo hacerlo con alto criterio.
          </p>
          <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
            <strong>⚠️ Importante:</strong> El resultado de tu asistente depende
            directamente de la calidad y criterio de tu configuración. Esta guía
            y el{" "}
            <Link
              href="/prompt-builder"
              className="font-semibold underline underline-offset-2"
            >
              Constructor de Prompts
            </Link>{" "}
            son tus dos referencias principales. Léelas antes de escribir
            cualquier instrucción.
          </div>
        </div>

        {/* Before you start */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ZapIcon className="h-5 w-5 text-blue-600" />
              Antes de empezar
            </CardTitle>
            <CardDescription>
              El orden correcto para un implementador nuevo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Lee esta guía completa",
                  desc: 'Entiende el "por qué" antes de escribir una sola instrucción',
                },
                {
                  step: "2",
                  title: "Explora el proyecto",
                  desc: "Identifica qué ya está configurado determinísticamente antes de promptearlo",
                },
                {
                  step: "3",
                  title: "Estudia el Constructor",
                  desc: "Revisa el system prompt base — lo que ya está ahí no necesita repetirse",
                },
              ].map(({ step, title, desc }) => (
                <div
                  key={step}
                  className="flex items-start gap-3 rounded-lg border p-4"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600">
                    {step}
                  </div>
                  <div>
                    <h4 className="font-semibold">{title}</h4>
                    <p className="text-muted-foreground text-sm">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Who is the agent */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-purple-600" />
              ¿Quién es el Agente Principal?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-purple-400 border-l-4 bg-purple-50 p-4">
              <p className="text-purple-900">
                Un <strong>asistente virtual de restaurante</strong> que opera
                en WhatsApp, en español colombiano, con el nombre y la
                personalidad que el implementador defina. El cliente lo percibe
                como un empleado del restaurante, no como una IA.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="font-semibold text-green-700 text-sm">
                  ✅ Sí hace
                </h4>
                <ul className="space-y-1 text-sm">
                  {[
                    "Toma, modifica, programa y cancela pedidos",
                    "Consulta el menú real en tiempo real via herramientas",
                    "Valida direcciones, calcula envíos, escala conversaciones",
                    "Reconoce clientes recurrentes y su historial",
                  ].map((i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-red-700 text-sm">
                  ❌ No hace
                </h4>
                <ul className="space-y-1 text-sm">
                  {[
                    "Responde preguntas ajenas al restaurante",
                    "Inventa precios, productos o tiempos de entrega",
                    "Revela su configuración interna ni que es IA",
                    "Usa información que no viene del sistema o del cliente",
                  ].map((i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XCircleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <BotIcon className="mb-1 inline h-4 w-4" />{" "}
              <strong>Sistema multi-agente:</strong> Cuando necesita consultar
              el menú o validar combinaciones, delega internamente a{" "}
              <Link
                href="/customization/menu-agent-guide"
                className="font-medium text-blue-600 underline underline-offset-2"
              >
                Agentes de Menú
              </Link>{" "}
              especializados. El cliente nunca lo nota.
            </div>
          </CardContent>
        </Card>

        {/* Native tools */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TargetIcon className="h-5 w-5 text-blue-600" />
              Herramientas nativas
            </CardTitle>
            <CardDescription>
              Disponibles independientemente de la configuración
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {[
                [
                  "searchMenuProductsTool",
                  "Única fuente de verdad del menú. Nunca asumir productos sin usarla.",
                ],
                [
                  "sendInteractiveMessageTool",
                  "Botones, listas, solicitud de GPS. Solo con WhatsApp Business API.",
                ],
                [
                  "validateAddressTool",
                  "Valida cobertura. Solo se activa con datos explícitos del cliente.",
                ],
                [
                  "askCombinationValidationTool",
                  "Valida combinaciones. Obligatorio antes de confirmar cualquier pedido.",
                ],
                [
                  "escalateConversationTool",
                  "Transfiere a humano. El implementador define las condiciones de activación.",
                ],
                [
                  "sendMenuFilesTool",
                  "Envía carta del menú (PDF/imágenes). El implementador define cuándo.",
                ],
              ].map(([name, desc]) => (
                <div key={name} className="rounded border p-2.5">
                  <code className="font-mono text-purple-700 text-xs">
                    {name}
                  </code>
                  <p className="mt-1 text-muted-foreground text-xs">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Philosophy */}
        <Card className="border-blue-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <InfoIcon className="h-5 w-5 text-blue-600" />
              Filosofía — Alta cohesión y bajo acoplamiento
            </CardTitle>
            <CardDescription>
              El norte mental con el que actúas en cada decisión de
              configuración
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border-blue-400 border-l-4 bg-blue-50 p-4 text-blue-900 text-sm">
              Este principio aplica en <strong>dos niveles</strong>:
              <ul className="mt-2 space-y-1">
                <li>
                  <strong>Entre los 5 campos:</strong> cada campo tiene un
                  propósito único — no mezcles contenido entre ellos.
                </li>
                <li>
                  <strong>Entre la personalización y el proyecto:</strong> el
                  menú, las sucursales, las áreas de entrega, la configuración y
                  los combos ya resuelven sus datos determinísticamente. No los
                  dupliques en instrucciones.
                </li>
              </ul>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-3 py-2 text-left font-semibold">
                      Sección del proyecto
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Gestiona determinísticamente
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      ¿Promptear?
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    [
                      "/menu",
                      "Menú",
                      "Productos, precios, categorías, disponibilidad",
                      "bad",
                      "No promptear precios ni productos. Sí puedes definir cómo presentar la información (orden, cantidad de opciones, etc.)",
                    ],
                    [
                      "/restaurant-locations",
                      "Sucursales",
                      "Nombre, dirección, horarios, estado actual",
                      "bad",
                      "No promptear horarios ni direcciones. Sí puedes definir cómo el agente comunica el estado de apertura.",
                    ],
                    [
                      "/delivery-areas",
                      "Áreas de entrega",
                      "Zonas, tarifas, condiciones de cobertura",
                      "conditional",
                      "No promptear tarifas ni zonas exactas. El agente no ve las zonas — sí vale indicarlas a grandes rasgos (ej: Medellín, Área Metropolitana de Bogotá).",
                    ],
                    [
                      "/settings",
                      "Configuración",
                      "Tipos de pedido, métodos de pago, facturación",
                      "conditional",
                      "No actives lo que no está habilitado. Sí puedes definir la experiencia de cada método (qué dice el agente, cuándo compartir datos bancarios).",
                    ],
                    [
                      "/combos",
                      "Combos",
                      "Combinaciones válidas de productos",
                      "bad",
                      "No promptear combinaciones — el agente las valida via herramienta automáticamente.",
                    ],
                  ].map(([href, name, manages, type, note]) => (
                    <tr key={href as string}>
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={href as string}
                          className="text-blue-600 underline underline-offset-2"
                        >
                          {name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {manages}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-0.5 font-medium text-xs ${
                            type === "bad"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {type === "bad" ? "❌ Evitar" : "⚠️ Condicional"}
                        </span>
                        <p className="mt-1 text-muted-foreground text-xs">
                          {note}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-blue-900 text-sm">
              💡 <strong>Norte mental:</strong> antes de escribir cualquier
              instrucción, pregúntate:{" "}
              <em>
                &ldquo;¿Hay una sección del proyecto que ya resuelve esto
                determinísticamente?&rdquo;
              </em>{" "}
              Si la hay, configúralo ahí. Si necesitas definir el <em>cómo</em>{" "}
              lo maneja el agente, hazlo en el campo correcto sin repetir el
              dato en sí.
            </div>
          </CardContent>
        </Card>

        {/* Menu contamination — the most common violation */}
        <Card className="border-red-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5 text-red-600" />
              El error más frecuente — Contaminar el agente con el menú
            </CardTitle>
            <CardDescription>
              Por qué ocurre, cuándo sí aplica, y la solución correcta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border-red-400 border-l-4 bg-red-50 p-4 text-red-900 text-sm">
              <strong>El problema:</strong> Para explicar reglas de negocio
              relacionadas al menú (ingredientes, condiciones de un producto,
              restricciones) se intenta hacerlo nombrando productos, categorías
              o precios directamente en las instrucciones del agente. Esto viola
              la responsabilidad del menú Y genera deuda técnica inmediata:
              cuando el menú cambie, las instrucciones quedan desactualizadas.
            </div>

            <div className="space-y-3">
              <CodeBlock
                variant="bad"
                label="❌ Mal — nombra productos y reglas de menú directamente"
                code={`REGLAS_NEGOCIO:
  - La Burger Clásica no puede llevar aguacate extra
  - El Combo Familiar incluye 4 gaseosas, se pueden cambiar
    por jugos naturales sin costo adicional
  - El Hot Dog Jumbo requiere elección de salsa entre:
    mostaza, ketchup o rosada`}
              />
              <CodeBlock
                variant="good"
                label="✅ Bien — el agente lee las reglas desde las instrucciones del producto"
                code={`INSTRUCCIONES_PRODUCTO:
  principio: "Las instrucciones de cada producto vienen del menú
    vía palabras clave. Interprétalas así:"

  CONSULTAR: "El producto requiere que el cliente elija algo
    antes de confirmarlo. SIEMPRE pregunta antes de agregar."

  CAMBIOS: "El producto permite modificaciones o intercambios
    según lo indicado. Anota textualmente la combinación final."

  AL_GUSTO: "Lista de personalizaciones opcionales disponibles.
    Ofrécelas solo si el cliente pregunta o si aplica al pedido."`}
              />
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="mb-2 font-semibold text-blue-900">
                💡 La solución: instrucciones de producto como puente
              </h4>
              <p className="text-blue-800 text-sm">
                El proyecto dispone de un mecanismo de{" "}
                <strong>instrucciones de producto</strong> que actúa como puente
                entre el menú y el agente principal. Las reglas de un producto
                se definen <em>en el menú</em> usando palabras clave
                estandarizadas. El agente principal, al recibir un producto con
                estas instrucciones, sabe exactamente cómo manejarlo — sin que
                nadie haya tenido que hardcodear el nombre del producto en sus
                instrucciones.
              </p>
              <p className="mt-2 text-blue-700 text-xs">
                Ver sección completa más abajo ↓
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <strong>¿Y si la regla es más compleja?</strong> Las reglas de
              presentación, combinación y comportamiento avanzado de productos
              van en los{" "}
              <Link
                href="/customization/menu-agent-guide"
                className="font-medium text-blue-600 underline underline-offset-2"
              >
                Agentes de Menú
              </Link>
              , no en el Agente Principal.
            </div>
          </CardContent>
        </Card>

        {/* Product instructions system */}
        <Card className="border-green-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-green-600" />
              Instrucciones de Producto — El puente entre el Menú y el Agente
            </CardTitle>
            <CardDescription>
              Cómo el menú le comunica reglas al agente sin contaminar sus
              instrucciones
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border-green-400 border-l-4 bg-green-50 p-4 text-green-900 text-sm">
              <strong>Concepto:</strong> Cada producto del menú puede tener
              instrucciones embebidas usando palabras clave estandarizadas. El
              agente principal recibe estas instrucciones junto con los datos
              del producto y sabe interpretarlas. Esto permite que las reglas de
              negocio de un producto vivan donde corresponde —{" "}
              <strong>en el menú</strong> — sin que el implementador necesite
              replicarlas en el prompt del agente.
            </div>

            <div>
              <h4 className="mb-3 font-semibold">
                Ejemplo real de instrucciones en un producto del menú
              </h4>
              <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 font-mono text-gray-100 text-xs leading-relaxed">
                {`CONSULTAR: ¿Cuál Elección?
CAMBIOS: Se puede combinar o intercambiar (SIN ADICIONAR) las proteínas
  principales libremente. Anota textualmente la combinación final elegida.
AL GUSTO:
  - con cebolla
  - con papa molida
  - descarte de ingredientes del producto (excepto el pan)
  - descarte de salsas
  - salsas en las papas (roja, rosada, piña y tártara)
  - se puede dividir/partir en 2 y empacar cada parte por separado`}
              </pre>
            </div>

            <div>
              <h4 className="mb-3 font-semibold">
                Palabras clave y su significado
              </h4>
              <div className="space-y-3">
                {[
                  {
                    keyword: "CONSULTAR",
                    color: "amber",
                    title: "El producto requiere una elección previa",
                    desc: "El agente DEBE preguntar al cliente antes de agregar el producto al pedido. No puede asumirlo ni agregarlo sin confirmación.",
                    example:
                      'CONSULTAR: ¿Cuál Elección?\n→ El agente pregunta antes de confirmar: "¡De una! ¿Cuál eliges?"',
                  },
                  {
                    keyword: "CAMBIOS",
                    color: "blue",
                    title: "El producto permite modificaciones o intercambios",
                    desc: "Define qué puede cambiarse y bajo qué condiciones. El agente anota textualmente la combinación que elija el cliente.",
                    example:
                      "CAMBIOS: Se pueden intercambiar proteínas libremente (SIN ADICIONAR)\n→ El agente ofrece las opciones y registra la elección exacta.",
                  },
                  {
                    keyword: "AL GUSTO",
                    color: "green",
                    title: "Personalizaciones opcionales disponibles",
                    desc: "Lista de opciones que el cliente puede solicitar. El agente las ofrece solo cuando aplica o cuando el cliente pregunta — no las enuncia por defecto.",
                    example:
                      "AL GUSTO:\n  - sin cebolla\n  - salsas en las papas\n→ El agente gestiona cada solicitud de personalización",
                  },
                ].map(({ keyword, color, title, desc, example }) => (
                  <div key={keyword} className="rounded-lg border p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <code
                        className={`rounded px-2 py-0.5 font-bold font-mono text-sm ${
                          color === "amber"
                            ? "bg-amber-100 text-amber-800"
                            : color === "blue"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                        }`}
                      >
                        {keyword}
                      </code>
                      <span className="font-medium text-sm">{title}</span>
                    </div>
                    <p className="mb-2 text-muted-foreground text-sm">{desc}</p>
                    <pre className="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-gray-700 text-xs leading-relaxed">
                      {example}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h4 className="mb-2 font-semibold text-amber-900 text-sm">
                ⚠️ Quién determina las palabras clave
              </h4>
              <p className="text-amber-800 text-sm">
                Las palabras clave (<code>CONSULTAR</code>, <code>CAMBIOS</code>
                , <code>AL GUSTO</code>) son definidas en el menú, producto por
                producto. El agente principal no necesita conocer el nombre del
                producto para entender cómo manejarlo — lee la instrucción y
                actúa. Por esto es importante que las reglas de interpretación
                de estas palabras clave estén correctamente definidas en el
                campo de <strong>Instrucciones Especiales</strong> del agente
                principal, y replicadas en los{" "}
                <Link
                  href="/customization/menu-agent-guide"
                  className="font-medium text-blue-600 underline underline-offset-2"
                >
                  Agentes de Menú
                </Link>{" "}
                para que todos los agentes del flujo operen con el mismo
                criterio.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* YAML format */}
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareIcon className="h-5 w-5 text-green-600" />
              Formato recomendado — YAML
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-green-400 border-l-4 bg-green-50 p-4 text-green-900 text-sm">
              <strong>YAML es el formato predilecto</strong> para escribir
              instrucciones. Los modelos de lenguaje procesan mejor información
              estructurada jerárquicamente que bloques de texto libre: jerarquía
              explícita por indentación, llaves únicas como anclas semánticas, y
              listas discretas que el modelo procesa ítem por ítem.
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <CodeBlock
                variant="bad"
                label="❌ Texto libre — ambiguo"
                code={`El agente debe ser directo y no usar frases
largas. Cuando el cliente pida algo que no
existe en el menú debe disculparse y ofrecer
algo similar. Si hay problemas con el pago
debe escalar pero solo si el cliente lo pide
explícitamente...`}
              />
              <CodeBlock
                variant="good"
                label="✅ YAML — estructurado y sin ambigüedad"
                code={`NUCLEO_COMUNICACION:
  estilo: directo y sin adornos
  prohibido:
    - frases de relleno
    - preguntas retóricas

PRODUCTO_NO_DISPONIBLE:
  accion: disculparse brevemente
  siguiente: ofrecer alternativa

PROBLEMAS_PAGO:
  condicion: cliente lo solicita
  accion: escalar conversación`}
              />
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <strong>Convención:</strong> nombra tus bloques en{" "}
              <code>MAYÚSCULAS_CON_GUIONES</code>. Actúan como anclas semánticas
              dentro del prompt — el agente puede referenciarlos por nombre en
              la jerarquía de protocolos que defines en el{" "}
              <em>Contexto del Restaurante</em>.
            </div>
          </CardContent>
        </Card>

        {/* The 5 fields */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareIcon className="h-5 w-5 text-orange-600" />
              Los 5 campos editables — Criterio, ejemplos y errores comunes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border-orange-400 border-l-4 bg-orange-50 p-4 text-orange-900 text-sm">
              El agente prioriza estos campos de forma diferente. Poner
              contenido en el campo incorrecto es causa frecuente de
              comportamientos erráticos — no porque no lo lea, sino porque lo
              pondera diferente.
            </div>

            <Accordion type="multiple" className="w-full">
              {/* Field 1 */}
              <AccordionItem value="f1">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-600 text-xs">1</Badge>
                    <span>Contexto del Restaurante — Marco general</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <p className="text-muted-foreground text-sm">
                    Le dice al agente <em>quién eres y cuál es su función</em>.
                    El campo más estratégico: aquí también defines la{" "}
                    <strong>jerarquía de precedencia</strong> entre los bloques
                    YAML que defines en otros campos.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <CodeBlock
                      variant="good"
                      label="✅ Bien — identidad + jerarquía por nombre de bloques"
                      code={`ROL_E_IDENTIDAD:
  nombre: "Ardessa"
  funcion: "Asistente de toma de pedidos"
  objetivo: "Cero fricción"
  marca: "Escudero's BBQ"
  cobertura: "Parte de Medellín"

JERARQUIA_DE_PROTOCOLOS:
  orden_de_precedencia:
    1. "REGLA_DE_ORO_PRECIOS: INVIOLABLE"
    2. "PRINCIPIO_DE_VERACIDAD"
    3. "NUCLEO_COMUNICACION: Estilo (activo siempre)"
    4. "PROTOCOLOS_NEGOCIO: Lógica (activos por situación)"`}
                    />
                    <CodeBlock
                      variant="bad"
                      label="❌ Mal — mezcla horarios, precios y comportamiento"
                      code={`El restaurante se llama Escudero's BBQ. Atendemos
de lunes a viernes de 11am a 10pm y sábados de
12pm a 11pm. La hamburguesa clásica cuesta 18.000
y el combo con papas y gaseosa 27.000. El agente
debe ser amable y siempre ofrecer postres al final
del pedido.`}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Field 2 */}
              <AccordionItem value="f2">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-600 text-xs">2</Badge>
                    <span>Personalidad y Estilo — Cómo habla el agente</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <p className="text-muted-foreground text-sm">
                    Se aplica en cada mensaje. Un implementador experto lo
                    estructura con <strong>reglas activas</strong> y{" "}
                    <strong>prohibiciones explícitas</strong>. Los ejemplos
                    NO/SÍ son la técnica más efectiva para calibrar el tono.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <CodeBlock
                      variant="good"
                      label="✅ Bien — prohibiciones específicas con ejemplos NO/SÍ"
                      code={`NUCLEO_COMUNICACION:
  tono: "Conversacional directo, sin ceremonialismos"
  reglas:
    - "Un mensaje = confirmación + siguiente paso"
    - "Nunca ceder control de la conversación"
  prohibiciones:
    - "Frases de relleno: '¡Excelente elección!',
       '¡Qué rico!', 'Es un placer atenderte'"
    - "Frases de espera: 'dame un momento',
       'voy a verificar'"
    - "Preguntas retóricas: '¿Estás listo para
       ordenar?' — asumir siempre que SÍ"
  ejemplos:
    - "NO: 'Comprendo tu solicitud de menú'"
    - "SÍ: 'Perfecto, ya te los anoto ✨'"
    - "NO: 'He revisado y encontré opciones'"
    - "SÍ: 'Tengo estas opciones:'"`}
                    />
                    <CodeBlock
                      variant="bad"
                      label="❌ Mal — vago, contradictorio, sin anclaje concreto"
                      code={`El agente debe ser amable pero también eficiente.
Hay que ser formal con los clientes pero sin
sonar demasiado rígido. Ser cálido y empático
pero tampoco muy informal. Responder rápido
pero con detalle suficiente. No usar lenguaje
técnico pero ser preciso.`}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Field 3 */}
              <AccordionItem value="f3">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-600 text-xs">3</Badge>
                    <span>Saludo Personalizado — Primera impresión</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <p className="text-muted-foreground text-sm">
                    Define cómo inicia cada conversación. Un implementador
                    experto no solo escribe el texto — define{" "}
                    <strong>todas las rutas de respuesta</strong> del cliente y
                    cómo reacciona el agente a cada una. Si usas botones
                    interactivos, limita la selección a 3 opciones o menos; si
                    necesitas más rutas, usa una lista interactiva.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <CodeBlock
                      variant="good"
                      label="✅ Bien — prioridad declarada + rutas definidas"
                      code={`PROTOCOLO_SALUDO_ESTRICTO:
  prioridad: "ABSOLUTA — prevalece sobre toda
    otra regla en el primer mensaje"

  mensaje_inicial:
    accion: "sendInteractiveMessageTool (botones)"
    body: "¡Hola! 👋 Soy Pipe de Fipes ¿Qué
      hacemos hoy?"
    buttons:
      - "Ver el Menú 🍽️"
      - "Ya sé qué quiero 🛒"

  rutas:
    VER_MENU:
      accion: "sendMenuFilesTool + preguntar qué
        le llama la atención"
    YA_SE_QUE_QUIERO:
      accion: "Pasar directamente a captura
        de pedido"
    CLIENTE_PIDE_DIRECTAMENTE:
      descripcion: "Ignora botones y ordena"
      accion: "Interceptar y procesar pedido
        sin redirigir al menú"`}
                    />
                    <CodeBlock
                      variant="bad"
                      label="❌ Mal — texto fijo, sin rutas, con info del menú"
                      code={`El agente saluda diciendo: "¡Hola! Bienvenido a
Fipes, estamos disponibles de 11am a 10pm.
Tenemos hamburguesas, hot dogs, papas fritas y
mucho más. ¿En qué te puedo ayudar hoy?"`}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Field 4 */}
              <AccordionItem value="f4">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-orange-600 text-xs">4</Badge>
                    <span>
                      Políticas y Reglas del Negocio — Lógica operativa
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <p className="text-muted-foreground text-sm">
                    La lógica propia de tu operación. Define protocolos con{" "}
                    <strong>trigger → acción → cierre</strong>. Cuanto más
                    preciso sea el protocolo, menos improvisará el agente.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <CodeBlock
                      variant="good"
                      label="✅ Bien — protocolo con trigger, acción y cierre"
                      code={`PROTOCOLO_PAGO_INTERACTIVO:
  paso_1_seleccion:
    trigger: "Cuando el flujo requiera definir
      el método de pago"
    accion: "sendInteractiveMessageTool (botones)"
    body: "¿Qué medio de pago prefieres? 💸"

  paso_2_respuestas:
    caso_efectivo:
      trigger: "Selección de Efectivo"
      respuesta: "Perfecto 👌 ¿Con cuánto
        cancelas para llevarte devuelta?"
    caso_transferencia:
      trigger: "Selección de Transferencia"
      respuesta: "💳 Puedes transferir a:
        [DATOS_EN_INSTRUCCIONES_ESPECIALES]
        Envíame el comprobante 🙌"

CIERRE_DE_PEDIDO:
  trigger: "Cliente rechaza upselling o
    dice 'solo eso'"
  accion: "Iniciar cierre INMEDIATAMENTE sin
    preguntar '¿Algo más?'"
  prohibido: "Preguntar '¿Algo más?' — el
    cliente ya indicó que es todo"`}
                    />
                    <CodeBlock
                      variant="bad"
                      label="❌ Mal — nombra productos y precios del menú"
                      code={`Cuando el cliente pida la Burger Especial de
18.000, preguntar si la quiere sencilla o
doble. Si pide el Combo Familiar de 65.000,
incluir automáticamente 4 gaseosas. Si pide
el Hot Dog Básico, preguntar si quiere agregar
papas por 5.000 adicionales.`}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Field 5 */}
              <AccordionItem value="f5">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-red-600 text-xs">5</Badge>
                    <span>
                      Instrucciones Especiales — Casos puntuales y palabras
                      clave
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <p className="text-muted-foreground text-sm">
                    El campo más flexible. Aquí van instrucciones con condición
                    de activación específica — incluida la{" "}
                    <strong>
                      interpretación de palabras clave de producto
                    </strong>{" "}
                    (<code>CONSULTAR</code>, <code>CAMBIOS</code>,{" "}
                    <code>AL GUSTO</code>).
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <CodeBlock
                      variant="good"
                      label="✅ Bien — reglas de palabras clave + condicionamiento"
                      code={`INSTRUCCIONES_PRODUCTO:
  CONSULTAR:
    significado: "El producto requiere una
      elección antes de agregarse"
    accion: "Preguntar SIEMPRE antes de
      confirmar. No asumir."

  CAMBIOS:
    significado: "El producto permite
      intercambios según lo indicado"
    accion: "Ofrecer opciones disponibles.
      Anotar la combinación elegida
      textualmente."

  AL_GUSTO:
    significado: "Lista de personalizaciones
      opcionales"
    accion: "Gestionar cada solicitud.
      No enunciarlas por defecto."

DATOS_BANCARIOS:
  condicion: "SOLO mostrar tras confirmar
    pedido exitosamente"
  template: |
    Banco: Bancolombia
    Tipo: Ahorros
    No: 123-456789-00
    A nombre de: Restaurante XYZ`}
                    />
                    <CodeBlock
                      variant="bad"
                      label="❌ Mal — datos del menú, sin condición de activación"
                      code={`El agente debe saber que las hamburguesas
vienen con lechuga, tomate y cebolla. El
cliente puede pedir sin cebolla. Los datos
bancarios son: Bancolombia 123-456789.
Siempre ofrecer postres al final.`}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Prompt Builder */}
        <Card className="border-indigo-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <InfoIcon className="h-5 w-5 text-indigo-600" />
              Constructor de Prompts — Herramienta de diagnóstico
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border-indigo-400 border-l-4 bg-indigo-50 p-4 text-indigo-900 text-sm">
              Muestra el <strong>system prompt completo</strong> tal como lo
              recive el agente: tus personalizaciones, el protocolo base,
              herramientas y contexto dinámico (menú, cliente, horarios). Es tu
              herramienta primaria para entender comportamientos inesperados.
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {[
                [
                  "🔍 Aprender",
                  "Estudia el core antes de escribir — lo que ya está ahí no necesita repetirse.",
                ],
                [
                  "🐛 Diagnosticar",
                  "Ante cualquier comportamiento raro, revisa el prompt primero. La mayoría de los problemas son visibles.",
                ],
                [
                  "👤 Simular",
                  "Selecciona un contacto real para ver el prompt con su historial y datos.",
                ],
                [
                  "📋 Auditar",
                  'La pestaña "Secciones Personalizadas" muestra el contenido exacto de cada campo.',
                ],
              ].map(([t, d]) => (
                <div key={t} className="rounded bg-indigo-50 p-3">
                  <strong>{t}:</strong> {d}
                </div>
              ))}
            </div>
            <div className="flex justify-center pt-1">
              <Link href="/prompt-builder">
                <Button className="flex items-center gap-2">
                  <ExternalLinkIcon className="h-4 w-4" />
                  Ir al Constructor de Prompts
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Golden rules */}
        <Card>
          <CardHeader>
            <CardTitle>🏆 Reglas de Oro del Implementador</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "1",
                  "Configura primero, promptea después.",
                  "Si el proyecto tiene una sección para ello, úsala.",
                ],
                [
                  "2",
                  "Alta cohesión:",
                  "cada campo, un propósito. Sin mezclar contenido.",
                ],
                [
                  "3",
                  "Bajo acoplamiento:",
                  "cada campo funciona sin referenciar a los otros ni hardcodear datos del proyecto.",
                ],
                [
                  "4",
                  "YAML sobre texto libre.",
                  "Jerarquía explícita, llaves únicas, listas discretas.",
                ],
                [
                  "5",
                  "Prohibiciones explícitas.",
                  "Tan importantes como las reglas positivas.",
                ],
                [
                  "6",
                  "Define todas las rutas.",
                  "Si hay opciones para el cliente, define qué pasa con cada una.",
                ],
                [
                  "7",
                  "Palabras clave de producto.",
                  "Las reglas del menú viajan al agente via CONSULTAR, CAMBIOS, AL GUSTO — no via instrucciones directas.",
                ],
                [
                  "8",
                  "El Constructor para diagnosticar.",
                  "Ante cualquier raro, revisa el prompt completo.",
                ],
                [
                  "9",
                  "Escala antes que acumular deuda.",
                  "Un bloqueo estructural hay que consultarlo.",
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

            <div className="mt-6 flex justify-center">
              <Link href="/customization/menu-agent-guide">
                <Button variant="outline" className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Continuar con la Guía de Agentes de Menú →
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
