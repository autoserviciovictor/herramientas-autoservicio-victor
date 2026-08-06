# AUDIT v12.4.3

## Alcance

Primera migración controlada al layout reutilizable de escritorio.

## Pantalla migrada

- Inventario → Cargar.

## Cambios

- `pantallaInventario` utiliza `desktop-page-shell` y `desktop-page-shell__content`.
- El encabezado y todos los marcos de Cargar comparten el mismo ancho máximo y eje central en PC.
- Se neutralizaron únicamente en esta vista los anchos y márgenes heredados de las tarjetas internas.
- La vista móvil no fue modificada.
- Productos, Cargados y el resto de módulos no fueron migrados en esta entrega.

## Validación

- Versión y caché actualizados a 12.4.3.
- Archivos JavaScript comprobados con `node --check`.
- JSON validado.
