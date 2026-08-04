# Auditoría v12.2.4

- Al guardar una edición con cero tareas seleccionadas, el servidor elimina todas las asignaciones del usuario para la fecha y turno y devuelve la lista actualizada.
- El cliente usa la respuesta actualizada inmediatamente, cierra el editor y vuelve a renderizar; una tarjeta sin tareas desaparece sin esperar otra lectura de Google Sheets.
- El botón del editor conserva correctamente el texto `Guardar cambios` si ocurre un error.
- Marcar una tarea solicita confirmación antes de completar.
- Cancelar restaura el check sin modificar la tarea.
- Se bloquean dobles toques mientras la tarea está siendo procesada.
- La notificación al supervisor solo se genera después de una confirmación y un guardado exitosos.
- Versión, referencias y caché PWA actualizados a 12.2.4 / 1224.
- Sintaxis JavaScript y archivos JSON validados.
