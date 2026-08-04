# Auditoría v12.2.4.1

- Se corrigió la compatibilidad del diálogo global: `AppDialog` y `AutoservicioDialog` apuntan a la misma implementación.
- Se normalizan opciones en español e inglés (`title/titulo`, `message/mensaje`, etc.).
- El clic se captura sobre toda la fila de la tarea para abrir la confirmación de forma fiable.
- El check no cambia visualmente antes de confirmar.
- Durante el guardado se bloquean dobles toques.
- Solo después de una respuesta correcta se vuelve a renderizar marcado en verde.
