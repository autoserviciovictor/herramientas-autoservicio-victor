# Corrección: guardado de edición de usuarios

Se corrigió el rango de escritura de Google Sheets al actualizar un usuario.

La fila de Usuarios contiene 9 columnas (A:I), incluyendo `Sectores a cargo`, pero la ruta de edición intentaba escribir esos 9 valores en el rango A:H. Google Sheets rechazaba la actualización y por eso no se guardaban cambios de rol, sector personal o sectores a cargo.

La corrección se aplicó en:

- `server.js`
- `beta/server.js`

No se modificaron otros módulos ni permisos.
