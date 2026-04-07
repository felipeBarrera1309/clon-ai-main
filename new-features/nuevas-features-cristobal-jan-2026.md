# Nuevas Features Cristobal - Enero 2026

## 1) Funcionalidades a desarrollar ahora (producto actual)

### 1.1. Envío de imágenes de productos

- Que el bot pueda mostrar fotos de los productos cuando el cliente lo pida.
- No se envían solas: solo si el usuario dice "mándame foto" o pregunta por cómo se ve algo.
- **Cómo hacerlo:**
  - Añadir una columna de enlace de imagen dentro de la tabla del menú/catálogo.
  - Cuando el cliente apruebe la tabla generada, podrá pegar los links de las fotos de cada producto en esa columna.
  - El bot solo enviará la imagen cuando el usuario final la solicite.
  - Si un producto no tiene enlace, el bot responderá sin enviar imagen, de forma normal.
  - Es la opción más sencilla porque solo usa enlaces que WhatsApp ya previsualiza como imagen automáticamente.

### 1.2. Integración completa con WhatsApp

- Que el bot pueda:
  - Leer y enviar ubicaciones
  - Mostrar tick azul
  - Mostrar el "escribiendo…"
- Kevin ya tiene una versión hecha de esto - ¿revisar por si te sirve?

### 1.3. Mensajería masiva

- Que desde la plataforma se puedan enviar mensajes a muchas personas a la vez.
- Por ejemplo: avisos, promociones, recordatorios, campañas, lo que el negocio necesite.

### 1.4. Burbuja de chat dentro del panel (tipo CRM + soporte + consultas)

- Que dentro de la plataforma haya una burbuja flotante de chat donde el dueño del negocio pueda preguntar cosas.
- Ese chat le deja elegir filtros como:
  - Qué quiere revisar (ej: pedidos, productos, clientes, campañas, ajustes…).
  - Periodo de tiempo (ej: hoy, ayer, última semana, rango específico).
  - Sucursal si aplica.
- Sirve tanto para ver datos del negocio como para resolver dudas técnicas o de uso.

### 1.5. Impresión de comandas

**Opción 1: Impresión automática (prioritaria)**

Según comentó Luis, una idea es usar un bot que actúe dentro del navegador y que, mediante una extensión, detecte cuándo entra un pedido y lo mande a imprimir automáticamente.

Este bot podría "imitar" las acciones de una persona en la web (abrir la comanda y enviarla a imprimir) sin que nadie tenga que hacerlo a mano.

Es la opción preferida porque acelera todo el proceso. También se pueden valorar alternativas similares si el equipo encuentra una forma igual de automática y fiable.

**Opción 2: Impresión manual (respaldo, plan B)**

Si la impresión automática no llegara a funcionar, el sistema debe mostrar un pop-up en la pantalla, sin importar en qué pestaña o sección esté la persona, con un botón claro que diga "Imprimir comanda".

La persona solo tendría que darle clic y listo, para asegurar que el pedido nunca se pierda.

Si hay varios pedidos, que todos se puedan agrupar en un botón de "imprimir todos" y también puedan ir uno a uno. Como la parte de "importar" de Criteria.

### 1.6. Pasarela de pago

- Integrar un sistema que permita crear y enviar enlaces de pago por WhatsApp.
- Cuando el cliente pague, la plataforma debe recibir la confirmación automáticamente y cambiar el estado del pedido a "pagado".
- Tras confirmar el pago, el bot envía un mensaje automático al usuario avisando de que el pago se ha recibido y que el pedido sigue su curso.
- Los que más funcionan en Colombia: **Wompi** y **Epayco**, ya que ahí la gente no suele pagar con tarjeta, sino mediante Nequi, Daviplata… debe tener PSE

### 1.7. Onboarding guiado (versión interna v1 — lo que más me importa de cara al futuro)

**Es la funcionalidad estrella en esta fase.**

#### Qué es

