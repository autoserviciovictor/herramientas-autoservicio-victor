# Inventario Victor V3.0.2 S25 Camera Fix

Versión basada en la V3 estable.

Cambios principales:
- Selección automática de cámara trasera principal por deviceId.
- Mejora interna de autofocus continuo para Samsung S25.
- Zoom interno suave sin botones ni carteles.
- Mantiene diseño V3, Google Sheets, carga manual y cierre de escáner.

Abrir con: `?v=302-s25-camera`

# Inventario Victor V3.0 estable

Aplicación web para inventario del Autoservicio Victor con celular como lector de códigos de barras.

## Objetivo de V3.0 estable

Preparar el sistema para que varias personas puedan contar desde distintos celulares usando la misma base en Google Sheets.

## Cambios principales

- Sincronización automática de productos cada 15 segundos.
- La pestaña **Cargados** se actualiza con cambios hechos desde otros celulares.
- Al escanear un producto, la app intenta refrescar ese producto desde Google Sheets antes de cargar cantidad.
- Después de guardar o corregir, la app sincroniza en segundo plano.
- Nueva ruta del servidor: `GET /producto/:codigo`.
- El servidor tiene una cola por código para evitar que dos celulares pisen el mismo producto si guardan al mismo tiempo.

## Rutas del servidor

- `GET /productos`
- `GET /producto/:codigo`
- `POST /guardar`
- `POST /corregir`
- `GET /descargar`
- `POST /reiniciar`

## Columnas de Google Sheets

La hoja debe llamarse `Stock` y mantener este orden exacto:

```text
codigo
articulo
stock
salon
deposito
```

## Render

Variables necesarias:

```text
SPREADSHEET_ID
GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY
```

Build command:

```text
npm install
```

Start command:

```text
npm start
```
