import { openai } from "@ai-sdk/openai"
import { RAG } from "@convex-dev/rag"
import { components } from "../_generated/api"

// Tipos para filtros del menú
export type MenuFilters = {
  categoria: string
  disponibilidad: string
  ubicacion: string
  precioRango: string
}

// Inicializar RAG con configuración para menú
export const rag = new RAG<MenuFilters>(components.rag, {
  textEmbeddingModel: openai.embedding("text-embedding-3-small"),
  embeddingDimension: 1536,
  filterNames: ["categoria", "disponibilidad", "ubicacion", "precioRango"],
})

// Función helper para generar namespace por organización
export const getMenuNamespace = (organizationId: string) =>
  `menu-${organizationId}`

// Función helper para generar namespace por conversación (historial)
export const getConversationNamespace = (contactId: string) =>
  `conversation-${contactId}`

// Función helper para generar namespace de base de conocimientos
export const getKnowledgeNamespace = (organizationId: string) =>
  `knowledge-${organizationId}`
