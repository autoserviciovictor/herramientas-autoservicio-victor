const $ = (id) => document.getElementById(id);
const THEME_KEY = "autoservicio-app-theme";
const SETTINGS_TEXT_SIZE_KEY = "autoservicio-settings-text-size";
const SETTINGS_SOUND_KEY = "autoservicio-settings-sound";
const SETTINGS_VIBRATION_KEY = "autoservicio-settings-vibration";
const SETTINGS_LAST_SYNC_KEY = "autoservicio-settings-last-sync";

function preferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.body.classList.toggle("pro-dark", dark);
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  document
    .querySelectorAll(".pro-theme-label")
    .forEach((el) => (el.textContent = dark ? "Modo claro" : "Modo oscuro"));
  document
    .querySelectorAll(".pro-theme-icon use")
    .forEach((use) =>
      use.setAttribute("href", dark ? "#icon-sun" : "#icon-moon"),
    );
  const headerTheme = $("proHeaderThemeToggle");
  if (headerTheme) {
    const nextLabel = dark ? "Activar modo claro" : "Activar modo oscuro";
    headerTheme.setAttribute("aria-label", nextLabel);
    headerTheme.setAttribute("title", dark ? "Modo claro" : "Modo oscuro");
  }
  document
    .querySelectorAll(".pro-switch")
    .forEach((el) => el.classList.toggle("activo", dark));
  const settingsTheme = $("settingsThemeSelect");
  if (settingsTheme && settingsTheme.value !== (dark ? "dark" : "light"))
    settingsTheme.value = dark ? "dark" : "light";
  syncSettingsSelectControl(settingsTheme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#09111f" : "#ffffff";
}

function toggleTheme() {
  applyTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  );
}

let drawerScrollY = 0;
let drawerBloqueado = false;

function bloquearScrollDrawer() {
  if (drawerBloqueado || window.innerWidth > 900) return;
  drawerScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  drawerBloqueado = true;
  document.documentElement.classList.add("pro-drawer-open");
  document.body.classList.add("pro-drawer-open");
  document.body.style.top = `-${drawerScrollY}px`;
}

function liberarScrollDrawer() {
  if (!drawerBloqueado) return;
  drawerBloqueado = false;
  document.documentElement.classList.remove("pro-drawer-open");
  document.body.classList.remove("pro-drawer-open");
  document.body.style.top = "";
  window.scrollTo({ top: drawerScrollY, behavior: "auto" });
}

function syncDrawerState() {
  const drawer = $("userDropdown");
  if (!drawer) return;
  const abierto = !drawer.classList.contains("oculto");
  if (abierto) bloquearScrollDrawer();
  else liberarScrollDrawer();
}

function closeDrawer() {
  const drawer = $("userDropdown");
  drawer?.classList.add("oculto");
  drawer?.setAttribute("aria-hidden", "true");
  $("brandMenuBtn")?.setAttribute("aria-expanded", "false");
  syncDrawerState();
}

function currentModule() {
  const screen = document.body.dataset.screen || "inicio";
  if (
    ["productos", "cargados", "editarProducto", "inventario"].includes(screen)
  )
    return "inventario";
  // Configuración es una vista propia de cuenta/sistema y no pertenece
  // visualmente a ningún módulo del menú lateral.
  if (screen === "ajustes") return "ajustes";
  return screen;
}

function syncNavigation() {
  const current = currentModule();
  document.querySelectorAll("[data-pro-nav]").forEach((btn) => {
    const active = btn.dataset.proNav === current;
    btn.classList.toggle("activo", active);
    btn.setAttribute("aria-current", active ? "page" : "false");
  });
}

function syncContextualFabs() {
  const modulo = currentModule();
  const permitido = {
    inventario: "inventarioFab",
    vencimientos: "vencimientosFab",
    anotar: "repoFab",
    precios: "preciosFab",
  }[modulo] || "";

  ["inventarioFab", "vencimientosFab", "repoFab", "preciosFab"].forEach(
    (id) => {
      const fab = $(id);
      if (!fab) return;

      // La visibilidad del FAB activo la controla cada módulo. Acá sólo
      // ocultamos los FAB que no pertenecen a la pantalla actual. Evitamos
      // escribir pointer-events inline porque podía quedar heredado en
      // "none" y bloquear un botón visualmente visible al cambiar de módulo.
      fab.style.removeProperty("pointer-events");
      if (id !== permitido) fab.classList.add("oculto");
    },
  );
}

function roleLabel(role = "") {
  return {
    administrador: "Administrador del sistema",
    administracion: "Administración",
    supervisor: "Supervisor",
    personal: "Personal",
  }[role] || "Personal";
}

function initialsFor(name = "") {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase() || "AV";
}

