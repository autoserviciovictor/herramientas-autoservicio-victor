(() => {
  const PREF_KEY = "autoservicio_release_channel";
  const DISMISSED_KEY = "autoservicio_beta_descartada";
  let checking = false;
  let lastRole = "";

  function isBetaPath() {
    return /\/beta(?:\/|$)/.test(location.pathname.replace(/\\/g, "/"));
  }

  function appRootUrl() {
    const path = location.pathname.replace(/\\/g, "/");
    const marker = "/beta/";
    const index = path.indexOf(marker);
    const rootPath = index >= 0 ? path.slice(0, index + 1) : path.replace(/[^/]*$/, "");
    return new URL(rootPath, location.origin).href;
  }

  function stableUrl() { return appRootUrl(); }
  function betaUrl() { return new URL("beta/", appRootUrl()).href; }
  function selectedChannel() { return localStorage.getItem(PREF_KEY) === "beta" ? "beta" : "estable"; }

  async function readJson(url) {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function betaAvailable() {
    const [stable, beta] = await Promise.all([
      readJson(new URL("version.json", appRootUrl()).href),
      readJson(new URL("beta/version.json", appRootUrl()).href)
    ]);
    return { available: Number(beta.build || 0) > Number(stable.build || 0), stable, beta };
  }

  async function offerBeta() {
    if (checking || isBetaPath() || lastRole !== "administrador") return;
    checking = true;
    try {
      const info = await betaAvailable();
      if (!info.available) return;
      const betaId = String(info.beta.build || info.beta.version || "beta");
      if (localStorage.getItem(DISMISSED_KEY) === betaId) return;
      const accepted = await window.AppDialog?.confirm?.({
        titulo: "Nueva versión beta disponible",
        mensaje: `Está disponible ${info.beta.label || info.beta.version}. ¿Querés actualizar este dispositivo para probarla?`,
        confirmarTexto: "Actualizar a beta",
        cancelarTexto: "Ahora no"
      });
      if (accepted) {
        localStorage.setItem(PREF_KEY, "beta");
        localStorage.removeItem(DISMISSED_KEY);
        location.replace(betaUrl());
      } else {
        localStorage.setItem(DISMISSED_KEY, betaId);
      }
    } catch (error) {
      console.debug("No se pudo comprobar la versión beta:", error?.message || error);
    } finally {
      checking = false;
    }
  }

  function syncForRole(role) {
    lastRole = role || "";
    if (!role) return false;
    const admin = role === "administrador";
    if (!admin && isBetaPath()) {
      localStorage.setItem(PREF_KEY, "estable");
      location.replace(stableUrl());
      return true;
    }
    if (admin && selectedChannel() === "beta" && !isBetaPath()) {
      location.replace(betaUrl());
      return true;
    }
    if (admin && !isBetaPath()) setTimeout(offerBeta, 250);
    return false;
  }

  function returnToStable() {
    localStorage.setItem(PREF_KEY, "estable");
    localStorage.removeItem(DISMISSED_KEY);
    location.replace(stableUrl());
  }

  window.AutoservicioReleaseChannel = {
    isBetaPath,
    current: () => isBetaPath() ? "beta" : "estable",
    selected: selectedChannel,
    syncForRole,
    checkBeta: offerBeta,
    returnToStable,
    stableUrl,
    betaUrl
  };

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("btnVolverVersionEstable");
    const card = document.getElementById("adminReleaseChannelCard");
    if (card) card.classList.toggle("oculto", !isBetaPath());
    button?.addEventListener("click", async () => {
      const confirmed = await window.AppDialog?.confirm?.({
        titulo: "Volver a la versión estable",
        mensaje: "Este dispositivo dejará la versión beta y volverá a abrir la aplicación estable.",
        confirmarTexto: "Volver a estable",
        cancelarTexto: "Cancelar"
      });
      if (confirmed) returnToStable();
    });
  });
})();
