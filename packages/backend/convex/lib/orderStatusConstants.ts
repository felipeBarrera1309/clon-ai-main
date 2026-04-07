export const DEFAULT_ORDER_STATUS_MESSAGES = {
  delivery: {
    programado: "Tu pedido ha sido programado para entrega futura.",
    pendiente: "Tu pedido ha sido recibido y está pendiente de preparación.",
    preparando: "Tu pedido ha empezado a ser preparado.",
    listo_para_recoger:
      "¡Tu pedido está listo! El repartidor pasará pronto a recogerlo para llevarlo a tu dirección.",
    en_camino: "¡Tu pedido va en camino! Pronto llegará a tu dirección.",
    entregado: "¡Pedido entregado! Gracias por elegirnos. ¡Que lo disfrutes!",
    cancelado:
      "Lo sentimos, tu pedido ha sido cancelado. Contáctanos para más información.",
  },
  pickup: {
    programado: "Tu pedido ha sido programado para recogida futura.",
    pendiente: "Tu pedido ha sido recibido y está pendiente de preparación.",
    preparando: "Tu pedido ha empezado a ser preparado.",
    listo_para_recoger:
      "¡Tu pedido está listo para recoger! Ven al restaurante cuando puedas.",
    entregado: "¡Pedido completado! Gracias por elegirnos. ¡Que lo disfrutes!",
    cancelado:
      "Lo sentimos, tu pedido ha sido cancelado. Contáctanos para más información.",
    en_camino: "No aplicable para pickup",
  },
} as const

export type OrderStatusMessages = typeof DEFAULT_ORDER_STATUS_MESSAGES
