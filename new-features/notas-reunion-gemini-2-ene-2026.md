# Notas de Reunión - Producto ClonAI

**Fecha:** 2 de enero de 2026

**Invitados:**
- Joan Buch Prades (joan@clonai.co)
- Luis Miguel Gamboa (luis@clonai.co)

**Archivos adjuntos:** [Producto clonai](https://www.google.com/calendar/event?eid=bzZkdHZqZ2VhYWh1aGlxcWN2bjdpYWltM28gam9hbkBjbG9uYWkuY28)

**Registros de la reunión:**
- [Transcripción](?tab=t.dzz0v133h05u)
- [Grabación](https://drive.google.com/file/d/1ccafpnKUd_QZsuOMUbbFBbYtcuu9jX-n/view?usp=drive_web)

---

## Resumen

Luis Miguel Gamboa y Joan Buch Prades discutieron una serie de prioridades de desarrollo, comenzando con la implementación de la función de envío de imágenes de productos para expandir el alcance de la herramienta a comercios en general y atender múltiples solicitudes de clientes. También se identificó como alta prioridad la integración de pasarelas de pago (como WPI o IPCO) para automatizar los procesos de cobro y respaldar la expansión a comercios nacionales, además de la finalización de la integración de WhatsApp y la mensajería masiva. Otros puntos clave incluyen la mejora del panel de contactos a un CRM con un agente de chat, la creación de un catálogo digital propio, la simplificación del *onboarding* del cliente (modelo SAS) y la automatización de las geocercas.

---

## Detalles

*Longitud de las notas: Estándar*

### Prioridad para Enviar Imágenes de Productos

Luis Miguel Gamboa sugirió la implementación de la función de enviar imágenes de productos como una prioridad, argumentando que esto extendería la herramienta más allá del nicho de restaurantes a comercios en general. Él señaló que varios clientes han solicitado esta capacidad y que ya se tienen las tablas de productos, lo que solo requeriría añadir una columna para la URL de la imagen y activar la herramienta (tool) para enviarlas solo cuando el cliente lo pida, no en todo momento. Joan Buch Prades estuvo de acuerdo en que la necesidad era lógica, especialmente dado que varios clientes la habían mencionado (00:01:09).

### Viabilidad Técnica y Comercial de Imágenes

Luis Miguel Gamboa explicó que enviar imágenes de productos es un cambio relativamente rápido y que no cuesta nada a nivel interno, ya que el sistema solo procesa una URL que WhatsApp transforma en una imagen descargable (00:03:40). Joan Buch Prades expresó su preocupación inicial por el tiempo de implementación, pero Luis Miguel Gamboa indicó que la carga de las imágenes podría negociarse con los clientes, mencionando un cliente potencial que estaría dispuesto a cerrar si se ofrece esta funcionalidad (00:02:49). Además, esta característica serviría para preparar el producto para comercios en general.

### Expansión a Comercios Generales

Luis Miguel Gamboa mencionó que la expansión a comercios en general estaba prevista para el primer trimestre (00:03:40). Joan Buch Prades confirmó tener varios clientes potenciales fuera del sector de restaurantes y comentó que Cristóbal había indicado que la transición sería relativamente sencilla, ya que se trabajaría sobre un flujo y una aplicación existentes. Luis Miguel Gamboa aclaró que, aunque el producto actual sirve para entregas locales (delivery local), el de comercio debería abarcar envíos locales y nacionales, lo cual es un caso de uso distinto (00:04:41).

### Necesidad de Integración de Pasarelas de Pago

La expansión a comercios nacionales requiere la integración de pasarelas de pago, ya que estos comercios necesitan cobrar antes de enviar productos. Luis Miguel Gamboa identificó este como el segundo punto de prioridad, sugiriendo integrar pasarelas de pago como WPI o IPCO de la vivienda. Esta integración sería valiosa tanto para grandes restaurantes como para comercios en general (00:05:40).

### Funcionalidad de Pasarela de Pago y Automatización

Luis Miguel Gamboa detalló que la integración de la pasarela de pago para WhatsApp debería permitir crear un enlace de pago dinámico, enviarlo al cliente y utilizar un *webhook* o un estado de alerta para confirmar automáticamente el pago y notificar al cliente (00:06:50). Joan Buch Prades estuvo de acuerdo con la necesidad de automatizar este proceso para evitar la escalada de cada pago a un operador humano. Luis Miguel Gamboa añadió que muchos clientes grandes también buscan la integración directa con sus sistemas POS (Punto de Venta) para la creación automática de órdenes y facturas electrónicas, aunque reconoció que esta integración es compleja debido a la diversidad de sistemas POS (00:08:07).

### Factibilidad Técnica de las Pasarelas de Pago

Luis Miguel Gamboa consideró que las APIs de pasarelas de pago como WPI y Mercado Pago son relativamente sencillas de integrar, y que un desarrollador *junior* podría lograrlo en dos o tres días. Él estimó que una persona como Cristóbal podría realizar la integración en media jornada. Joan Buch Prades aceptó la integración de pasarelas de pago como una buena funcionalidad que se podría aprovechar después (00:09:47).

### Implementación de Mensajería Masiva

Luis Miguel Gamboa señaló la mensajería masiva como una funcionalidad con alto valor diferencial, que ningún otro chatbot en el mercado ofrecía hasta el momento. Joan Buch Prades secundó la idea, mencionando que Rafael también había tocado el tema. Luis Miguel Gamboa comentó que el módulo inicial fue desarrollado por Nicolás, un *junior*, en aproximadamente una semana, por lo que no debería ser muy costoso de implementar (00:10:34).

### Impresión de Comandas y Uso de Hardware

Joan Buch Prades trajo a colación el tema de la impresión de comandas, que Cristóbal había sugerido que podría limitarse a mostrar pop-ups para que una persona en el *call center* diera la orden de imprimir. Luis Miguel Gamboa había contemplado una solución más automatizada mediante un bot con RPA (Automatización Robótica de Procesos) que controlara el navegador para imprimir desde allí, posiblemente a través de una extensión con filtros por sucursal (00:11:32). Aunque Joan Buch Prades recordó que Cristóbal había sido reacio debido a la implicación de hardware, Luis Miguel Gamboa consideró que la impresión no debería ser un obstáculo si ya lograron otras tareas complejas (00:12:33).

### Finalización de la Integración de WhatsApp

Luis Miguel Gamboa insistió en finalizar la integración de WhatsApp, la cual había sido pausada a pesar de que Kevin había avanzado en funciones como el envío y lectura de ubicaciones (00:13:38). Él enfatizó la importancia de tener una integración completa que permita enviar ubicaciones y manejar el estado de "escribiendo" y los tics azules (00:14:35). Joan Buch Prades estuvo de acuerdo en la importancia de desglosar estas funcionalidades para que el equipo entienda la tarea.

### Mejora del Panel de Contactos a un CRM y Agente de Chat

Luis Miguel Gamboa propuso mejorar el panel de contactos para convertirlo en algo más parecido a un CRM, señalando que se estaba desperdiciando información, como la conversión de clientes (00:15:43). Joan Buch Prades sugirió una burbuja de chat intermedia que funcionara como un agente de soporte técnico y de consulta de datos del negocio. Luis Miguel Gamboa confirmó que esta idea aportaría valor, ya que los datos ya están en la base de datos y permitiría a los dueños del negocio consultar información de ventas, contactos y productos mediante consultas de SQL (00:16:39).

### Desarrollo de un Catálogo Digital Propio

Luis Miguel Gamboa propuso crear una funcionalidad de catálogo digital que aproveche los productos e imágenes ya cargados en la plataforma, lo que permitiría a los clientes tener una web de captura de pedidos que compita con otras aplicaciones. Él explicó que este catálogo digital no requeriría procesamiento de inteligencia artificial y podría generarse automáticamente con solo cargar las fotos (00:19:00, 00:21:08). Joan Buch Prades estuvo de acuerdo en el potencial del catálogo, ya que competiría con plataformas como Rapi y Riclub, ofreciendo un marketplace de catálogos digitales que redirija directamente a los restaurantes (00:22:04).

### Simplificación del Onboarding del Cliente (SAS)

Joan Buch Prades planteó como una funcionalidad muy importante la simplificación del proceso de *onboarding* para que los clientes puedan hacerlo ellos mismos, idealmente a través de un modelo SAS (Software como Servicio). Una posible solución para cargar el menú de forma automática sería mediante un OCR de un PDF o una foto para generar una hoja de cálculo (00:24:44). Luis Miguel Gamboa confirmó la viabilidad, aunque advirtió sobre la posible calidad de las descripciones y la necesidad de un campo para reglas específicas del producto (00:25:51).

### Onboarding Interactivo y Automatización de Prompting

Joan Buch Prades sugirió un proceso de *onboarding* interactivo, donde se le hicieran preguntas al cliente (similar a una encuesta) después de la carga inicial del menú, para personalizar la configuración del agente y los mensajes predeterminados. Luis Miguel Gamboa apoyó la idea de que el *prompting* se automatice con base en estas reglas y sugirió incluso la opción de que el cliente envíe audios para grabar las reglas de su negocio, lo cual liberaría horas de los desarrolladores (00:26:54).

### Automatización de Geocercas para Zonas de Entrega

Respecto a las geocercas, Joan Buch Prades preguntó cómo automatizar la configuración de las zonas de entrega. Luis Miguel Gamboa sugirió que el cliente podría subir un Excel con los barrios y precios de entrega, y que estos barrios se utilicen para definir las zonas (00:29:05). Él también mencionó la posibilidad de que la plataforma provea las zonas ya predeterminadas en el mapa, y que el cliente solo asigne los precios, permitiendo agrupar varias zonas bajo un mismo precio de envío (00:31:37). Luis Miguel Gamboa también señaló que la búsqueda semántica por nombre de barrio podría ser una alternativa más sencilla a las geocercas para la precisión de la dirección (00:33:37).

### Priorización de Funcionalidades y Próximos Pasos

Joan Buch Prades resumió que las prioridades son las funcionalidades y que la función de llamadas se dejaría al final (00:38:17). Luis Miguel Gamboa ratificó el orden de prioridad definido en la conversación:

1. Compartir imágenes
2. Integración completa de WhatsApp
3. Mensajes masivos
4. Agente de chat para el CRM
5. Impresión de comandas
6. Pasarela de pago

(00:41:45, 00:46:21)

Acordaron que Joan Buch Prades ordenaría las notas y se las enviaría a Cristóbal para que indicara los plazos de entrega (00:39:23, 00:48:04).

### Asuntos Administrativos y Uso de Herramientas

Luis Miguel Gamboa y Joan Buch Prades confirmaron los detalles de un pago pendiente (00:49:01). Además, Luis Miguel Gamboa le recordó a Joan Buch Prades las herramientas disponibles en el correo de Clonay, como la firma digital, la cual creía que Mayerly no estaba utilizando, lo que resultaba en procesos manuales más lentos (00:39:23). Joan Buch Prades acordó que se debe insistir en el uso de estas herramientas, dada la mayor validez legal y trazabilidad que ofrece la firma digital (00:40:53).

---

## Pasos siguientes recomendados

- Joan Buch Prades enviará a Luis Miguel Gamboa el orden de prioridad de las funcionalidades antes de enviárselo a Cristóbal.
- Luis Miguel Gamboa le pasará a Joan Buch Prades las hojas de vida de los candidatos a asesor comercial para que las revise.

---

*Notas generadas por Gemini*
