# Cambios en Schema de Prisma - Tienda Virtual

## Resumen
Se agregaron campos y modelos para soportar **tienda virtual** por empresa en el sistema Nephi.

---

## 1. Cambios en modelo `Plan`

```prisma
tieneTienda Boolean @default(false) // Indica si el plan incluye tienda virtual
```

**Propósito:** Controlar qué planes permiten a las empresas tener tienda online.

---

## 2. Cambios en modelo `Empresa`

### Nuevos campos para configuración de tienda:

```prisma
// URL y branding
slugTienda        String?  @unique     // URL amigable (ej: "mi-negocio")
descripcionTienda String?              // Descripción corta del negocio
colorPrimario     String?  @default("#000000")
colorSecundario   String?  @default("#ffffff")

// Redes sociales y contacto
whatsappTienda    String?              // WhatsApp de contacto
facebookUrl       String?
instagramUrl      String?
tiktokUrl         String?
horarioAtencion   String?              // Horario (texto libre o JSON)

// Medios de pago
yapeQrUrl         String?              // URL de imagen QR Yape
yapeNumero        String?              // Número de Yape
plinQrUrl         String?              // URL de imagen QR Plin
plinNumero        String?              // Número de Plin
aceptaEfectivo    Boolean  @default(true)

// Nueva relación
pedidosTienda     PedidoTienda[]
```

**Índices agregados:**
```prisma
@@index([slugTienda])
```

---

## 3. Cambios en modelo `Producto`

### Nuevos campos para catálogo público:

```prisma
publicarEnTienda  Boolean  @default(false)  // Si se muestra en tienda
imagenUrl         String?                   // Imagen principal
imagenesExtra     String?                   // JSON con URLs adicionales
descripcionLarga  String?                   // Descripción detallada
destacado         Boolean  @default(false)  // Productos destacados

// Nueva relación
itemsPedido       ItemPedidoTienda[]
```

**Índices agregados:**
```prisma
@@index([empresaId, publicarEnTienda])
```

---

## 4. Nuevos modelos

### `PedidoTienda`

Representa un pedido realizado desde la tienda virtual.

```prisma
model PedidoTienda {
  id                Int                @id @default(autoincrement())
  empresaId         Int
  
  // Datos del cliente (no requiere cuenta)
  clienteNombre     String
  clienteTelefono   String
  clienteEmail      String?
  clienteDireccion  String?
  clienteReferencia String?
  
  // Datos del pedido
  subtotal          Decimal
  igv               Decimal            @default(0)
  total             Decimal
  estado            EstadoPedidoTienda @default(PENDIENTE)
  medioPago         MedioPagoTienda    @default(YAPE)
  observaciones     String?
  referenciaTransf  String?            // Número o código de operación
  
  // Metadata
  creadoEn          DateTime           @default(now())
  actualizadoEn     DateTime           @updatedAt
  fechaConfirmacion DateTime?
  usuarioConfirma   Int?
  comprobanteId     Int?               // Si se generó comprobante
  
  empresa           Empresa            @relation(fields: [empresaId], references: [id])
  items             ItemPedidoTienda[]
  
  @@index([empresaId, estado])
  @@index([creadoEn])
}
```

### `ItemPedidoTienda`

Items individuales de cada pedido.

```prisma
model ItemPedidoTienda {
  id           Int          @id @default(autoincrement())
  pedidoId     Int
  productoId   Int
  cantidad     Int
  precioUnit   Decimal      // Precio al momento del pedido
  subtotal     Decimal
  observacion  String?      // Ej: "sin cebolla"
  
  pedido       PedidoTienda @relation(fields: [pedidoId], references: [id], onDelete: Cascade)
  producto     Producto     @relation(fields: [productoId], references: [id])
  
  @@index([pedidoId])
  @@index([productoId])
}
```

---

## 5. Nuevos Enums

### `EstadoPedidoTienda`

```prisma
enum EstadoPedidoTienda {
  PENDIENTE       // Pedido recibido, esperando confirmación de pago
  CONFIRMADO      // Pago verificado
  EN_PREPARACION  // En proceso
  LISTO           // Listo para entrega/recojo
  ENTREGADO       // Completado
  CANCELADO       // Cancelado
}
```

### `MedioPagoTienda`

```prisma
enum MedioPagoTienda {
  YAPE
  PLIN
  EFECTIVO
  TRANSFERENCIA
  TARJETA
}
```

---

## 6. Migración

Para aplicar estos cambios:

```bash
# Generar migración
npx prisma migrate dev --name add_tienda_virtual

# O si ya tienes datos en producción
npx prisma migrate deploy
```

---

## 7. Endpoints a implementar

### Públicos (sin auth)
- `GET /public/store/:slug` - Info de la tienda
- `GET /public/store/:slug/products` - Catálogo
- `GET /public/store/:slug/products/:id` - Detalle producto
- `GET /public/store/:slug/payment-config` - Medios de pago
- `POST /public/store/:slug/orders` - Crear pedido

### Protegidos (panel empresa)
- `PATCH /empresa/tienda/config` - Configurar tienda
- `GET /tienda/pedidos` - Listar pedidos
- `PATCH /tienda/pedidos/:id/estado` - Actualizar estado
- `POST /tienda/pedidos/:id/comprobante` - Generar comprobante desde pedido
- `PATCH /productos/:id/tienda` - Publicar/despublicar producto

---

## 8. Próximos pasos

1. Crear módulo `TiendaModule` en NestJS
2. Implementar servicios y controladores
3. Agregar validaciones (slug único, plan con tienda, etc.)
4. Implementar upload de imágenes (productos y QRs)
5. Frontend: panel de configuración + tienda pública
