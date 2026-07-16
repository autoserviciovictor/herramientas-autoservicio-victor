# Herramientas Autoservicio Victor V6.0.4

Aplicación interna instalable para Inventario, Vencimientos y listas privadas de reposición.

## Arquitectura

- Frontend PWA publicado en GitHub Pages.
- API Node.js/Express publicada en Render.
- Google Sheets para productos, stock, vencimientos, usuarios e historial de vencimientos.
- Archivo temporal del servidor para las listas privadas de reposición.

## Archivos principales

- `index.html`, `style.css`, `app.js`: interfaz y navegación.
- `auth.js`: inicio y cierre de sesión.
- `admin.js`: usuarios, historial y sistema.
- `reposicion.js`: listas privadas por usuario.
- `excel.js`: cliente de la API de Inventario y Vencimientos. El nombre se conserva por compatibilidad; ya no procesa archivos Excel locales.
- `scanner.js`: escáner de códigos.
- `service-worker.js`, `manifest.webmanifest`, `pwa.js`: instalación PWA.
- `server.js`: API y conexión con Google Sheets.

## Variables de entorno de Render

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `SPREADSHEET_ID`
- `ADMIN_KEY`: contraseña inicial del primer usuario `admin`.
- `ADMIN_TOKEN_SECRET`: clave privada larga para firmar sesiones.
- `ADMIN_USERNAME` (opcional; por defecto `admin`).
- `ALLOWED_ORIGINS` (opcional; orígenes permitidos separados por comas).
- `REPOSICION_DATA_FILE` (opcional; ruta persistente para las listas).

## Hojas utilizadas

- `Stock`
- `Productos`
- `Vencimientos`
- `Usuarios`
- `Historial Vencimientos`

## Limpieza V6.0.4

Se eliminaron componentes obsoletos que ya no eran usados por la aplicación:

- Exportación y descarga de archivos Excel.
- Dependencia npm `xlsx`.
- Endpoint de reinicio total del inventario.
- Login administrativo antiguo separado del login de usuarios.
- Endpoints administrativos de listas activas.
- Variables de entorno relacionadas con esas funciones antiguas.

Inventario y Vencimientos continúan usando Google Sheets normalmente.
