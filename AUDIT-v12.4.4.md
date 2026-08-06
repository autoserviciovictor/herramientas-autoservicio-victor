# Auditoría v12.4.4

## Alcance
- Migración controlada de Inventario > Productos y Cargados al layout común de escritorio.
- Inventario > Cargar conserva la migración validada de v12.4.3.
- La vista móvil no recibe reglas nuevas.
- Incorporación de un workflow editable para desplegar GitHub Pages con mayor tiempo de espera.

## Cambios técnicos
- `#pantallaProductos` utiliza el shell reutilizable tanto en Productos como en Cargados.
- Encabezado, buscador, resumen y listado comparten ancho y eje central.
- Corrección del prefijo de limpieza de cachés del Service Worker.
- Versión y referencias de caché actualizadas a 12.4.4 / 1244.
