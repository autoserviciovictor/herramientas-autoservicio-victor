let datos = [];
let productoActual = null;
let indiceProductoActual = -1;

let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("excelFile").addEventListener("change", cargarExcel);
    document.getElementById("descargarBtn").addEventListener("click", descargarExcel);
    document.getElementById("iniciarCamaraBtn").addEventListener("click", iniciarCamara);
    document.getElementById("detenerCamaraBtn").addEventListener("click", detenerCamara);
});

function cargarExcel(e) {
    const archivo = e.target.files[0];

    if (!archivo) {
        mostrarMensaje("Seleccioná un Excel");
        return;
    }

    const lector = new FileReader();

    lector.onload = function (evento) {
        const data = new Uint8Array(evento.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const hoja = workbook.Sheets[workbook.SheetNames[0]];

        datos = XLSX.utils.sheet_to_json(hoja, {
            defval: "",
            raw: false
        });

        datos.forEach(fila => {
            if (fila["salon"] === undefined || fila["salon"] === "") fila["salon"] = 0;
            if (fila["deposito"] === undefined || fila["deposito"] === "") fila["deposito"] = 0;
            if (fila["stock"] === undefined || fila["stock"] === "") fila["stock"] = 0;
        });

        mostrarMensaje("Excel cargado correctamente. Productos: " + datos.length);
        document.getElementById("producto").innerText = "Listo para iniciar cámara";
    };

    lector.readAsArrayBuffer(archivo);
}

function buscarProductoPorCodigo(codigoBuscado) {
    if (datos.length === 0) {
        mostrarMensaje("Primero cargá el Excel");
        return;
    }

    if (!codigoBuscado || codigoBuscado.trim() === "") {
        return;
    }

    indiceProductoActual = datos.findIndex(fila => {
        return String(fila["codigo"]).trim() === String(codigoBuscado).trim();
    });

    if (indiceProductoActual === -1) {
        productoActual = null;
        document.getElementById("producto").innerText =
            "Producto no encontrado: " + codigoBuscado;

        mostrarMensaje("Producto no encontrado");
        return;
    }

    productoActual = datos[indiceProductoActual];

    const nombreProducto = productoActual["articulo"] || "Producto sin nombre";

    const salonActual = Number(productoActual["salon"] || 0);
    const depositoActual = Number(productoActual["deposito"] || 0);
    const stockActual = Number(productoActual["stock"] || 0);

    document.getElementById("producto").innerText =
        nombreProducto + "\n" +
        "Salón: " + salonActual + " | Depósito: " + depositoActual + " | Stock: " + stockActual;

    pedirCantidadYGuardar(nombreProducto);
}

function pedirCantidadYGuardar(nombreProducto) {
    const modo = document.querySelector('input[name="modo"]:checked').value;
    const ubicacion = modo === "salon" ? "Salón" : "Depósito";

    const cantidadTexto = prompt(
        "Producto: " + nombreProducto + "\n" +
        "Ubicación: " + ubicacion + "\n\n" +
        "Ingresá la cantidad:"
    );

    if (cantidadTexto === null) {
        limpiarProductoActual("Listo para escanear otro producto");
        return;
    }

    const cantidad = Number(cantidadTexto);

    if (!cantidad || cantidad <= 0) {
        mostrarMensaje("Cantidad inválida");
        limpiarProductoActual("Listo para escanear otro producto");
        return;
    }

    guardarStock(cantidad);
}

function guardarStock(cantidad) {
    if (!productoActual || indiceProductoActual === -1) {
        mostrarMensaje("Primero escaneá un producto");
        return;
    }

    const modo = document.querySelector('input[name="modo"]:checked').value;

    if (modo === "salon") {
        datos[indiceProductoActual]["salon"] =
            Number(datos[indiceProductoActual]["salon"] || 0) + cantidad;
    }

    if (modo === "deposito") {
        datos[indiceProductoActual]["deposito"] =
            Number(datos[indiceProductoActual]["deposito"] || 0) + cantidad;
    }

    datos[indiceProductoActual]["stock"] =
        Number(datos[indiceProductoActual]["salon"] || 0) +
        Number(datos[indiceProductoActual]["deposito"] || 0);

    const nombre = productoActual["articulo"] || "Producto";
    const salon = datos[indiceProductoActual]["salon"];
    const deposito = datos[indiceProductoActual]["deposito"];
    const stock = datos[indiceProductoActual]["stock"];

    document.getElementById("producto").innerText =
        "✅ Guardado correctamente\n\n" +
        nombre + "\n" +
        "Cantidad cargada: " + cantidad + "\n" +
        "Salón: " + salon + " | Depósito: " + deposito + " | Stock: " + stock + "\n\n" +
        "Listo para escanear otro producto";

    productoActual = null;
    indiceProductoActual = -1;
}

function limpiarProductoActual(texto) {
    productoActual = null;
    indiceProductoActual = -1;
    document.getElementById("producto").innerText = texto;
}

function descargarExcel() {
    if (datos.length === 0) {
        mostrarMensaje("Primero cargá el Excel");
        return;
    }

    const hojaNueva = XLSX.utils.json_to_sheet(datos);
    const libroNuevo = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(libroNuevo, hojaNueva, "Stock");

    XLSX.writeFile(libroNuevo, "stock_actualizado.xlsx");

    mostrarMensaje("Excel actualizado descargado");
}

async function iniciarCamara() {
    if (camaraActiva) {
        mostrarMensaje("La cámara ya está activa");
        return;
    }

    if (datos.length === 0) {
        mostrarMensaje("Primero cargá el Excel");
        return;
    }

    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    try {
        await lectorCodigo.decodeFromConstraints(
            {
                video: {
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    focusMode: "continuous"
                }
            },
            "video",
            (resultado, error) => {
                if (resultado) {
                    const codigo = resultado.text;
                    const ahora = Date.now();

                    if (codigo === ultimoCodigoLeido && ahora - tiempoUltimaLectura < 3000) {
                        return;
                    }

                    ultimoCodigoLeido = codigo;
                    tiempoUltimaLectura = ahora;

                    buscarProductoPorCodigo(codigo);
                }
            }
        );

        camaraActiva = true;
        mostrarMensaje("Cámara activa");

    } catch (error) {
        mostrarMensaje("No se pudo iniciar la cámara");
        console.error(error);
    }
}

function detenerCamara() {
    if (!lectorCodigo || !camaraActiva) {
        mostrarMensaje("La cámara no está activa");
        return;
    }

    lectorCodigo.reset();
    camaraActiva = false;
    document.getElementById("producto").innerText = "Cámara detenida";
}

function mostrarMensaje(texto) {
    console.log(texto);
}
