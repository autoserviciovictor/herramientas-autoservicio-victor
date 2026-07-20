let eventoInstalacion = null;

const btnInstalar = document.getElementById('btnInstalarApp');
const textoInstalacion = document.getElementById('estadoInstalacionApp');
const iosModal = document.getElementById('iosInstallModal');
const iosWarning = document.getElementById('iosInstallBrowserWarning');

function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function esIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function esSafariIOS() {
  return esIOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios/i.test(navigator.userAgent);
}

function abrirGuiaIOS() {
  iosWarning?.classList.toggle('oculto', esSafariIOS());
  iosModal?.classList.remove('oculto');
  iosModal?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-abierto');
}

function cerrarGuiaIOS() {
  iosModal?.classList.add('oculto');
  iosModal?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-abierto');
}

document.getElementById('btnCerrarIosInstall')?.addEventListener('click', cerrarGuiaIOS);
iosModal?.addEventListener('click', e => { if (e.target === iosModal) cerrarGuiaIOS(); });

function actualizarEstadoInstalacion() {
  if (!btnInstalar || !textoInstalacion) return;
  if (estaInstalada()) {
    btnInstalar.disabled = true;
    btnInstalar.textContent = '✓ Aplicación instalada';
    textoInstalacion.textContent = 'La aplicación ya está instalada en este dispositivo.';
    return;
  }
  if (esIOS()) {
    btnInstalar.disabled = false;
    btnInstalar.textContent = 'Ver cómo instalar';
    textoInstalacion.textContent = esSafariIOS()
      ? 'En iPhone se instala desde Compartir → Agregar a pantalla de inicio.'
      : 'Abrila en Safari para instalarla en tu iPhone o iPad.';
    return;
  }
  if (eventoInstalacion) {
    btnInstalar.disabled = false;
    btnInstalar.textContent = '⬇ Instalar aplicación';
    textoInstalacion.textContent = 'Instalala para abrirla desde la pantalla principal.';
  } else {
    btnInstalar.disabled = false;
    btnInstalar.textContent = 'ℹ Cómo instalar';
    textoInstalacion.textContent = 'Abrí el menú del navegador y elegí “Instalar aplicación” o “Agregar a pantalla principal”.';
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
  if (esIOS()) return abrirGuiaIOS();
  if (!eventoInstalacion) return;
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
    try { await registro.update(); } catch (error) { console.debug('Actualización PWA pendiente:', error?.message || error); }
  }
  window.addEventListener('load', async () => {
    try {
      const registro = await navigator.serviceWorker.register('./service-worker.js?v=6112-entrega1', { scope: './', updateViaCache: 'none' });
      await comprobarActualizacionSilenciosa(registro);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') comprobarActualizacionSilenciosa(registro); });
    } catch (error) {
      console.error('No se pudo registrar el service worker:', error);
      if (textoInstalacion) textoInstalacion.textContent = 'No se pudo preparar la instalación. Actualizá la página e intentá nuevamente.';
    }
  });
}

actualizarEstadoInstalacion();