Un proceso de 5 pasos muy guiado para que el cliente no técnico pueda hacer la implementación de forma automática (en un futuro). Se me ocurre crear una interfaz previa al dashboard cuanto una org nueva se crea, con unos pasos muy sencillos y fáciles de entender para que la implementación quede hecha de forma (casi automática ahora - automática en un futuro para ser un SaaS).

#### Paso 1 — Subir el menú o catálogo

- El cliente sube un PDF o una foto del menú.
- La plataforma lo lee y lo convierte en una tabla tipo Excel.
- Después le muestra el resultado y le dice: "Revisa si falta algo o hay que corregir, y confirma si está todo bien."
- Cuando el cliente lo aprueba, pasa al siguiente paso.

#### Paso 2 — Definir sucursales

- Seleccionar cuántas sedes o puntos tiene el negocio y nombrarlas (ej: Centro, Caracolí, Cañaveral, etc.).
- Esto puede ser como ahora, igual un poco más fácil de entender para el usuario y ya está.

#### Paso 3 — Configurar precios y tiempos de entrega por zonas

- El cliente selecciona su ciudad.
- Le salen las zonas ya dibujadas en el mapa (geocercas predefinidas - ya las tenemos).
- Va una por una poniendo:
  - Precio de entrega
  - Tiempo estimado
  - Condiciones si hay
- Puede agrupar varias zonas si tienen el mismo precio y tiempo, para ir más rápido.

#### Paso 4 — Calibrar el comportamiento del bot

- La plataforma le hace preguntas cortas de configuración (ej: tono de atención, horarios, extras, promos, forma de responder, etc.).
- Con esas respuestas se crea automáticamente el mensaje de instrucciones que usa el bot para hablar como el negocio quiere.

#### Paso 5 — Reglas especiales del negocio

- También puede escribirlas o enviar audios para que se transcriban y sea más rápido.
- Ejemplos de reglas:
  - "Cambia yuca por papa solo en X casos"
  - "No aceptamos pedidos después de X hora"
  - "Si es cliente VIP, ofrece X descuento"
  - Lo que sea propio del negocio.

#### Importante

- Esta versión es interna, no SaaS todavía: primero lo probamos vosotros para dejarlo fino, es para acelerar el trabajo de los implementadores y terminar automatizando.
- Más adelante, se usará la misma idea para hacer el producto autoservicio SaaS.

### 1.8. Catálogo digital + Marketplace (versión v1, no técnica)

- Que con los productos e imágenes ya subidos, se pueda generar automáticamente un catálogo o mini-web para el restaurante o comercio.
- Y además, que muchos catálogos puedan juntarse en un directorio/marketplace donde la gente explore restaurantes o negocios y pueda pedirles directo.
- Es como un "centro comercial digital" de negocios, pero llevando los pedidos a WhatsApp o al checkout propio del restaurante, sin depender de apps externas.
- De momento, empezaría con la versión para el restaurante, que teniendo los productos, en un par de clicks se pueda generar ese catálogo. El motivo es que ahora en el primer mensaje, los restaurantes envían un link a un menú que tienen con un tercero, el cual permite hacer pedidos, y hay pedidos que se nos caen por eso mismo, porque lo hacen por ahí y ya no regresan a whatsapp.

---

## 2. Módulo de llamadas (siguiente fase)

### Resumen funcional

- Después de terminar todas las funcionalidades principales, se añadirá la opción de tener un agente que pueda atender llamadas.
- El objetivo es que el sistema pueda recibir llamadas de clientes, responder como lo hace ahora por WhatsApp, pero por voz, y registrar lo que pasó en la llamada.
- Esta función no va primero, va después de dejar listo el producto actual.

---

## 3. Otros sectores (futuro)

### Resumen funcional

- En una fase posterior se creará una versión del producto que pueda servir no solo para restaurantes, sino también para tiendas, comercios, servicios y otros tipos de negocio.
- Se aprovechará la base de lo que ya existe, pero adaptándolo a nuevos usos fuera del delivery o pedidos de comida.
- Este punto es solo un recordatorio de lo que se hará más adelante, no entra en el desarrollo actual.
