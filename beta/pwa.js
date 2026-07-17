let eventoInstalacion = null;

const btnInstalar = document.getElementById('btnInstalarApp');
const textoInstalacion = document.getElementById('estadoInstalacionApp');

function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function actualizarEstadoInstalacion() {
  if (!btnInstalar || !textoInstalacion) return;
  if (estaInstalada()) {
    btnInstalar.disabled = true;
    btnInstalar.textContent = '✓ Aplicación instalada';
    textoInstalacion.textContent = 'La aplicación ya está instalada en este dispositivo.';
    return;
  }
  if (eventoInstalacion) {
    btnInstalar.disabled = false;
    btnInstalar.textContent = '⬇ Instalar aplicación';
    textoInstalacion.textContent = 'Instalala para abrirla desde la pantalla principal.';
  } else {
    btnInstalar.disabled = false;
    btnInstalar.textContent = 'ℹ Cómo instalar';
    textoInstalacion.textContent = 'En Chrome, abrí el menú del navegador y elegí “Instalar aplicación” o “Agregar a pantalla principal”.';
  }
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  eventoInstalacion = event;
  actualizarEstadoInstalacion();
});

window.addEventListener('appinstalled', () => {
  eventoInstalacion = null;
  actualizarEstadoInstalacion();
});

btnInstalar?.addEventListener('click', async () => {
  if (estaInstalada()) return;
  if (!eventoInstalacion) {
    alert('Abrí el menú de Chrome y elegí “Instalar aplicación” o “Agregar a pantalla principal”.');
    return;
  }
  eventoInstalacion.prompt();
  await eventoInstalacion.userChoice;
  eventoInstalacion = null;
  actualizarEstadoInstalacion();
});

if ('serviceWorker' in navigator) {
  let ultimoControlActualizacion = 0;

  async function comprobarActualizacionSilenciosa(registro) {
    const ahora = Date.now();
    if (!registro || ahora - ultimoControlActualizacion < 15 * 60 * 1000) return;
    ultimoControlActualizacion = ahora;
    try {
      await registro.update();
    } catch (error) {
      // La actualización es silenciosa y no debe interrumpir el uso de la app.
      console.debug('Actualización PWA pendiente:', error?.message || error);
    }
  }

  window.addEventListener('load', async () => {
    try {
      const registro = await navigator.serviceWorker.register('./service-worker.js?v=6151-badge', {
        scope: './',
        updateViaCache: 'none'
      });
      await comprobarActualizacionSilenciosa(registro);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') comprobarActualizacionSilenciosa(registro);
      });
    } catch (error) {
      console.error('No se pudo registrar el service worker:', error);
      if (textoInstalacion) textoInstalacion.textContent = 'No se pudo preparar la instalación. Actualizá la página e intentá nuevamente.';
    }
  });
}

actualizarEstadoInstalacion();
