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
