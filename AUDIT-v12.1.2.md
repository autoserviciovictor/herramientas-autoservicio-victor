# Auditoría v12.1.2

## Notificaciones de vencimientos

- Los avisos diarios de 1, 3, 7 y 15 días se agrupan por umbral.
- Se envía como máximo un aviso por día y por umbral.
- El resumen de vencidos se envía una sola vez por día e informa la cantidad total de productos vencidos registrados.
- La carga de un vencimiento continúa generando un aviso individual.
- Se eliminaron del procesamiento diario los avisos individuales `hoy`, `vencido` y `oferta-3`.
- Las claves de deduplicación de resúmenes usan fecha y tipo de grupo.
- El Centro de notificaciones recibe el mismo resumen únicamente para usuarios activos con el módulo Vencimientos habilitado.
- Se conserva la caché y optimización de cuota incorporada en v12.1.1.
