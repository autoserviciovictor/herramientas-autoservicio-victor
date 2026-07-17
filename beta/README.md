# Autoservicio V6.1.9 Beta

## Importación inteligente de catálogo

Desde **Administrador → Sistema** se puede seleccionar un archivo `.xls` o `.xlsx` exportado por el sistema comercial.

- Detecta automáticamente Código y Artículo.
- Si el archivo incluye Precio, lo actualiza.
- Agrega productos nuevos con stock, salón y depósito en cero.
- Conserva el stock contado de los productos existentes.
- Actualiza las hojas `Stock` y `Productos`.

El archivo de ejemplo `Stock _ Inventario(3).xls` no contiene una columna de precio; por eso con ese archivo se sincronizan códigos y artículos, pero no precios.

# Autoservicio V6.1.6.3 Beta — Identidad visual final

Base funcional: V6.1.5.1 Beta.

## Cambios
- Ícono oficial compacto con V y carrito.
- Nombre instalado: Autoservicio.
- Logo institucional en login y splash.
- Encabezado fijo Autoservicio / Herramientas en todas las pantallas.
- Título y descripción del módulo debajo del encabezado rojo.
- Notificaciones sin segundo logo grande a la derecha.

La versión estable ubicada en la raíz se mantiene sin cambios; el administrador prueba la carpeta beta.

## V6.1.7.1 Beta

- Lista 1 y Lista 2 se guardan en la hoja `Listas` de Google Sheets.
- Las escrituras se serializan globalmente para evitar que dos usuarios se sobrescriban.
- Las listas solo se vacían al confirmar `Empezar nueva lista`.
- El login usa una superficie blanca continua con ola roja inferior.
- Las notificaciones usan un icono grande transparente para evitar el avatar adicional a la derecha; el badge pequeño de Android se conserva.


## Importación del catálogo valuado
Use `Stock _ Inventario Valuado.xls`. El sistema importa Código, Artículo y Precio, muestra una vista previa y solo guarda después de confirmar. Stock y Sub Total del archivo se ignoran; Stock, Salón y Depósito de la app se conservan.
