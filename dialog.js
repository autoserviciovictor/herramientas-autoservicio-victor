(function () {
  let resolutor = null;
  let ultimoFoco = null;
  const $ = (id) => document.getElementById(id);
  const FOCUSABLE_SELECTOR = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  function estaAbierto() {
    return !$("appDialogOverlay")?.classList.contains("oculto");
  }

  function elementosFoco() {
    return [...($("appDialogOverlay")?.querySelectorAll(FOCUSABLE_SELECTOR) || [])].filter(
      (elemento) => elemento.getClientRects().length > 0,
    );
  }

  function manejarTeclado(evento) {
    if (!estaAbierto()) return;
    if (evento.key === "Escape") {
      evento.preventDefault();
      cerrar(false);
      return;
    }
    if (evento.key !== "Tab") return;
    const focos = elementosFoco();
    if (!focos.length) return;
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  function cerrar(valor) {
    const overlay = $("appDialogOverlay");
    if (!overlay || overlay.classList.contains("oculto")) return;
    overlay.classList.add("oculto");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("app-dialog-open");
    document.removeEventListener("keydown", manejarTeclado);
    const resolverActual = resolutor;
    resolutor = null;
    const foco = ultimoFoco;
    ultimoFoco = null;
    resolverActual?.(valor);
    requestAnimationFrame(() => foco?.isConnected && foco.focus());
  }

  function abrir({
    titulo,
    mensaje,
    confirmarTexto = "Aceptar",
    cancelarTexto = "Cancelar",
    peligro = false,
    modo = "confirm",
    valor = "",
  }) {
    const overlay = $("appDialogOverlay");
    if (!overlay) return Promise.resolve(modo === "confirm" ? false : null);

    // Nunca quedan dos resoluciones pendientes sobre el mismo diálogo compartido.
    if (resolutor) {
      const resolverAnterior = resolutor;
      resolutor = null;
      resolverAnterior(false);
    }

    document.getElementById("toast")?.classList.remove("mostrar");
    const inputWrap = $("appDialogInputWrap");
    const input = $("appDialogInput");
    $("appDialogTitulo").textContent = titulo || "Confirmar";
    $("appDialogMensaje").textContent = mensaje || "";
    $("appDialogConfirmar").textContent = confirmarTexto;
    $("appDialogCancelar").textContent = cancelarTexto;
    $("appDialogConfirmar").classList.toggle("dialog-danger", peligro);
    $("appDialogCancelar").classList.toggle("oculto", modo === "alert");
    inputWrap?.classList.toggle("oculto", modo !== "prompt");
    if (input) input.value = valor ?? "";

    ultimoFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.classList.remove("oculto");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("app-dialog-open");
    document.removeEventListener("keydown", manejarTeclado);
    document.addEventListener("keydown", manejarTeclado);

    requestAnimationFrame(() =>
      (modo === "prompt" ? input : $("appDialogConfirmar"))?.focus(),
    );

    return new Promise((resolve) => {
      resolutor = resolve;
    });
  }

  function normalizarOpciones(opciones = {}) {
    return {
      titulo: opciones.titulo ?? opciones.title ?? "Confirmar",
      mensaje: opciones.mensaje ?? opciones.message ?? "",
      confirmarTexto:
        opciones.confirmarTexto ?? opciones.confirmText ?? "Aceptar",
      cancelarTexto:
        opciones.cancelarTexto ?? opciones.cancelText ?? "Cancelar",
      peligro: opciones.peligro ?? opciones.danger ?? false,
      valor: opciones.valor ?? opciones.value ?? "",
    };
  }

  const dialogoPublico = {
    confirm(opciones = {}) {
      return abrir({ ...normalizarOpciones(opciones), modo: "confirm" });
    },
    alert(opciones = {}) {
      return abrir({
        ...normalizarOpciones(opciones),
        modo: "alert",
        cancelarTexto: "",
      });
    },
    prompt(opciones = {}) {
      return abrir({ ...normalizarOpciones(opciones), modo: "prompt" });
    },
  };

  window.AppDialog = dialogoPublico;
  window.AutoservicioDialog = dialogoPublico;

  window.addEventListener("DOMContentLoaded", () => {
    $("appDialogConfirmar")?.addEventListener("click", () => {
      const inputVisible =
        !$("appDialogInputWrap")?.classList.contains("oculto");
      cerrar(inputVisible ? ($("appDialogInput")?.value ?? "") : true);
    });
    $("appDialogCancelar")?.addEventListener("click", () => cerrar(false));
    $("appDialogCerrar")?.addEventListener("click", () => cerrar(false));
    $("appDialogOverlay")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) cerrar(false);
    });
    $("appDialogInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        cerrar(e.currentTarget.value);
      }
    });
  });
})();