function syncUser() {
  const user = window.AutoservicioAuth?.getUsuario?.();
  if (!user) return;
  const name = user.nombre || user.usuario || "Usuario";
  const role = user.rol || "personal";
  const initials = initialsFor(name);
  const welcome = $("proWelcomeName");
  if (welcome) welcome.textContent = name.split(/\s+/)[0];
  document.querySelectorAll(".pro-user-avatar").forEach((el) => {
    el.textContent = initials;
  });

  if ($("settingsProfileAvatar")) $("settingsProfileAvatar").textContent = initials.slice(0, 1);
  if ($("settingsProfileName")) $("settingsProfileName").textContent = name;
  if ($("settingsProfileRole")) $("settingsProfileRole").textContent = roleLabel(role);
  if ($("settingsProfileAccount")) {
    const account = user.usuario ? `@${user.usuario}` : "Cuenta de usuario";
    $("settingsProfileAccount").textContent = account;
  }

  const adminVisible = role === "administrador";
  document
    .querySelectorAll(".pro-admin-nav-label,.pro-admin-nav")
    .forEach((el) => el.classList.toggle("oculto", !adminVisible));
}


function dialogAlert(title, message) {
  return window.AutoservicioDialog?.alert?.({ title, message }) || Promise.resolve();
}

async function openAdminTab(tab) {
  if (!window.AutoservicioAuth?.esAdmin?.()) {
    await dialogAlert(
      "Acceso administrado",
      "Esta acción se gestiona desde Administración. Pedile a un administrador que realice el cambio.",
    );
    return false;
  }
  await window.AutoservicioNavigate?.("admin");
  await window.AdminModule?.abrirTab?.(tab);
  return true;
}

function openUserSettings() {
  closeDrawer();
  window.AutoservicioNavigate?.("ajustes");
  requestAnimationFrame(() => $("userSettingsTitle")?.focus?.());
}

function syncSettingsSelectControl(select) {
  if (!select) return;
  const root = document.querySelector(`[data-settings-select="${select.id}"]`);
  if (!root) return;
  const selected = select.options?.[select.selectedIndex] || null;
  const value = selected?.value ?? select.value;
  const label = selected?.textContent?.trim() || value;
  const valueNode = root.querySelector("[data-settings-select-value]");
  if (valueNode) valueNode.textContent = label;
  root.querySelectorAll('[role="option"][data-value]').forEach((option) => {
    option.setAttribute("aria-selected", option.dataset.value === value ? "true" : "false");
  });
}

function closeSettingsSelects(except = null) {
  document.querySelectorAll(".user-settings-modern-select.is-open").forEach((root) => {
    if (root === except) return;
    root.classList.remove("is-open");
    const trigger = root.querySelector(".user-settings-select-trigger");
    const menu = root.querySelector(".user-settings-select-menu");
    trigger?.setAttribute("aria-expanded", "false");
    if (menu) menu.hidden = true;
  });
}

function openSettingsSelect(root, focusSelected = false) {
  if (!root) return;
  closeSettingsSelects(root);
  const trigger = root.querySelector(".user-settings-select-trigger");
  const menu = root.querySelector(".user-settings-select-menu");
  if (!trigger || !menu) return;
  root.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
  menu.hidden = false;
  if (focusSelected) {
    const selected = menu.querySelector('[role="option"][aria-selected="true"]');
    (selected || menu.querySelector('[role="option"]'))?.focus();
  }
}

function initSettingsModernSelects() {
  document.querySelectorAll(".user-settings-modern-select[data-settings-select]").forEach((root) => {
    if (root.dataset.enhanced === "1") return;
    const select = $(root.dataset.settingsSelect);
    const trigger = root.querySelector(".user-settings-select-trigger");
    const menu = root.querySelector(".user-settings-select-menu");
    if (!select || !trigger || !menu) return;
    root.dataset.enhanced = "1";
    syncSettingsSelectControl(select);

    trigger.addEventListener("click", () => {
      if (root.classList.contains("is-open")) closeSettingsSelects();
      else openSettingsSelect(root, false);
    });
    trigger.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      openSettingsSelect(root, true);
    });

    menu.addEventListener("click", (event) => {
      const option = event.target.closest('[role="option"][data-value]');
      if (!option) return;
      select.value = option.dataset.value;
      syncSettingsSelectControl(select);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeSettingsSelects();
      trigger.focus();
    });

    menu.addEventListener("keydown", (event) => {
      const options = [...menu.querySelectorAll('[role="option"]')];
      const current = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettingsSelects();
        trigger.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let next = current;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % options.length;
      else next = current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length;
      options[next]?.focus();
    });
  });

  if (!document.documentElement.dataset.settingsSelectGlobalHandlers) {
    document.documentElement.dataset.settingsSelectGlobalHandlers = "1";
    document.addEventListener("pointerdown", (event) => {
      if (!event.target.closest(".user-settings-modern-select")) closeSettingsSelects();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const open = document.querySelector(".user-settings-modern-select.is-open");
      if (!open) return;
      const trigger = open.querySelector(".user-settings-select-trigger");
      closeSettingsSelects();
      trigger?.focus();
    });
  }
}

