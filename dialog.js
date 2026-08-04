(function () {
  let resolutor = null;
  const $ = id => document.getElementById(id);

  function cerrar(valor) {
    const overlay = $('appDialogOverlay');
    if (overlay) {
      overlay.classList.add('oculto');
      overlay.setAttribute('aria-hidden', 'true');
    }
    const resolverActual = resolutor;
    resolutor = null;
    resolverActual?.(valor);
  }

  function abrir({ titulo, mensaje, confirmarTexto = 'Aceptar', cancelarTexto = 'Cancelar', peligro = false, modo = 'confirm', valor = '' }) {
    const overlay = $('appDialogOverlay');
    if (!overlay) return Promise.resolve(modo === 'confirm' ? false : null);
    document.getElementById('toast')?.classList.remove('mostrar');
    const inputWrap = $('appDialogInputWrap');
    const input = $('appDialogInput');
    $('appDialogTitulo').textContent = titulo || 'Confirmar';
    $('appDialogMensaje').textContent = mensaje || '';
    $('appDialogConfirmar').textContent = confirmarTexto;
    $('appDialogCancelar').textContent = cancelarTexto;
    $('appDialogConfirmar').classList.toggle('dialog-danger', peligro);
    $('appDialogCancelar').classList.toggle('oculto', modo === 'alert');
    inputWrap?.classList.toggle('oculto', modo !== 'prompt');
    if (input) input.value = valor ?? '';
    overlay.classList.remove('oculto');
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => (modo === 'prompt' ? input : $('appDialogConfirmar'))?.focus(), 30);
    return new Promise(resolve => { resolutor = resolve; });
  }

  function normalizarOpciones(opciones = {}) {
    return {
      titulo: opciones.titulo ?? opciones.title ?? 'Confirmar',
      mensaje: opciones.mensaje ?? opciones.message ?? '',
      confirmarTexto: opciones.confirmarTexto ?? opciones.confirmText ?? 'Aceptar',
      cancelarTexto: opciones.cancelarTexto ?? opciones.cancelText ?? 'Cancelar',
      peligro: opciones.peligro ?? opciones.danger ?? false,
      valor: opciones.valor ?? opciones.value ?? ''
    };
  }

  const dialogoPublico = {
    confirm(opciones = {}) { return abrir({ ...normalizarOpciones(opciones), modo: 'confirm' }); },
    alert(opciones = {}) { return abrir({ ...normalizarOpciones(opciones), modo: 'alert', cancelarTexto: '' }); },
    prompt(opciones = {}) { return abrir({ ...normalizarOpciones(opciones), modo: 'prompt' }); }
  };

  // Nombre actual y alias histórico utilizado por módulos existentes.
  window.AppDialog = dialogoPublico;
  window.AutoservicioDialog = dialogoPublico;

  window.addEventListener('DOMContentLoaded', () => {
    $('appDialogConfirmar')?.addEventListener('click', () => {
      const inputVisible = !$('appDialogInputWrap')?.classList.contains('oculto');
      cerrar(inputVisible ? $('appDialogInput')?.value ?? '' : true);
    });
    $('appDialogCancelar')?.addEventListener('click', () => cerrar(false));
    $('appDialogCerrar')?.addEventListener('click', () => cerrar(false));
    $('appDialogOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) cerrar(false); });
    $('appDialogInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') cerrar(e.currentTarget.value);
      if (e.key === 'Escape') cerrar(false);
    });
  });
})();
