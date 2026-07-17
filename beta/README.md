# Autoservicio V6.1.10 Beta — Base consolidada

Esta beta consolida sobre una sola base:

- Mejoras de Vencimientos de V6.1.8.
- Historial administrativo filtrable.
- Lista 1 y Lista 2, edición y persistencia.
- Notificaciones existentes.
- Diseño responsive para PC.
- Importación segura de `Stock _ Inventario Valuado.xls`.

## Importación del catálogo

La importación se realiza desde Administrador → Sistema.

- Lee Código, Artículo y Precio.
- Ignora Stock y Sub Total del XLS.
- Escribe exclusivamente en la hoja `Productos`.
- Nunca agrega, modifica ni repone filas en la hoja `Stock`.
- Muestra una vista previa antes de guardar.

La raíz del ZIP continúa siendo el canal estable. La carpeta `beta/` contiene esta versión de prueba.
