import type { Doc, Id } from "@workspace/backend/_generated/dataModel"

// Define local types based on Convex schema
type OrderStatus = Doc<"orders">["status"]
type OrderType = Doc<"orders">["orderType"]

// Order with items (as returned by the orders.list query)
type OrderWithItems = Doc<"orders"> & {
  items: Array<{
    _id: Id<"orderItems">
    _creationTime: number
    orderId: Id<"orders">
    quantity: number
    unitPrice: number
    totalPrice: number
    notes?: string
    products: Array<{
      _id: Id<"menuProducts">
      name: string
      description: string
      price: number
      categoryName: string
      sizeName?: string
    }>
  }>
}

// Mock data generators for testing infinite scroll
const MOCK_FIRST_NAMES = [
  "Juan",
  "María",
  "Carlos",
  "Ana",
  "Luis",
  "Carmen",
  "José",
  "Isabel",
  "Miguel",
  "Pilar",
  "Antonio",
  "Teresa",
  "Francisco",
  "Cristina",
  "David",
  "Laura",
  "Javier",
  "Elena",
  "Manuel",
  "Patricia",
  "Pedro",
  "Mercedes",
  "Ángel",
  "Dolores",
  "Rafael",
  "Rosa",
  "Fernando",
  "Concepción",
  "Pablo",
  "Pilar",
  "Sergio",
  "Lucía",
  "Diego",
  "Sonia",
  "Adrián",
  "Marta",
  "Rubén",
  "Raquel",
  "Iván",
  "Silvia",
  "Óscar",
  "Beatriz",
  "Hugo",
  "Nuria",
  "Víctor",
  "Inés",
  "Alberto",
  "Alicia",
  "Roberto",
  "Eva",
]

const MOCK_LAST_NAMES = [
  "García",
  "Rodríguez",
  "González",
  "Fernández",
  "López",
  "Martínez",
  "Sánchez",
  "Pérez",
  "Martín",
  "Ruiz",
  "Hernández",
  "Jiménez",
  "Díaz",
  "Moreno",
  "Álvarez",
  "Muñoz",
  "Romero",
  "Navarro",
  "Torres",
  "Gil",
  "Ramírez",
  "Serrano",
  "Blanco",
  "Suárez",
  "Molina",
  "Morales",
  "Ortega",
  "Delgado",
  "Castro",
  "Ortiz",
  "Rubio",
  "Sanz",
  "Iglesias",
  "Nuñez",
  "Medina",
  "Cortés",
  "Castillo",
  "Santos",
  "Lozano",
  "Guerrero",
]

const MOCK_PRODUCTS = [
  { name: "Pizza Margherita", price: 25000, category: "Pizzas" },
  { name: "Pizza Pepperoni", price: 28000, category: "Pizzas" },
  { name: "Pizza Hawaiana", price: 27000, category: "Pizzas" },
  { name: "Pizza Vegetariana", price: 26000, category: "Pizzas" },
  { name: "Hamburguesa Clásica", price: 18000, category: "Hamburguesas" },
  { name: "Hamburguesa Doble", price: 22000, category: "Hamburguesas" },
  { name: "Perro Caliente", price: 12000, category: "Perros" },
  { name: "Salchipapa", price: 15000, category: "Papas" },
  { name: "Coca-Cola 350ml", price: 3000, category: "Bebidas" },
  { name: "Agua 500ml", price: 2000, category: "Bebidas" },
  { name: "Jugo Natural", price: 5000, category: "Bebidas" },
  { name: "Helado de Vainilla", price: 8000, category: "Postres" },
  { name: "Torta de Chocolate", price: 12000, category: "Postres" },
]

const MOCK_STREET_NAMES = [
  "Calle 1",
  "Carrera 2",
  "Avenida 3",
  "Diagonal 4",
  "Transversal 5",
  "Calle 6",
  "Carrera 7",
  "Avenida 8",
  "Diagonal 9",
  "Transversal 10",
  "Calle 11",
  "Carrera 12",
  "Avenida 13",
  "Diagonal 14",
  "Transversal 15",
]

const MOCK_NEIGHBORHOODS = [
  "Centro",
  "Norte",
  "Sur",
  "Este",
  "Oeste",
  "Chapinero",
  "Teusaquillo",
  "Usaquén",
  "Suba",
  "Engativá",
  "Fontibón",
  "Kennedy",
  "Bosa",
  "Ciudad Bolívar",
]

