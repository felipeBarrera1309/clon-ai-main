import z from "zod"
import { createTaggedTool } from "./toolWrapper"

export const requestInvoiceData = createTaggedTool({
  description:
    "Solicita en un único mensaje todos los datos requeridos para factura electrónica. Retorna una plantilla de captura completa para confirmar si aplica factura y sus campos obligatorios.",
  args: z.object({}),
  handler: async (): Promise<string> => {
    return `📄 FACTURA ELECTRÓNICA

¿Requiere factura electrónica personalizada? (Responda "sí" o "no")

Si SÍ requiere factura, proporcione la siguiente información COMPLETA en su respuesta:

TIPO DE FACTURA:
• Persona Natural (con cédula) O Empresa/Jurídica (con NIT)

DATOS OBLIGATORIOS PARA AMBOS TIPOS:
• Correo electrónico (ejemplo: nombre@email.com)
• Nombre completo / Razón social

DATOS ADICIONALES SEGÚN TIPO:
• Para Persona Natural: Número de cédula (solo números, 6-10 dígitos, ej: 12345678)
• Para Empresa/Jurídica: NIT (9 dígitos + verificación, ej: 901234567-8 o 9012345678)

💡 IMPORTANTE:
• Todos los campos son OBLIGATORIOS si requiere factura
• Si no requiere factura, simplemente responda "no"
• Si requiere factura pero no proporciona todos los datos, se le solicitará nuevamente

Ejemplo de respuesta completa:
"Sí, persona natural, juanperez@email.com, Juan Pérez González, 12345678"`
  },
})
