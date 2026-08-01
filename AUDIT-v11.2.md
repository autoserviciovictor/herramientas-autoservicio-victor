# Auditoría v11.2

## Cambios funcionales

- Las asignaciones de tareas se guardan mediante una operación puntual en el servidor para evitar sobrescrituras por copias locales incompletas.
- Administradores y supervisores pueden editar responsables o eliminar asignaciones dentro de sus sectores permitidos.
- La configuración y las confirmaciones de limpieza del baño se almacenan en una hoja compartida `Tareas_Bano`.
- La rotación se carga al ingresar desde cualquier usuario o dispositivo.
- El guardado de la rotación muestra estado de proceso, confirmación y errores.
- El selector de segundo sector vuelve a cargar los sectores reales y excluye correctamente el sector principal.
- El editor de Horarios queda integrado al flujo de contenido en escritorio.

## Compatibilidad

- `localStorage` se conserva como respaldo temporal, pero el servidor es la fuente compartida.
- Las plantillas y asignaciones existentes de la hoja `Tareas` siguen siendo compatibles.
