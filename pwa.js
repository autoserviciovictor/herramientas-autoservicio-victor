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
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
    } catch (error) {
      console.error('No se pudo registrar el service worker:', error);
      if (textoInstalacion) textoInstalacion.textContent = 'No se pudo preparar la instalación. Actualizá la página e intentá nuevamente.';
    }
  });
}

actualizarEstadoInstalacion();
