# Herramientas Autoservicio Victor

Versión **5.1.1**.

Aplicación web para Inventario, Control de Vencimientos y Reposición, con frontend estático y servidor Node.js conectado a Google Sheets.

## Archivos principales

- `server.js`: API y acceso a Google Sheets.
- `app.js`: navegación y lógica principal del frontend.
- `excel.js`: comunicación del inventario con la API.
- `reposicion.js`: módulo de reposición.
- `scanner.js`: lectura de códigos de barras.
- `config.js`: URL de la API y versión.

## Hojas de Google Sheets

- `Stock`: `codigo`, `articulo`, `stock`, `salon`, `deposito`.
- `Productos`: `codigo`, `articulo`.
- `Vencimientos`: se crea automáticamente con 10 columnas.
- `Reposicion`: se crea automáticamente con 7 columnas.

## Variables de entorno

Copiar `.env.example` y configurar:

- `SPREADSHEET_ID`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `ALLOWED_ORIGINS` (recomendado)
- `RESET_KEY` (necesaria para habilitar el reinicio total)
- `API_WRITE_KEY` (opcional; no activarla hasta actualizar el frontend para enviar la clave)

## Ejecutar

```bash
npm install
npm start
```

Verificación de sintaxis:

```bash
npm run check
```

## Seguridad

El endpoint `/reiniciar` queda deshabilitado si `RESET_KEY` no está configurada. Para ejecutarlo requiere el encabezado `x-reset-key` y el texto exacto `REINICIAR INVENTARIO` en `confirmacion`.

Las escrituras generales pueden protegerse mediante `API_WRITE_KEY`. Esta opción se mantiene desactivada si la variable está vacía para conservar compatibilidad con el frontend actual.

## Escáner

La aplicación utiliza `@zxing/library` 0.23.0 fijado desde UNPKG. Solo puede existir una sesión de cámara activa entre los módulos. Al cerrar o cambiar de módulo se detienen todos los tracks de video.
