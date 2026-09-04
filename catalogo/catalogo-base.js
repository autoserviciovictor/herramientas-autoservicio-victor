import { API_BASE_URL } from "../config.js?v=1960-d21-cierre-etapa6-010926";

const estado = document.getElementById("catalogo-status");

async function cargarEstadoCatalogo() {
  try {
    const respuesta = await fetch(`${API_BASE_URL}/catalogo/api/estado`, {
      headers: { Accept: "application/json" },
    });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const datos = await respuesta.json();
    if (!datos?.ok) throw new Error("Respuesta inválida");

    estado.dataset.ok = "true";
    estado.textContent = `Base lista · ${datos.productosMaestros.toLocaleString("es-AR")} productos detectados`;
  } catch (error) {
    console.error("No se pudo consultar la base del catálogo:", error);
    estado.dataset.ok = "false";
    estado.textContent = "Catálogo temporalmente no disponible";
  }
}

cargarEstadoCatalogo();
