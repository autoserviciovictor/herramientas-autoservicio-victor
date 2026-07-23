# Fuentes de datos — 7.1 Beta Entrega 1

## Catálogo maestro

- **Productos** es la fuente del catálogo general.
- Lo usan: Precios, Lista, Vencimientos, búsquedas manuales y el contador general del Administrador.
- Sus columnas esperadas son: Código, Artículo y Precio.

## Inventario

- **Stock** queda reservado exclusivamente para el módulo Inventario.
- Inventario conserva sus columnas y funcionamiento actual: Código, Artículo, Stock, Salón y Depósito.
- Eliminar o modificar filas durante un inventario no afecta al catálogo maestro de Productos.

## Alcance de esta entrega

Esta entrega cambia solamente el origen de lectura de los módulos. No modifica el diseño, el escáner ni el orden de Lista.

## Importación inteligente (7.1 Beta - Entrega 2)

El XLS se compara por código contra `Productos`. Los existentes actualizan artículo/precio y los nuevos se agregan. `Stock` nunca se escribe durante esta operación.

## Lista y notificaciones (7.1 Beta - Entrega 3)

- La hoja `Listas` conserva un campo `Orden` independiente por usuario y por Lista 1/2.
- Los productos pendientes se muestran primero y los completados al final, siempre respetando su orden original.
- La hoja `Vencimientos` se revisa diariamente a las 08:00 de Argentina.
- Se notifican 15, 7, 3 y 1 día antes, el día del vencimiento y una vez al quedar vencido.
- Los productos en oferta reciben un aviso adicional 3 días antes.
- El endpoint protegido `/notificaciones/cron` queda disponible para un Cron Job externo programado a las 08:00 (America/Argentina/Buenos_Aires), necesario si el servidor se suspende.


## Entrega 4 — Rendimiento y sincronización
- Catálogo maestro con caché local de 5 minutos, revalidación ETag y deduplicación de solicitudes.
- Precios, Lista e Inventario comparten la misma estrategia de caché para `Productos`.
- Lista se actualiza al recuperar conexión o volver a la app, con límite para evitar consultas repetidas.
- Service worker usa caché inmediata y actualización en segundo plano para archivos estáticos.
- Si no hay conexión, las búsquedas pueden usar el último catálogo guardado.
