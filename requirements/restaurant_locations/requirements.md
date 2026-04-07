# Sistema de Ubicaciones de Restaurantes - Requisitos

## Resumen Ejecutivo

El sistema de ubicaciones de restaurantes permite la gestión completa de múltiples sucursales por organización, cada una con sus propias configuraciones operativas, horarios y áreas de cobertura.

## Estado de Implementación

### ✅ **COMPLETAMENTE IMPLEMENTADO**

**Fecha de Implementación**: Diciembre 2024  
**Estado**: Operativo en producción  
**Cobertura**: 100% de funcionalidades críticas

## Funcionalidades Implementadas

### 1. Gestión de Múltiples Sucursales

**Descripción**: Sistema completo para crear, editar y gestionar múltiples ubicaciones de restaurante por organización.

**Implementación Técnica**:
- Tabla `restaurantLocations` en Convex
- Interfaz administrativa en `/restaurant-locations`
- API endpoints: `create`, `update`, `list`, `get`, `remove`

**Campos de Configuración**:
- `name`: Nombre de la sucursal
- `code`: Código único de identificación
- `organizationId`: Vinculación con organización
- `address`: Dirección física completa
- `coordinates`: Coordenadas geográficas (lat/lng)
- `available`: Estado de disponibilidad
- `openingHours`: Horarios de apertura por día

### 2. Sistema de Horarios Flexibles

**Descripción**: Configuración de horarios de apertura personalizables por día de la semana con múltiples rangos horarios.

**Implementación Técnica**:
- Estructura de datos flexible para horarios complejos
- Validación automática con función `isRestaurantOpen()`
- Integración con herramientas de AI para validación

**Características**:
- Horarios diferentes por día de la semana
- Múltiples rangos horarios por día (ej: mañana y noche)
- Validación en tiempo real para pedidos programados
- Soporte para días cerrados

### 3. Coordenadas Geográficas

**Descripción**: Sistema de geolocalización para cada sucursal con coordenadas precisas.

**Implementación Técnica**:
- Almacenamiento de latitud y longitud
- Integración con mapas interactivos
- Validación de coordenadas válidas

**Uso**:
- Cálculo de distancias para entregas
- Visualización en mapas administrativos
- Optimización de rutas de entrega

### 4. Códigos Únicos de Identificación

**Descripción**: Sistema de códigos alfanuméricos únicos para identificar cada sucursal.

**Implementación Técnica**:
- Validación de unicidad por organización
- Conversión automática a mayúsculas
- Uso en sistemas internos y reportes

**Beneficios**:
- Identificación rápida en operaciones
- Integración con sistemas externos
- Trazabilidad de pedidos por sucursal

### 5. Control de Disponibilidad

**Descripción**: Sistema para activar/desactivar sucursales dinámicamente.

**Implementación Técnica**:
- Campo booleano `available`
- Filtrado automático en consultas
- Interfaz de toggle en administración

**Casos de Uso**:
- Mantenimiento temporal
- Cierre por eventos especiales
- Gestión de capacidad operativa

## Integración con Otros Sistemas

### 1. Áreas de Entrega

**Vinculación**: Cada área de entrega está asociada a una ubicación específica de restaurante.

**Beneficios**:
- Cobertura personalizada por sucursal
- Tarifas diferenciadas por ubicación
- Optimización logística

### 2. Pedidos Programados

**Validación**: Los pedidos programados validan automáticamente si la sucursal estará abierta en el horario solicitado.

**Implementación**:
- Verificación de horarios antes de confirmar pedido
- Mensajes de error informativos
- Sugerencia de horarios alternativos

### 3. Herramientas de AI

**Integración**: Las herramientas de AI utilizan información de ubicaciones para:
- Validar disponibilidad en tiempo real
- Calcular tiempos de entrega
- Asignar pedidos a sucursales apropiadas

## Esquema de Base de Datos

