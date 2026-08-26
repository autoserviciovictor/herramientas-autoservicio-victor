export const PRODUCT_LOADER_CAMERA_ERROR =
  "No se pudo iniciar la cámara. Revisá los permisos del navegador o usá el ingreso manual.";

function resolverElemento(valor) {
  if (!valor) return null;
  if (typeof valor === "string") return document.getElementById(valor);
  return valor;
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

