# Auditoría v11.9.2

- La lista escrita se guarda mediante una única operación por lote.
- Cada línea conserva exactamente el texto posterior a la cantidad.
- Se evita que una falla intermedia deje productos parcialmente guardados.
- Tras guardar, se limpia el cuadro y se abre Mi lista.
- Se agregó el endpoint `POST /reposicion/lote`.
- Caché y referencias actualizadas a v1192.
