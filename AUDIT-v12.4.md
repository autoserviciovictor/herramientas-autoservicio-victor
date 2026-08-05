# Auditoría v12.4 — Días de realización por tarea

- Se agregó selección múltiple de lunes a domingo al crear y editar tareas.
- Es obligatorio seleccionar al menos un día.
- Las tareas existentes sin configuración de días se consideran disponibles todos los días para mantener compatibilidad.
- La pantalla de configuración muestra duración y días habituales.
- Al asignar tareas para una fecha, solo aparecen las configuradas para el día de la semana correspondiente.
- Los días se guardan en la columna `Días semana` de la hoja `Tareas` como JSON.
- Las asignaciones históricas existentes no se eliminan ni modifican al cambiar los días habituales.
- Versión, backend y caché PWA actualizados a 12.4.
