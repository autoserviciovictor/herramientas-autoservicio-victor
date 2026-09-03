export const PRODUCT_LOADER_CAMERA_ERROR =
  "No se pudo iniciar la cámara. Revisá los permisos del navegador o usá el ingreso manual.";

function resolverElemento(valor) {
  if (!valor) return null;
  if (typeof valor === "string") return document.getElementById(valor);
  return valor;
}

function configurarCantidadVencimientoEditable() {
  const salon = document.getElementById("vencSalonInput");
  const deposito = document.getElementById("vencDepositoInput");
  const form = document.getElementById("vencFormCard");
  const guardar = document.getElementById("btnVencGuardar");
  const inputs = [salon, deposito].filter(Boolean);
  if (!inputs.length || !form || form.dataset.stockUbicacionesReady === "1") return;

  form.dataset.stockUbicacionesReady = "1";
  inputs.forEach((input) => { input.value = "0"; });

  let estabaOculto = form.classList.contains("oculto");
  const observer = new MutationObserver(() => {
    const oculto = form.classList.contains("oculto");
    if (estabaOculto && !oculto) inputs.forEach((input) => { input.value = "0"; });
    estabaOculto = oculto;
  });
  observer.observe(form, { attributes: true, attributeFilter: ["class"] });

  inputs.forEach((input) => {
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
  });

  guardar?.addEventListener(
    "click",
    (event) => {
      const valores = inputs.map((input) => Number(input.value));
      const validos = valores.every((valor) => Number.isInteger(valor) && valor >= 0);
      const total = validos ? valores.reduce((suma, valor) => suma + valor, 0) : 0;
      if (validos && total > 0) {
        inputs.forEach((input) => input.setCustomValidity(""));
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const foco = inputs.find((input) => input.value === "" || Number(input.value) < 0) || inputs[0];
      foco.setCustomValidity("Ingresá stock en salón o depósito. El total debe ser mayor a 0.");
      foco.reportValidity();
      foco.focus();
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
