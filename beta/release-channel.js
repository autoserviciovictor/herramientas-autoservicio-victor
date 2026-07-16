(() => {
  function isBetaPath() {
    return /\/beta(?:\/|$)/.test(window.location.pathname.replace(/\\/g, "/"));
  }

  function stableUrl() {
    return new URL("../", window.location.href).href;
  }

  function betaUrl() {
    return new URL("./beta/", window.location.href).href;
  }

  function syncForRole(role) {
    if (!role) return false;
    const admin = role === "administrador";
    const beta = isBetaPath();
    if (admin && !beta) {
      window.location.replace(betaUrl());
      return true;
    }
    if (!admin && beta) {
      window.location.replace(stableUrl());
      return true;
    }
    return false;
  }

  window.AutoservicioReleaseChannel = {
    isBetaPath,
    current: () => isBetaPath() ? "beta" : "estable",
    syncForRole
  };
})();
