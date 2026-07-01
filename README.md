# Inventario Victor 1.0

Aplicación web para inventario por escaneo de códigos de barras.

## Archivos incluidos

- `index.html`
- `style.css`
- `app.js`
- `excel.js`
- `scanner.js`
- `ui.js`
- `VERSION.txt`
- `CHANGELOG.txt`

## Cómo usar

1. Subí todos los archivos a GitHub Pages.
2. Abrí la app desde el celular.
3. Entrá en **Ajustes**.
4. Tocá **Cargar Excel**.
5. Elegí ubicación: **Salón** o **Depósito**.
6. Volvé a **Inventario**.
7. Escaneá, cargá cantidad y guardá.
8. Para corregir un producto, entrá en **Corregir**.
9. Para descargar el Excel actualizado, entrá en **Ajustes** y tocá **Descargar Excel actualizado**.

## Columnas esperadas del Excel

- `codigo`
- `articulo`
- `stock`
- `salon`
- `deposito`

La app recalcula `stock` como `salon + deposito`.