function generateRandomPhone(): string {
  const prefix = [
    "300",
    "301",
    "302",
    "303",
    "304",
    "305",
    "310",
    "311",
    "312",
    "313",
    "314",
    "315",
    "316",
    "317",
    "318",
    "319",
    "320",
    "321",
    "322",
  ][Math.floor(Math.random() * 19)]
  const number = Math.floor(Math.random() * 10000000)
    .toString()
    .padStart(7, "0")
  return `${prefix}${number}`
}

function generateRandomName(): string {
  const firstName =
    MOCK_FIRST_NAMES[Math.floor(Math.random() * MOCK_FIRST_NAMES.length)]
  const lastName =
    MOCK_LAST_NAMES[Math.floor(Math.random() * MOCK_LAST_NAMES.length)]
  return `${firstName} ${lastName}`
}

function generateRandomAddress(): string {
  const street =
    MOCK_STREET_NAMES[Math.floor(Math.random() * MOCK_STREET_NAMES.length)]
  const number = Math.floor(Math.random() * 200) + 1
  const neighborhood =
    MOCK_NEIGHBORHOODS[Math.floor(Math.random() * MOCK_NEIGHBORHOODS.length)]
  return `${street} #${number}, ${neighborhood}, Bogotá`
}

function generateRandomScheduledTime(): number | undefined {
  // 30% chance of being scheduled
  if (Math.random() > 0.3) return undefined

  const now = Date.now()
  const minAdvance = 30 * 60 * 1000 // 30 minutes
  const maxAdvance = 7 * 24 * 60 * 60 * 1000 // 7 days

  return now + minAdvance + Math.random() * (maxAdvance - minAdvance)
}

export function generateMockOrderById(orderId: string): OrderWithItems | null {
  // Extract the index from the mock order ID (e.g., "mock-order-5" -> 5)
  const match = orderId.match(/^mock-order-(\d+)$/)
  if (!match || !match[1]) return null

  const index = parseInt(match[1], 10)

  // Use the index as seed for reproducible random data
  const seedRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }

  // Generate seeded random functions
  const seededRandom = (seed: number) => seedRandom(seed + index)
  const seededFloor = (seed: number, max: number) =>
    Math.floor(seededRandom(seed) * max)

  // Generate customer data with seeded randomness
  const firstName = MOCK_FIRST_NAMES[seededFloor(1, MOCK_FIRST_NAMES.length)]
  const lastName = MOCK_LAST_NAMES[seededFloor(2, MOCK_LAST_NAMES.length)]
  const customerName = `${firstName} ${lastName}`

  const phonePrefixes = [
    "300",
    "301",
    "302",
    "303",
    "304",
    "305",
    "310",
    "311",
    "312",
    "313",
    "314",
    "315",
    "316",
    "317",
    "318",
    "319",
    "320",
    "321",
    "322",
  ]
  const phonePrefix = phonePrefixes[seededFloor(3, phonePrefixes.length)]
  const phoneNumber = Math.floor(seededRandom(4) * 10000000)
    .toString()
    .padStart(7, "0")
  const customerPhone = `${phonePrefix}${phoneNumber}`

  // Random order type
  const orderType = seededRandom(5) > 0.5 ? "delivery" : "pickup"

  // Generate random items (1-5 items per order)
  const numItems = seededFloor(6, 5) + 1
  const items = []

  for (let j = 0; j < numItems; j++) {
    // Select random products (1-3 products per item)
    const numProducts = seededFloor(7 + j, 3) + 1
    const selectedProducts = []

    for (let k = 0; k < numProducts; k++) {
      const product =
        MOCK_PRODUCTS[seededFloor(8 + j + k, MOCK_PRODUCTS.length)]
      if (product) {
        selectedProducts.push({
          _id: `mock-product-${product.name.toLowerCase().replace(/\s+/g, "-")}-${k}`,
          name: product.name,
          description: `Delicioso ${product.name.toLowerCase()}`,
          price: product.price,
          categoryName: product.category,
        })
      }
    }

    const unitPrice = selectedProducts.reduce((sum, p) => sum + p.price, 0)
    const quantity = seededFloor(9 + j, 3) + 1 // 1-3 quantity

    items.push({
      _id: `mock-item-${index}-${j}` as Id<"orderItems">,
      _creationTime:
        Date.now() - seededRandom(10 + j) * 7 * 24 * 60 * 60 * 1000, // Random time in last 7 days
      orderId: orderId as Id<"orders">,
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
      notes: seededRandom(11 + j) > 0.8 ? "Sin cebolla por favor" : undefined,
      products: selectedProducts.map((p) => ({
        ...p,
        _id: p._id as Id<"menuProducts">,
      })),
    })
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0)
  const deliveryFee = orderType === "pickup" ? 0 : 5000 // Fixed delivery fee
  const total = subtotal + deliveryFee

  // Random payment method
  const paymentMethods = [
    "cash",
    "card",
    "payment_link",
    "bank_transfer",
  ] as const
  const paymentMethod =
    paymentMethods[Math.floor(Math.random() * paymentMethods.length)] || "cash"

  // Random status with weighted distribution
  const statusWeights = [
    { status: "entregado" as const, weight: 40 },
    { status: "pendiente" as const, weight: 25 },
    { status: "preparando" as const, weight: 15 },
    { status: "listo_para_recoger" as const, weight: 10 },
    { status: "en_camino" as const, weight: 5 },
    { status: "programado" as const, weight: 3 },
    { status: "cancelado" as const, weight: 2 },
  ]

  let randomWeight =
    Math.random() * statusWeights.reduce((sum, s) => sum + s.weight, 0)
  let selectedStatus = statusWeights[0]?.status ?? "pendiente"

  for (const statusOption of statusWeights) {
    randomWeight -= statusOption.weight
    if (randomWeight <= 0) {
      selectedStatus = statusOption.status
      break
    }
  }

  // Delivery address if needed
  const deliveryAddress =
    orderType === "delivery" ? generateRandomAddress() : undefined

  // Random scheduled time (only for programmed orders)
  const scheduledTime =
    selectedStatus === "programado" ? generateRandomScheduledTime() : undefined

  // Random timestamps
  const baseTime = Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000 // Random time in last 30 days
  const printedAt =
    Math.random() > 0.7
      ? baseTime + Math.random() * 24 * 60 * 60 * 1000
      : undefined
  const paidAt =
    Math.random() > 0.6
      ? baseTime + Math.random() * 24 * 60 * 60 * 1000
      : undefined

  return {
    _id: orderId as Id<"orders">,
    _creationTime: baseTime,
    orderNumber: `ORD-${String(10000 + index).padStart(5, "0")}`,
    customerName,
    customerPhone,
    organizationId: "mock-org-id",
    conversationId: `mock-conversation-${index}` as Id<"conversations">,
    contactId: `mock-contact-${index}` as Id<"contacts">,
    restaurantLocationId: "mock-location-id" as Id<"restaurantLocations">,
    subtotal,
    deliveryFee: deliveryFee || undefined,
    total,
    status: selectedStatus,
    orderType,
    deliveryAddress,
    paymentMethod,
    scheduledTime,
    printedAt,
    paidAt,
    items,
  }
}