```typescript
restaurantLocations: defineTable({
  name: v.string(),
  code: v.string(),
  organizationId: v.string(),
  address: v.string(),
  coordinates: v.object({
    latitude: v.number(),
    longitude: v.number(),
  }),
  available: v.boolean(),
  openingHours: v.optional(
    v.array(
      v.object({
        day: weekDayValidator,
        ranges: v.array(v.object({
          open: v.string(),
          close: v.string(),
        })),
      })
    )
  ),
}).index("by_organization_id", ["organizationId"]),
```

## Interfaz de Usuario

### 1. Vista de Lista

**Características**:
- Tabla con todas las sucursales
- Información clave visible (nombre, código, estado)
- Acciones rápidas (editar, eliminar, toggle disponibilidad)
- Filtrado y búsqueda

### 2. Formulario de Creación/Edición

**Campos**:
- Información básica (nombre, código, dirección)
- Selector de coordenadas con mapa interactivo
- Configurador de horarios por día
- Control de disponibilidad

### 3. Visualización de Horarios

**Características**:
- Interface intuitiva para configurar horarios
- Soporte para múltiples rangos por día
- Validación de formatos de hora
- Preview de horarios configurados

## Validaciones y Reglas de Negocio

### 1. Validaciones de Datos

- **Código único**: No puede repetirse dentro de la organización
- **Coordenadas válidas**: Latitud [-90, 90], Longitud [-180, 180]
- **Horarios válidos**: Formato HH:MM, hora de cierre posterior a apertura
- **Campos obligatorios**: Nombre, código, dirección, coordenadas

### 2. Reglas de Negocio

- **Eliminación**: No se puede eliminar sucursal con pedidos activos
- **Desactivación**: Sucursal desactivada no recibe nuevos pedidos
- **Horarios**: Validación automática para pedidos programados

## Casos de Uso

### 1. Configuración Inicial

1. Administrador crea nueva sucursal
2. Configura información básica y coordenadas
3. Establece horarios de operación
4. Activa sucursal para recibir pedidos

### 2. Gestión Operativa

1. Modificación de horarios por temporadas
2. Desactivación temporal por mantenimiento
3. Actualización de información de contacto
4. Gestión de múltiples ubicaciones

### 3. Integración con Pedidos

1. Cliente realiza pedido
2. Sistema valida sucursal más cercana
3. Verifica horarios de operación
4. Asigna pedido a sucursal apropiada

## Métricas y Monitoreo

### 1. Métricas Operativas

- Pedidos por sucursal
- Tiempo promedio de entrega por ubicación
- Utilización de horarios configurados
- Disponibilidad promedio por sucursal

### 2. Alertas

- Sucursales sin pedidos por período extendido
- Horarios no configurados
- Coordenadas inválidas
- Conflictos de cobertura entre sucursales

## Beneficios Implementados

### 1. Operativos

- **Gestión Centralizada**: Control de todas las sucursales desde una interfaz
- **Flexibilidad Horaria**: Horarios personalizados por ubicación
- **Escalabilidad**: Soporte para crecimiento de la cadena
- **Automatización**: Validaciones automáticas de disponibilidad

### 2. Para el Cliente

- **Precisión**: Información exacta de horarios y disponibilidad
- **Conveniencia**: Pedidos programados con validación automática
- **Confiabilidad**: Sistema robusto de gestión de ubicaciones

### 3. Para el Negocio

- **Optimización**: Mejor distribución de pedidos
- **Control**: Gestión granular por sucursal
- **Insights**: Métricas detalladas por ubicación
- **Crecimiento**: Infraestructura lista para expansión

## Próximas Mejoras

### 1. Funcionalidades Adicionales

- **Capacidad por Sucursal**: Límites de pedidos simultáneos
- **Zonas de Influencia**: Asignación automática por proximidad
- **Integración GPS**: Tracking en tiempo real de repartidores
- **Horarios Estacionales**: Configuración automática por temporadas

### 2. Optimizaciones

- **Cache de Horarios**: Mejora de performance para validaciones
- **Geofencing**: Alertas automáticas por ubicación
- **Analytics Predictivos**: Pronósticos por sucursal
- **Integración ERP**: Sincronización con sistemas externos
