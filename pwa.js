let eventoInstalacion = null;
let registroSW = null;
let workerEsperando = null;
const UPDATE_RELOAD_KEY = 'autoservicio-update-reload';

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
document.getElementById('btnActualizarAhora')?.addEventListener('click', async () => {
  if (estadoActualizacion) estadoActualizacion.textContent = 'Actualizando…';
  const boton = document.getElementById('btnActualizarAhora');
  if (boton) boton.disabled = true;
  try {
    sessionStorage.setItem(UPDATE_RELOAD_KEY, '1');
    if (workerEsperando) {
      workerEsperando.postMessage({ type:'SKIP_WAITING' });
      setTimeout(() => window.location.reload(), 4000);
    } else {
      await registroSW?.update();
      window.location.reload();
    }
  } catch (error) {
    console.error('No se pudo aplicar la actualización:', error);
    sessionStorage.removeItem(UPDATE_RELOAD_KEY);
    if (estadoActualizacion) estadoActualizacion.textContent = 'No se pudo actualizar';
    if (boton) boton.disabled = false;
  }
});

if ('serviceWorker' in navigator) {
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
    recargando = true;
    sessionStorage.removeItem(UPDATE_RELOAD_KEY);
    window.location.reload();
  });
  window.addEventListener('load', async () => {
    sessionStorage.removeItem(UPDATE_RELOAD_KEY);
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