export function generateMockOrders(count: number): OrderWithItems[] {
  const orders = []

  for (let i = 0; i < count; i++) {
    const orderId = `mock-order-${i}`
    const order = generateMockOrderById(orderId)
    if (order) {
      orders.push(order)
    }
  }

  // Sort by creation time (most recent first)
  return orders.sort(
    (a, b) => b._creationTime - a._creationTime
  ) as OrderWithItems[]
}

// React imports for mock pagination hook
import { useCallback, useEffect, useMemo, useState } from "react"

// Mock pagination hook that simulates usePaginatedQuery behavior
export function useMockPaginatedOrders(totalItems: number) {
  const [loadedItems, setLoadedItems] = useState<OrderWithItems[]>([])
  const [status, setStatus] = useState<
    "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"
  >("LoadingFirstPage")
  const [currentPage, setCurrentPage] = useState(0)
  const pageSize = 15

  // Generate all mock data once
  const allMockOrders = useMemo(
    () => generateMockOrders(totalItems),
    [totalItems]
  )

  // Load initial data
  useEffect(() => {
    setStatus("LoadingFirstPage")
    const initialData = allMockOrders.slice(0, pageSize)
    setLoadedItems(initialData)
    setCurrentPage(1)
    setStatus(initialData.length < totalItems ? "CanLoadMore" : "Exhausted")
  }, [allMockOrders, totalItems])

  const loadMore = useCallback(
    (numItems: number) => {
      if (status !== "CanLoadMore") return

      setStatus("LoadingMore")

      // Simulate async loading
      setTimeout(() => {
        const startIndex = currentPage * pageSize
        const endIndex = startIndex + numItems
        const newItems = allMockOrders.slice(startIndex, endIndex)

        setLoadedItems((prev) => [...prev, ...newItems])
        setCurrentPage((prev) => prev + 1)

        const hasMore = endIndex < totalItems
        setStatus(hasMore ? "CanLoadMore" : "Exhausted")
      }, 500) // Simulate network delay
    },
    [status, currentPage, allMockOrders, totalItems]
  )

  return {
    results: loadedItems,
    status,
    loadMore,
  }
}
