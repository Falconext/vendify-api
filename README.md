_Tienda online + facturación electrónica para emprendedores peruanos_

## 1. Visión del producto

El **Kit para Despegar** es una solución pensada para emprendedores peruanos que quieren:

- Vender más usando internet (WhatsApp, redes sociales, tienda online).
- Verse más profesionales frente a sus clientes.
- Cumplir con la **facturación electrónica** sin complicarse con temas técnicos.

> No es solo facturación. Es un pequeño sistema para ayudar a despegar el negocio.

---

## 2. Público objetivo

- Emprendedores y pequeños negocios en Perú:
  - Bodegas y minimarkets.
  - Restaurantes, dark kitchens, cafeterías.
  - Tiendas de ropa, calzado, accesorios.
  - Negocios de servicios (peluquería, barbería, talleres, etc.).
- Personas con poco tiempo y poca experiencia técnica:
  - Usan WhatsApp / Facebook, pero no saben crear su propia web.
  - Quieren algo simple, rápido y económico.

---

## 3. Propuesta de valor

**Mensaje principal:**

> “Crea tu tienda online y emite tus comprobantes electrónicos en un solo lugar, fácil y pensado para emprendedores peruanos.”

Beneficios clave:

- Tienda online lista en minutos.
- Tus clientes pueden ver tu catálogo y hacer pedidos.
- Tú controlas tus ventas y puedes emitir **boletas/facturas electrónicas** desde el mismo sistema.
- No necesitas saber de tecnología.

---

## 4. Alcance funcional – Versión 1 (MVP)

### 4.1. Datos del negocio

Cada emprendedor puede configurar:

- Nombre comercial.
- Logo.
- Descripción corta del negocio.
- Dirección (distrito, ciudad).
- WhatsApp de contacto.
- Redes sociales (Facebook, Instagram, TikTok).
- Horario de atención.

### 4.2. Tienda online estándar

