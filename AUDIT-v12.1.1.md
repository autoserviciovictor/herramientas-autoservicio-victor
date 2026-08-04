# Auditoría v12.1.1

## Objetivo
Reducir las lecturas repetidas de Google Sheets provocadas por el centro de notificaciones y evitar respuestas HTTP 429 por cuota excedida.

## Backend
- Caché de suscripciones push: 60 segundos.
- Caché del registro de claves enviadas: 60 segundos.
- Caché compartida del centro de notificaciones: 30 segundos.
- Deduplicación de lecturas simultáneas mediante la infraestructura `leerConCache` existente.
- Actualización incremental de la caché después de crear o marcar notificaciones.
- Invalidación de suscripciones al guardar o desactivar dispositivos.
- Cabeceras HTTP privadas con reutilización breve para el centro.

## Frontend
- Caché de sesión durante 30 segundos.
- Una sola petición en curso aunque distintos eventos soliciten una actualización simultáneamente.
- Se eliminó la doble lectura inicial al cargar la página.
- Actualización optimista al marcar notificaciones como leídas.
- Recarga forzada solo al iniciar/cambiar sesión o cuando se emite un evento de nueva notificación.

## Validaciones
- Sintaxis de todos los archivos JavaScript verificada con `node --check`.
- Archivos JSON validados.
- Versión y caché PWA actualizadas a 12.1.1 / v1211.
