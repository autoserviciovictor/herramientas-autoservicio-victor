let eventoInstalacion = null;

const btnInstalar = document.getElementById("btnInstalarApp");
const btnInstalarAjustes = document.getElementById("settingsInstallApp");
const textoInstalacion = document.getElementById("estadoInstalacionApp");
const iosModal = document.getElementById("iosInstallModal");
const iosWarning = document.getElementById("iosInstallBrowserWarning");
const installCard = document.getElementById("pwaInstallCard");
const SW_RUNTIME_REVISION = "1960-d21-auditoria-correcciones-260826-d";
const SW_RELOAD_KEY = `autoservicio-sw-reload-${SW_RUNTIME_REVISION}`;

function estaInstalada() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function esIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function esSafariIOS() {
  return (
    esIOS() &&
    /safari/i.test(navigator.userAgent) &&
    !/crios|fxios|edgios|opios/i.test(navigator.userAgent)
  );
}

function abrirGuiaIOS() {
  iosWarning?.classList.toggle("oculto", esSafariIOS());
  iosModal?.classList.remove("oculto");
  iosModal?.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-abierto");
}

function cerrarGuiaIOS() {
  iosModal?.classList.add("oculto");
  iosModal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-abierto");
}

document
  .getElementById("btnCerrarIosInstall")
  ?.addEventListener("click", cerrarGuiaIOS);
iosModal?.addEventListener("click", (event) => {
  if (event.target === iosModal) cerrarGuiaIOS();
});

function actualizarEstadoInstalacion() {
  const instalada = estaInstalada();
  installCard?.classList.toggle("oculto", instalada);
  if (btnInstalarAjustes) {
    btnInstalarAjustes.disabled = instalada;
    const label = btnInstalarAjustes.querySelector("span");
    if (label) label.textContent = instalada ? "Aplicación instalada" : "Instalar aplicación";
  }
  if (!btnInstalar || !textoInstalacion) return;
  if (estaInstalada()) {
    btnInstalar.disabled = true;
    btnInstalar.textContent = "✓ Aplicación instalada";
    textoInstalacion.textContent =
      "La aplicación ya está instalada en este dispositivo.";
    return;
  }
  if (esIOS()) {
    btnInstalar.disabled = false;
    btnInstalar.textContent = "Ver cómo instalar";
    textoInstalacion.textContent = esSafariIOS()
      ? "En iPhone se instala desde Compartir → Agregar a pantalla de inicio."
      : "Abrila en Safari para instalarla en tu iPhone o iPad.";
    return;
  }
  if (eventoInstalacion) {
    btnInstalar.disabled = false;
    btnInstalar.textContent = "⬇ Instalar aplicación";
    textoInstalacion.textContent =
      "Instalala para abrirla desde la pantalla principal.";
  } else {
    btnInstalar.disabled = false;
    btnInstalar.textContent = "ℹ Cómo instalar";
    textoInstalacion.textContent =
      "Abrí el menú del navegador y elegí “Instalar aplicación” o “Agregar a pantalla principal”.";
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  eventoInstalacion = event;
  actualizarEstadoInstalacion();
});

window.addEventListener("appinstalled", () => {
  eventoInstalacion = null;
  actualizarEstadoInstalacion();
});

async function solicitarInstalacion() {
  if (estaInstalada()) return;
  if (esIOS()) return abrirGuiaIOS();
  if (!eventoInstalacion) {
    // Si el navegador no expuso el prompt, mantenemos el mismo comportamiento
    // informativo que ya usa la tarjeta de instalación.
    return;
  }
  eventoInstalacion.prompt();
  await eventoInstalacion.userChoice;
  eventoInstalacion = null;
  actualizarEstadoInstalacion();
}

btnInstalar?.addEventListener("click", solicitarInstalacion);
btnInstalarAjustes?.addEventListener("click", solicitarInstalacion);

if ("serviceWorker" in navigator) {
  const esDesarrolloLocal = ["127.0.0.1", "localhost"].includes(location.hostname);
  let ultimoControlActualizacion = 0;
  let registroActivo = null;

  function activarWorkerEnEspera(registro) {
    if (!registro?.waiting) return false;
    registro.waiting.postMessage({ type: "SKIP_WAITING" });
    return true;
  }

  async function comprobarActualizacionSilenciosa(registro, forzar = false) {
    const ahora = Date.now();
    if (
      !registro ||
      (!forzar && ahora - ultimoControlActualizacion < 15 * 60 * 1000)
    )
      return;
    ultimoControlActualizacion = ahora;
    try {
      await registro.update();
    } catch (error) {
      console.debug("Actualización PWA pendiente:", error?.message || error);
    }
  }

  if (!esDesarrolloLocal) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem(SW_RELOAD_KEY) === "1") return;
      sessionStorage.setItem(SW_RELOAD_KEY, "1");
      window.location.reload();
    });
  }

  window.addEventListener("load", async () => {
    try {
      // Desarrollo local: no debe existir ningún Service Worker activo.
      // Esto hace determinista Live Server y evita mezclar JS/CSS de builds viejos.
      if (esDesarrolloLocal) {
        const limpiezaKey = `autoservicio-dev-sw-disabled-${SW_RUNTIME_REVISION}`;
        const registros = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registros.map((item) => item.unregister()));
        if ("caches" in window) {
          const claves = await caches.keys();
          await Promise.all(
            claves
              .filter((clave) => clave.startsWith("autoservicio-v"))
              .map((clave) => caches.delete(clave)),
          );
        }
        registroActivo = null;
        console.info("Service Worker desactivado en desarrollo local.");
        if (
          navigator.serviceWorker.controller &&
          sessionStorage.getItem(limpiezaKey) !== "1"
        ) {
          sessionStorage.setItem(limpiezaKey, "1");
          location.reload();
        }
        return;
      }

      const registro = await navigator.serviceWorker.register(
        `./service-worker.js?v=${SW_RUNTIME_REVISION}`,
        {
          scope: "./",
          updateViaCache: "none",
        },
      );
      registroActivo = registro;

      // Una versión que quedó esperando se activa recién al iniciar nuevamente la app.
      // Así no reemplaza archivos mientras el usuario está trabajando.
      if (!activarWorkerEnEspera(registro)) {
        await comprobarActualizacionSilenciosa(registro, true);
      }

      registro.addEventListener("updatefound", () => {
        const instalando = registro.installing;
        if (!instalando) return;
        instalando.addEventListener("statechange", () => {
          if (
            instalando.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            // La nueva versión queda en waiting y se activa en el próximo
            // inicio de la app. No recargamos mientras el usuario trabaja.
            console.debug("Nueva versión preparada para el próximo inicio.");
          }
        });
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible")
          comprobarActualizacionSilenciosa(registroActivo);
      });
      window.addEventListener("online", () =>
        comprobarActualizacionSilenciosa(registroActivo, true),
      );
    } catch (error) {
      console.error("No se pudo registrar el service worker:", error);
      if (textoInstalacion)
        textoInstalacion.textContent =
          "No se pudo preparar la instalación. Actualizá la página e intentá nuevamente.";
    }
  });
}

actualizarEstadoInstalacion();