function applyTextSize(value = "medium") {
  const normalized = ["small", "medium", "large"].includes(value)
    ? value
    : "medium";
  document.documentElement.dataset.textSize = normalized;
  localStorage.setItem(SETTINGS_TEXT_SIZE_KEY, normalized);
  const select = $("settingsTextSizeSelect");
  if (select && select.value !== normalized) select.value = normalized;
  syncSettingsSelectControl(select);
}

function restoreFeedbackPreferences() {
  const sound = $("checkSonidos");
  const vibration = $("checkVibracion");
  if (sound) {
    const stored = localStorage.getItem(SETTINGS_SOUND_KEY);
    if (stored !== null) sound.checked = stored !== "0";
    sound.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (vibration) {
    const stored = localStorage.getItem(SETTINGS_VIBRATION_KEY);
    if (stored !== null) vibration.checked = stored !== "0";
    vibration.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function formatLastSync(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "Sin registro reciente";
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${sameDay ? "Hoy" : new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date)}, ${time}`;
}

function syncLastSyncLabel() {
  if ($("settingsLastSync"))
    $("settingsLastSync").textContent = formatLastSync(localStorage.getItem(SETTINGS_LAST_SYNC_KEY));
}

function syncNotificationSettings() {
  const button = $("btnActivarNotificaciones");
  const expiry = $("settingsExpiryAlertsStatus");
  const supported = "Notification" in window;
  const permission = supported ? Notification.permission : "unsupported";
  const pushState = button?.dataset?.pushState || "";
  const on = permission === "granted" && pushState === "active";
  button?.classList.toggle("is-on", on);
  button?.classList.toggle("is-blocked", permission === "denied");
  if (button) {
    button.setAttribute(
      "aria-label",
      on
        ? "Notificaciones activadas"
        : permission === "denied"
          ? "Notificaciones bloqueadas por el navegador"
          : "Activar notificaciones",
    );
  }
  expiry?.classList.toggle("is-on", on);
  expiry?.classList.toggle("is-disabled", !on);
}

async function resetUserPreferences() {
  const confirmed = await (window.AutoservicioDialog?.confirm?.({
    title: "Restablecer preferencias",
    message: "Se restaurarán el tema, el tamaño de texto, el sonido y la vibración a sus valores predeterminados.",
    confirmText: "Restablecer",
  }) ?? Promise.resolve(false));
  if (!confirmed) return;

  localStorage.removeItem(THEME_KEY);
  localStorage.removeItem(SETTINGS_TEXT_SIZE_KEY);
  localStorage.removeItem(SETTINGS_SOUND_KEY);
  localStorage.removeItem(SETTINGS_VIBRATION_KEY);

  applyTheme("light");
  applyTextSize("medium");
  if ($("checkSonidos")) $("checkSonidos").checked = true;
  if ($("checkVibracion")) $("checkVibracion").checked = true;
  $("checkSonidos")?.dispatchEvent(new Event("change", { bubbles: true }));
  $("checkVibracion")?.dispatchEvent(new Event("change", { bubbles: true }));
}

function initUserSettings() {
  $("btnMobileUserSettings")?.addEventListener("click", openUserSettings);
  $("btnDesktopUserSettings")?.addEventListener("click", openUserSettings);
  initSettingsModernSelects();

  const themeSelect = $("settingsThemeSelect");
  if (themeSelect) {
    themeSelect.value = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
  }

  syncSettingsSelectControl($("settingsLanguageSelect"));

  const size = localStorage.getItem(SETTINGS_TEXT_SIZE_KEY) || "medium";
  applyTextSize(size);
  $("settingsTextSizeSelect")?.addEventListener("change", (event) =>
    applyTextSize(event.currentTarget.value),
  );

  restoreFeedbackPreferences();
  $("checkSonidos")?.addEventListener("change", (event) =>
    localStorage.setItem(SETTINGS_SOUND_KEY, event.currentTarget.checked ? "1" : "0"),
  );
  $("checkVibracion")?.addEventListener("change", (event) =>
    localStorage.setItem(SETTINGS_VIBRATION_KEY, event.currentTarget.checked ? "1" : "0"),
  );

  $("settingsOpenNotifications")?.addEventListener("click", () =>
    $("btnMenuNotificaciones")?.click(),
  );
  const notificationButton = $("btnActivarNotificaciones");
  if (notificationButton) {
    new MutationObserver(syncNotificationSettings).observe(notificationButton, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "class"],
    });
  }
  syncNotificationSettings();

  $("settingsEditProfile")?.addEventListener("click", () => openAdminTab("usuarios"));
  $("settingsPasswordAction")?.addEventListener("click", () => openAdminTab("usuarios"));
  $("settingsQuickPassword")?.addEventListener("click", () => openAdminTab("usuarios"));
  $("settingsBackupAction")?.addEventListener("click", () => openAdminTab("sistema"));

  $("settingsPinAction")?.addEventListener("click", () =>
    dialogAlert(
      "Bloqueo con PIN",
      "El acceso de la app ya está protegido por la sesión de usuario. La configuración de un PIN adicional todavía no está habilitada en el servidor.",
    ),
  );
  $("settingsSessionsAction")?.addEventListener("click", () =>
    dialogAlert(
      "Sesiones activas",
      "Por seguridad, el cierre remoto de otras sesiones se realiza actualmente al cambiar la contraseña desde Administración.",
    ),
  );

  $("settingsResetPreferences")?.addEventListener("click", resetUserPreferences);
  $("settingsQuickLogout")?.addEventListener("click", () => window.AutoservicioCerrarSesion?.());

  syncLastSyncLabel();
  window.addEventListener("autoservicio:sincronizado", () => {
    localStorage.setItem(SETTINGS_LAST_SYNC_KEY, String(Date.now()));
    syncLastSyncLabel();
  });
  window.addEventListener("focus", syncNotificationSettings);
}

function modalVisibleSuperior() {
  const visibles = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(
    (dialogo) => {
      if (!dialogo.isConnected || dialogo.getClientRects().length === 0)
        return false;
      const contenedorOculto = dialogo.closest('[aria-hidden="true"], .oculto');
      return !contenedorOculto;
    },
  );
  return visibles.at(-1) || null;
}

function mantenerFocoEnModal(event) {
  if (event.key !== "Tab") return;
  const dialogo = modalVisibleSuperior();
  if (!dialogo) return;
  const focos = [...dialogo.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((el) => el.getClientRects().length > 0);
  if (!focos.length) {
    event.preventDefault();
    dialogo.setAttribute("tabindex", "-1");
    dialogo.focus();
    return;
  }
  const primero = focos[0];
  const ultimo = focos.at(-1);
  if (event.shiftKey && (document.activeElement === primero || !dialogo.contains(document.activeElement))) {
    event.preventDefault();
    ultimo.focus();
  } else if (!event.shiftKey && document.activeElement === ultimo) {
    event.preventDefault();
    primero.focus();
  }
}


function portalizarFlujosProducto() {
  const selectores = [
    ".product-loader-modal",
    "#repoFab",
    "#repoMobileLoadMenu",
    "#repoEscribirModal",
    "#repoEditarProductoModal",
    "#repoNuevaListaModal",
  ].join(",");

  document.querySelectorAll(selectores).forEach((elemento) => {
    if (elemento.parentElement !== document.body) document.body.appendChild(elemento);
  });
}

function bridgeNotifications() {
  $("proHeaderNotifications")?.addEventListener("click", () =>
    $("btnMenuNotificaciones")?.click(),
  );
  const source = $("menuNotificacionesBadge");
  const target = $("proHeaderNotificationBadge");
  if (!source || !target) return;
  const sync = () => {
    const raw = String(source.textContent || "").trim();
    const match = raw.match(/\d+/);
    const count = match ? Number(match[0]) : 0;

    target.textContent = count > 99 ? "99+" : String(count);
    target.dataset.digits = count > 99 ? "3" : String(count).length;
    target.classList.toggle(
      "oculto",
      source.classList.contains("oculto") ||
        !Number.isFinite(count) ||
        count <= 0,
    );
  };
  new MutationObserver(sync).observe(source, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  sync();
}

function init() {
  applyTheme(preferredTheme());
  portalizarFlujosProducto();

  const drawer = $("userDropdown");
  if (drawer) {
    new MutationObserver(syncDrawerState).observe(drawer, {
      attributes: true,
      attributeFilter: ["class", "aria-hidden"],
    });
    syncDrawerState();
  }
  $("proHeaderThemeToggle")?.addEventListener("click", toggleTheme);
  initUserSettings();
  document
    .querySelector(".pro-drawer-close")
    ?.addEventListener("click", closeDrawer);
  document
    .querySelectorAll(".pro-global-nav[data-modulo]")
    .forEach((btn) =>
      btn.addEventListener("click", () => setTimeout(closeDrawer, 0)),
    );
  bridgeNotifications();
  document.addEventListener("keydown", mantenerFocoEnModal);
  syncNavigation();
  syncContextualFabs();
  syncUser();
  new MutationObserver(() => {
    syncNavigation();
    syncContextualFabs();
    syncUser();
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "data-screen"],
  });
  window.addEventListener("autoservicio:sesion", syncUser);
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) liberarScrollDrawer();
    else syncDrawerState();
  });
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", init);
else init();
