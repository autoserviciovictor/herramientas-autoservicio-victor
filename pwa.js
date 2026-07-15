let eventoInstalacion = null;
let registroSW = null;
let workerEsperando = null;

const btnInstalar = document.getElementById('btnInstalarApp');
const textoInstalacion = document.getElementById('estadoInstalacionApp');
const estadoActualizacion = document.getElementById('estadoActualizacionApp');
const updateOverlay = document.getElementById('updateOverlay');

function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function actualizarEstadoInstalacion() {
  if (!btnInstalar || !textoInstalacion) return;
  if (estaInstalada()) {
    btnInstalar.disabled = true;
    btnInstalar.textContent = '✓ Aplicación instalada';
    textoInstalacion.textContent = 'La aplicación ya está instalada en este dispositivo.';
  } else if (eventoInstalacion) {
    btnInstalar.disabled = false;
    btnInstalar.textContent = '⬇ Instalar aplicación';
    textoInstalacion.textContent = 'Instalala para abrirla desde la pantalla principal.';
  } else {
    btnInstalar.disabled = false;
    btnInstalar.textContent = 'ℹ Cómo instalar';
    textoInstalacion.textContent = 'En Chrome, abrí el menú y elegí “Instalar aplicación”.';
  }
}

function mostrarActualizacion(worker) {
  workerEsperando = worker;
  if (estadoActualizacion) estadoActualizacion.textContent = 'Nueva versión disponible';
  updateOverlay?.classList.remove('oculto');
  updateOverlay?.setAttribute('aria-hidden','false');
}

function ocultarActualizacion() {
  updateOverlay?.classList.add('oculto');
  updateOverlay?.setAttribute('aria-hidden','true');
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); eventoInstalacion = event; actualizarEstadoInstalacion();
});
window.addEventListener('appinstalled', () => { eventoInstalacion = null; actualizarEstadoInstalacion(); });

btnInstalar?.addEventListener('click', async () => {
  if (estaInstalada()) return;
  if (!eventoInstalacion) {
    await window.AppDialog?.alert({ titulo:'Cómo instalar', mensaje:'Abrí el menú de Chrome y elegí “Instalar aplicación” o “Agregar a pantalla principal”.', confirmarTexto:'Entendido' });
    return;
  }
  eventoInstalacion.prompt(); await eventoInstalacion.userChoice; eventoInstalacion = null; actualizarEstadoInstalacion();
});

document.getElementById('btnActualizarDespues')?.addEventListener('click', ocultarActualizacion);
document.getElementById('btnActualizarAhora')?.addEventListener('click', () => {
  if (estadoActualizacion) estadoActualizacion.textContent = 'Actualizando…';
  workerEsperando?.postMessage({ type:'SKIP_WAITING' });
});

if ('serviceWorker' in navigator) {
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return; recargando = true; window.location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      registroSW = await navigator.serviceWorker.register('./service-worker.js', { scope:'./' });
      if (registroSW.waiting && navigator.serviceWorker.controller) mostrarActualizacion(registroSW.waiting);
      registroSW.addEventListener('updatefound', () => {
        const nuevo = registroSW.installing;
        nuevo?.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) mostrarActualizacion(nuevo);
        });
      });
      const comprobar = () => registroSW?.update().catch(()=>{});
      setInterval(comprobar, 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) comprobar(); });
      if (estadoActualizacion) estadoActualizacion.textContent = 'Actualizada';
    } catch (error) {
      console.error('No se pudo registrar el service worker:', error);
      if (estadoActualizacion) estadoActualizacion.textContent = 'No se pudo comprobar';
    }
  });
}

actualizarEstadoInstalacion();
