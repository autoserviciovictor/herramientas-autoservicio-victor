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


## Instalación como aplicación (PWA)

La aplicación se puede instalar desde Chrome o Edge mediante el botón **Instalar aplicación** de la pantalla Ajustes. Debe publicarse por HTTPS (GitHub Pages cumple este requisito).

Esta entrega almacena la interfaz para que pueda abrirse sin conexión. El guardado offline de inventario, vencimientos y reposición se incorporará por separado.


## Modo administrador (V5.3.8)
Configure `ADMIN_KEY` y `ADMIN_TOKEN_SECRET` en Render. El PIN se valida en el servidor y la sesión firmada vence a las 8 horas.


## Reposición individual (V5.3.8)

La lista de Reposición es temporal y privada por usuario. No usa Google Sheets. Inventario y Vencimientos siguen compartidos. Al marcar un producto como terminado, se elimina. El archivo temporal se guarda por defecto en `data/reposicion-temporal.json`; en servicios con disco efímero puede perderse tras un nuevo despliegue. Para persistencia garantizada se puede configurar `REPOSICION_DATA_FILE` sobre un disco persistente.

## Flujo de la lista de reposición (V5.3.8)

- Los productos pendientes se muestran primero.
- Al marcarlos con la tilde, permanecen visibles con marco verde y pasan al final.
- Una segunda pulsación permite devolverlos a pendientes.
- Al terminar el trabajo, `Empezar nueva lista` elimina todos los registros de la lista personal actual.


## Navegación V5.3.8

- El menú de usuario está en la esquina superior derecha.
- La flecha de regreso queda disponible en la esquina superior izquierda.
- Configuración ya no contiene acceso administrativo ni cierre de sesión.
- Cerrar sesión está disponible únicamente desde el menú de usuario.

## V6.0.3
La aplicación puede abrir datos previamente consultados sin conexión y guardar temporalmente operaciones de Inventario, Vencimientos y Lista. Los cambios pendientes se sincronizan automáticamente al recuperar Internet.

El servidor crea automáticamente la hoja `Historial Vencimientos`, visible desde Administración, con el usuario, fecha y hora de cada alta, edición o eliminación.
