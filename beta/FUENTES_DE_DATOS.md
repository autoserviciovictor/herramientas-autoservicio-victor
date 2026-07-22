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
