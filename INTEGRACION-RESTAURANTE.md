# Integración: falconext-resellers → falconext-restaurante

resellers gobierna **falconext-restaurante** como producto (mismo patrón que hotel).
El contrato completo (endpoint, payload, flujo) está documentado en el repo
restaurante: `falconext-restaurante/backend/INTEGRACION-RESELLERS.md`.

## Lado resellers — qué configurar

| Variable | Requerida | Notas |
|---|---|---|
| `RESTAURANTE_BACKEND_SYNC_URL` | **Sí** | Prod: `https://<host-restaurante>/api/tenant/sync-from-resellers` |
| `RESTAURANTE_BACKEND_SYNC_TOKEN` | **Sí** | Debe ser **idéntico** a `RESELLERS_SYNC_TOKEN` en restaurante. |
| `QPSE_ACCESS_TOKEN` | **Sí** | Token maestro QPSE (aprovisionamiento). Ya usado por los demás productos. |

## Dónde vive el código (empresa.service.ts / empresa.controller.ts)

- `normalizeProducto()` reconoce `'restaurante'`.
- Campos de vínculo en `Empresa`: `restauranteTenantId`, `restauranteAdminUserId`, `restauranteSyncAt`.
- `buildRestauranteSyncPayload()` + `callRestauranteSync()` + `sincronizarEmpresaRestaurante()`.
- Disparadores: `crear()`, `actualizar()`, `cambiarEstado()` cuando `producto = 'restaurante'`.
- Endpoint manual de re-sync: `POST /api/empresa/:id/sync-restaurante`.

## Aprovisionamiento QPSE

Se hace **solo desde resellers** (endpoints `aprovisionar-qpse` / `pasar-produccion`
existentes). Las credenciales por empresa (`usuarioPse`/`contrasenaPse`/`qpseExternalId`)
se propagan a restaurante dentro del payload de sync. restaurante no aprovisiona:
solo consume y emite.
