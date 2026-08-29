export const PRODUCT_LOADER_CAMERA_ERROR =
  "No se pudo iniciar la cámara. Revisá los permisos del navegador o usá el ingreso manual.";

function resolverElemento(valor) {
  if (!valor) return null;
  if (typeof valor === "string") return document.getElementById(valor);
  return valor;
}

function configurarCantidadVencimientoEditable() {
  const input = document.getElementById("vencCantidadInput");
  const form = document.getElementById("vencFormCard");
  const guardar = document.getElementById("btnVencGuardar");
  if (!input || !form || input.dataset.cantidadEditableReady === "1") return;

  input.dataset.cantidadEditableReady = "1";
  input.value = "0";

  let estabaOculto = form.classList.contains("oculto");
  const observer = new MutationObserver(() => {
    const oculto = form.classList.contains("oculto");
    if (estabaOculto && !oculto) input.value = "0";
    estabaOculto = oculto;
  });
  observer.observe(form, { attributes: true, attributeFilter: ["class"] });

  input.addEventListener(
    "input",
    (event) => {
      if (input.value === "" || input.value === "0") {
        input.setCustomValidity("");
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  guardar?.addEventListener(
    "click",
    (event) => {
      const cantidad = Number(input.value);
      if (input.value !== "" && Number.isFinite(cantidad) && cantidad > 0) {
        input.setCustomValidity("");
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      input.setCustomValidity("Ingresá una cantidad mayor a 0.");
      input.reportValidity();
      input.focus();
    },
    true,
  );
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", configurarCantidadVencimientoEditable, { once: true });
  } else {
    configurarCantidadVencimientoEditable();
  }
}

export function limpiarErrorCargaProducto(errorRef) {
  const error = resolverElemento(errorRef);
  if (!error) return;
  error.textContent = "";
  error.classList.add("oculto");
}

export function mostrarErrorCargaProducto(
  errorRef,
  mensaje = PRODUCT_LOADER_CAMERA_ERROR,
) {
  const error = resolverElemento(errorRef);
  if (!error) return;
  error.textContent = String(mensaje || PRODUCT_LOADER_CAMERA_ERROR);
  error.classList.remove("oculto");
}

export function establecerModoCargaProducto({
  inicio,
  panelManual,
  botonManual,
  error,
  modo = "scanner",
  limpiarInput,
  limpiarSugerencias,
  enfocarInput,
} = {}) {
  const inicioEl = resolverElemento(inicio);
  const panelManualEl = resolverElemento(panelManual);
  const botonManualEl = resolverElemento(botonManual);
  const manual = modo === "manual";

  limpiarErrorCargaProducto(error);
  inicioEl?.classList.remove("oculto");
  inicioEl?.classList.toggle("manual-active", manual);
  panelManualEl?.classList.toggle("oculto", !manual);

  if (botonManualEl) {
    botonManualEl.textContent = manual
      ? "Volver al escáner"
      : "Ingresar producto manual";
  }

  if (manual) {
    window.setTimeout(() => enfocarInput?.(), 40);
  } else {
    limpiarInput?.();
    limpiarSugerencias?.();
  }

  return manual;
}
