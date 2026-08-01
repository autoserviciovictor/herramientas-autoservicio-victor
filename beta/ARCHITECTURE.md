# Arquitectura beta — v10.5

## App Shell compartido

La estructura visual común vive en:

- `module-registry.js`: fuente única de títulos, iconos y navegación por módulo.
- `ui.js`: sincroniza pantalla activa, encabezado y navegación lateral.
- `app-shell.css`: layout compartido para escritorio y móvil.

## Regla de navegación

Cada módulo conserva su barra inferior original como controlador funcional. En escritorio, el App Shell genera una representación lateral desde esa misma fuente; no duplica listeners ni lógica de negocio.

## Alias de pantallas

`productos`, `cargados` y `editarProducto` pertenecen al módulo `inventario`. El registro resuelve estos alias para que encabezado y navegación permanezcan consistentes.

## Próximas etapas

La v10.5 podrá unificar tokens y componentes visuales sin volver a modificar la lógica de navegación.

## v10.5 — Sistema de diseño

La capa visual compartida se divide en:

- `design-tokens.css`: paleta, tipografía, escala de espaciado, radios y sombras.
- `design-components.css`: reglas comunes para botones, campos, tarjetas, modales, estados e iconos.
- `style.css`: estilos específicos y legado de cada módulo.
- `app-shell.css`: estructura global y responsive del layout.

Los estilos nuevos deben usar variables `--ds-*` en lugar de introducir colores, radios o sombras aislados.

## v10.6 — Refactorización modular

Se inició la separación progresiva por dominios sin modificar los flujos estables:

- `shared/dom-utils.js`: escape HTML, duración y normalización compartida.
- `modules/tareas/task-view.js`: plantillas de tarjetas, responsables y secciones por turno.
- `modules/horarios/schedule-format.js`: parseo y presentación de turnos normales, cortados y estados especiales.
- `modules/inventario/`: punto de entrada documentado para la separación posterior del escáner, productos y reposición.

Los módulos Tareas, Horarios, Precios y Reposición consumen ahora utilidades comunes. Esto reduce duplicación y permite continuar la extracción por partes sin reescribir la aplicación completa ni alterar su comportamiento.
