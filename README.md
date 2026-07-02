# Inventario Victor V2.0

Aplicación web para inventario del Autoservicio Victor usando celular como lector de códigos de barras.

## Cambio principal de V2.0

Esta versión ya no trabaja con Excel local.

Ahora funciona así:

Celular → GitHub Pages → Servidor Render → Google Sheets

## Google Sheets

Planilla: Inventario Victor  
Hoja: Stock

Las columnas deben quedar exactamente así:

codigo | articulo | stock | salon | deposito

No cambiar el orden.

## Frontend

Archivos principales:

- index.html
- style.css
- app.js
- excel.js
- scanner.js
- ui.js
- config.js

Antes de subir a GitHub Pages, abrir `config.js` y cambiar:

```js
export const API_BASE_URL = "https://TU-SERVIDOR-RENDER.onrender.com";
```

por la URL real del servidor de Render.

## Servidor Render

La carpeta `servidor-render` contiene el backend Node.js.

Archivos:

- server.js
- package.json
- .env.example

Variables de entorno necesarias en Render:

```env
SPREADSHEET_ID=ID_DE_LA_PLANILLA
GOOGLE_CLIENT_EMAIL=EMAIL_DE_LA_CUENTA_DE_SERVICIO
GOOGLE_PRIVATE_KEY=CLAVE_PRIVADA_DE_LA_CUENTA_DE_SERVICIO
```

La hoja de Google Sheets debe estar compartida con el email de la cuenta de servicio.

## Rutas del servidor

- GET `/productos`
- POST `/guardar`
- POST `/corregir`
- GET `/descargar`
- POST `/reiniciar`

## Funcionamiento

- La app carga productos desde Google Sheets.
- Al escanear, busca el código en la lista descargada.
- Al guardar, envía el dato al servidor.
- El servidor actualiza salón o depósito.
- El servidor recalcula stock = salon + deposito.
- La descarga genera un Excel listo para importar.


## V2.0.1

API configurada en config.js:
https://inventario-victor-api.onrender.com

Antes de usar, cargar en Render las variables:
- SPREADSHEET_ID
- GOOGLE_CLIENT_EMAIL
- GOOGLE_PRIVATE_KEY

Probar primero:
https://inventario-victor-api.onrender.com/productos
