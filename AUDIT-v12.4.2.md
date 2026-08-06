# Auditoría v12.4.2 — Base del layout de escritorio

## Alcance

Esta entrega agrega únicamente la infraestructura reutilizable para migrar de forma gradual las pantallas de escritorio. No se asignaron las clases nuevas a ninguna vista existente.

## Archivo nuevo

- `desktop-layout.css`

## Clases disponibles

- `.desktop-page-shell`: contenedor estándar centrado.
- `.desktop-page-shell--wide`: variante de ancho completo para Calendario.
- `.desktop-page-shell__header`: encabezado dentro del mismo eje.
- `.desktop-page-shell__content`: contenido alineado con el encabezado.
- `.desktop-page-section`: sección de ancho completo dentro del shell.
- `.desktop-page-stack`: pila vertical uniforme.
- `.desktop-page-grid`: grilla reutilizable.
- `.desktop-page-full-width`: elemento que ocupa todo el ancho del shell.

## Variables

- `--desktop-page-max-width`
- `--desktop-page-inline-gap`
- `--desktop-page-block-gap`
- `--desktop-page-section-gap`

## Compatibilidad

- Las reglas se activan solo desde `901px`.
- No se modificó la vista móvil.
- No se modificó la estructura HTML de ninguna pantalla.
- No se modificó lógica funcional.

## Próximo paso

Aplicar el shell únicamente a Inventario → Cargar en v12.4.3 y validar antes de migrar otras vistas.