- Plantilla única (diseño igual para todos, cambia solo:
  - Logo.
  - Colores básicos.
  - Textos.
- Diseño responsive (prioridad en vista móvil).
- Página pública tipo:

  - `https://midominio.com/tienda/mi-negocio`
  - o similar.

### 4.3. Gestión de productos

Módulo básico para administrar productos/servicios:

- Crear / editar / eliminar producto.
- Campos mínimos:
  - Nombre.
  - Descripción corta.
  - Precio.
  - Categoría (ej: Bebidas, Combos, Ropa, Servicios).
  - Una imagen por producto.
  - Estado: Activo / Inactivo (para controlar visibilidad).
- Solo los productos activos se muestran en la tienda pública.

### 4.4. Catálogo público

- Listado de productos ordenados por categoría o por prioridad.
- Filtros simples (por categoría).
- Visualización clara de:
  - Nombre.
  - Imagen.
  - Precio.
  - Descripción corta.

### 4.5. Carrito y pedidos

Flujo básico para el cliente final:

1. El cliente entra a la URL de la tienda.
2. Agrega productos al carrito (cantidad por producto).
3. Completa un formulario de pedido con:
   - Nombre.
   - Número de WhatsApp.
   - Dirección (opcional según tipo de negocio).
   - Comentario adicional (ej: “sin hielo”, “talla M”, “entrega después de las 6pm”).
4. Envía el pedido.

Requisitos:

- Registrar el pedido en el sistema interno.
- Mostrar confirmación en pantalla.
- Opcional: ofrecer botón para continuar el pedido por WhatsApp.

### 4.6. Integración con WhatsApp (nivel funcional)

- Generar un mensaje de WhatsApp con:
  - Lista de productos y cantidades.
  - Total estimado.
  - Nombre y datos del cliente.
- El cliente o el emprendedor pueden usar este mensaje para coordinar pago y entrega.
- No es necesario integrar técnicamente la API oficial en la V1: basta con armar la URL con texto.

### 4.7. Panel del emprendedor

Módulo interno para el emprendedor (dashboard):

- **Lista de pedidos** con:
  - Fecha y hora.
  - Nombre del cliente.
  - Monto total.
  - Estado del pedido:
    - PENDIENTE.
    - PAGADO.
    - FACTURADO.
- Opciones básicas:
  - Cambiar estado del pedido.
  - Ver detalle (productos, cantidades, comentario).

### 4.8. Conexión mínima con facturación electrónica

Integración conceptual con el sistema de facturación:

- Cada pedido puede convertirse en:
  - Boleta electrónica.
  - Factura electrónica.
- Flujo esperado:
  1. Cliente hace el pedido.
  2. Emprendedor confirma y cobra.
  3. Desde el pedido, hace clic en “Generar boleta/factura”.
  4. El sistema crea el comprobante usando el módulo de facturación existente.

(La implementación técnica y los endpoints se definen aparte.)

---

## 5. Reglas de negocio

- Una tienda por emprendedor en la versión 1.
- Sin manejo de variantes avanzadas:
  - No hay tallas/colores en la V1 (se pueden agregar después).
- Sin pagos online integrados (Yape, Plin, tarjetas) en la V1.
  - Los pagos se coordinan por WhatsApp o directamente en el local.
- Límite razonable de productos en la tienda según el plan.
- Límite de comprobantes electrónicos mensuales por plan.

---

## 6. Experiencia de usuario (UX) – Flujos clave

### 6.1. Flujo del emprendedor (configuración inicial)

1. Se registra / inicia sesión.
2. Completa los datos de su negocio.
3. Crea sus primeros productos.
4. Activa la tienda (marca la tienda como visible).
5. Copia el link de su tienda y lo comparte por:
   - WhatsApp.
   - Redes sociales.
   - QR en su local.

### 6.2. Flujo del cliente final

1. Hace clic en el enlace de la tienda.
2. Ve el catálogo y agrega productos al carrito.
3. Envía el pedido.
4. Recibe confirmación y, si aplica, contacto por WhatsApp.

---

## 7. Soporte y materiales de ayuda

- Canales:
  - WhatsApp de soporte.
  - Correo.
- Horario de atención definido.
- Materiales a crear:
  - Guía “Primeros pasos en tu tienda online”.
  - Video corto: “Crea tu tienda en menos de 10 minutos”.
  - Preguntas frecuentes:
    - ¿Cómo subo un producto?
    - ¿Cómo edito precios?
    - ¿Cómo comparto mi tienda?
    - ¿Cómo genero un comprobante de un pedido?

---

## 8. Roadmap simple

### 8.1. Versión 1 (MVP – Kit para Despegar)

- Todo lo descrito en este documento:
  - Datos del negocio.
  - Tienda estándar.
  - Gestión de productos.
  - Carrito y pedidos.
  - Integración funcional con WhatsApp.
  - Panel básico de pedidos.
  - Botón para generar comprobante.

### 8.2. Futuras versiones (no incluidas en la V1)

- Pagos online integrados (Yape, Plin, tarjetas).
- Variantes de producto (tallas, colores).
- Múltiples fotos por producto.
- Reportes avanzados de ventas.
- Más plantillas de diseño (personalización visual).
- Programa de clientes frecuentes.

---

## 9. Planes y precios sugeridos (Perú)

Pensado para ser accesible y ganar mercado por volumen.

### Plan Básico – S/ 39 / mes

- Facturación electrónica esencial.
- 1 tienda online estándar.
- Hasta **100 productos** en la tienda.
- Límite de comprobantes mensuales adecuado para negocios pequeños.
- Soporte por WhatsApp / correo.

### Plan Emprendedor – S/ 69 / mes

- Todo lo del Plan Básico.
- Más comprobantes mensuales.
- Hasta **500 productos**.
- Reporte simple de ventas mensuales (total por día / mes).
- Soporte con prioridad media.

### Plan Pro – S/ 99 / mes

- Todo lo del Plan Emprendedor.
- Más comprobantes mensuales (para negocios con más movimiento).
- Varios usuarios (ej. 2–3 usuarios por negocio).
- Acceso anticipado a nuevas funciones:
  - Pagos online (cuando se lance).
  - Reportes adicionales.

> Los precios son sugeridos y deben ajustarse según el mercado, costos y posición de la marca.

---

## 10. Mensajes comerciales clave

Frases que se pueden usar en la web / marketing:

- “Tu tienda online y facturación electrónica en un solo lugar.”
- “Pensado para emprendedores peruanos, no para expertos en tecnología.”
- “Comparte tu tienda por WhatsApp y empieza a recibir pedidos hoy mismo.”
- “Formaliza tu negocio sin complicarte con la SUNAT.”

---