# Autoservicio V6.1.9 Beta

## Importación inteligente de catálogo

Desde **Administrador → Sistema** se puede seleccionar un archivo `.xls` o `.xlsx` exportado por el sistema comercial.

- Detecta automáticamente Código y Artículo.
- Si el archivo incluye Precio, lo actualiza.
- Agrega productos nuevos con stock, salón y depósito en cero.
- Conserva el stock contado de los productos existentes.
- Actualiza las hojas `Stock` y `Productos`.

El archivo de ejemplo `Stock _ Inventario(3).xls` no contiene una columna de precio; por eso con ese archivo se sincronizan códigos y artículos, pero no precios.

# Herramientas Autoservicio Victor V6.1.1

## Canal beta automático por rol

- Los usuarios con rol `administrador` ingresan automáticamente a la carpeta `beta/`.
- Los usuarios con rol `repositor` permanecen siempre en la versión estable de la raíz.
- No hay botones para elegir el canal.
- El cambio se decide por el rol devuelto por el servidor al iniciar o validar la sesión.

## Publicación

1. La versión estable se mantiene en la raíz del repositorio.
2. La versión que se quiere probar se carga en `beta/`.
3. El administrador la prueba automáticamente.
4. Para liberarla al resto, se copian los archivos aprobados de `beta/` a la raíz.

El resto de las funciones de V6.0.5 y del historial mejorado se conservan.


## V6.1.5 Beta - Notificaciones
Configurar en Render VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT. Cada dispositivo debe activar el permiso una vez desde Configuración. Para avisos diarios confiables con la app cerrada, invocar POST /notificaciones/cron con x-cron-secret mediante un cron externo.

## V6.1.7.1

Backend reforzado para persistencia de Lista 1 y Lista 2 en Google Sheets, sin pérdidas por escrituras simultáneas.


## Importación del catálogo valuado
Use `Stock _ Inventario Valuado.xls`. El sistema importa Código, Artículo y Precio, muestra una vista previa y solo guarda después de confirmar. Stock y Sub Total del archivo se ignoran; Stock, Salón y Depósito de la app se conservan.
