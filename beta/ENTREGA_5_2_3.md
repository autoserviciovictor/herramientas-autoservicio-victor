# Entrega 5.2.3 — Corrección de códigos con ceros iniciales

## Problema corregido

El importador trataba como diferentes códigos equivalentes como `00663` y `663`, lo que generaba productos duplicados al volver a importar el mismo archivo.

## Solución

- El código original se conserva para mostrarlo y guardarlo.
- Para comparar, los códigos exclusivamente numéricos ignoran ceros iniciales.
- La misma clave se usa para el catálogo existente, el archivo importado y la limpieza de duplicados.
- La hoja `Stock` no se modifica.

## Resultado esperado

Al volver a importar el mismo archivo, los códigos cortos ya existentes deben aparecer como productos sin cambios y no como productos nuevos. Al confirmar una vez, los duplicados históricos equivalentes se consolidan en una sola fila.
