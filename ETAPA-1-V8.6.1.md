# V8.6.1 — Etapa 1: estabilidad de Horarios

## Correcciones implementadas

- Guardado incremental de calendarios en Google Sheets: se modifican únicamente las filas alteradas, evitando reescribir toda la hoja.
- Protección contra conflictos entre dispositivos conservada y reforzada.
- Limpieza automática de filas duplicadas para una misma persona y día cuando esa celda vuelve a guardarse.
- Compatibilidad de edición para supervisores cuyo sector principal todavía está guardado en `sector` además de `sectores`.
- Los turnos configurados con identificadores internos ahora muestran siempre sus horas reales.
- Las celdas muestran inicio y fin centrados en dos líneas, por ejemplo `10:00` y `16:00`.
- Los identificadores internos dejan de mostrarse en el calendario y en Mi horario.
- Selección de celdas con borde negro y sombra, sin deformación, reducción ni cambio del color del turno.
- Versión actualizada a 8.6.1.

## Validaciones realizadas

- Validación de sintaxis de `server.js`.
- Validación de sintaxis de `horarios.js`.
- Validación de sintaxis de `config.js`.

## Pruebas recomendadas después de publicar

1. Crear varios horarios en un sector y guardar.
2. Recargar la aplicación y confirmar que todos continúan visibles.
3. Editar una sola celda y confirmar que las demás no cambian.
4. Abrir dos dispositivos, modificar celdas distintas y guardar desde ambos.
5. Intentar modificar la misma celda desde dos dispositivos y comprobar el aviso de conflicto.
6. Entrar como supervisor y verificar el botón Editar y todos los sectores asignados.
