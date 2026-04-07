import { ConvexError } from "convex/values"
export class UnauthorizedError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message: string) {
    super({
      code: "UNAUTHORIZED",
      message: message,
    })
  }
}

export class IdentityNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "UNAUTHORIZED",
      message: message || "Identidad no encontrada",
    })
  }
}

export class OrganizationNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "UNAUTHORIZED",
      message: message || "Organización no encontrada",
    })
  }
}

export class ConversationNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "NOT_FOUND",
      message: message || "Conversación no encontrada",
    })
  }
}

export class ContactNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "NOT_FOUND",
      message: message || "Contacto no encontrado",
    })
  }
}

export class OrderNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "NOT_FOUND",
      message: message || "Pedido no encontrado",
    })
  }
}
export class MenuProductNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "NOT_FOUND",
      message: message || "Producto no encontrado",
    })
  }
}

export class DeliveryAreaNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "NOT_FOUND",
      message: message || "Área de entrega no encontrada",
    })
  }
}

export class DeliveryAreaAlreadyExistsError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "BAD_REQUEST",
      message: message || "Área de entrega ya existe",
    })
  }
}

export class WhatsappConfigurationNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "NOT_FOUND",
      message: message || "Configuración de WhatsApp no encontrada",
    })
  }
}

export class TwilioConfigurationNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "NOT_FOUND",
      message: message || "Configuración de Twilio no encontrada",
    })
  }
}

export class Dialog360ConfigurationNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "NOT_FOUND",
      message: message || "Configuración de 360dialog no encontrada",
    })
  }
}

export class GupshupConfigurationNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "NOT_FOUND",
      message: message || "Configuración de Gupshup no encontrada",
    })
  }
}

export class AgentConfigurationNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message?: string) {
    super({
      code: "NOT_FOUND",
      message: message || "Configuración de agente no encontrada",
    })
  }
}

export class NotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message: string) {
    super({
      code: "NOT_FOUND",
      message: message,
    })
  }
}

export class BadRequestError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message: string) {
    super({
      code: "BAD_REQUEST",
      message,
    })
  }
}

export class ForbiddenError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message: string) {
    super({
      code: "FORBIDDEN",
      message: message,
    })
  }
}

export class CreationFailedError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(message: string) {
    super({
      code: "CREATION_FAILED",
      message: message,
    })
  }
}

export class RestaurantLocationNotFoundError extends ConvexError<{
  code: string
  message: string
}> {
  constructor() {
    super({
      code: "NOT_FOUND",
      message: "Ubicación del restaurante no encontrada",
    })
  }
}

export class DuplicatePriorityError extends ConvexError<{
  code: string
  message: string
}> {
  constructor(priority: number) {
    super({
      code: "BAD_REQUEST",
      message: `Ya existe una sucursal con prioridad ${priority}. Por favor elige una prioridad diferente.`,
    })
  }
}
