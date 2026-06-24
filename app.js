let datos = [];
let productoActual = null;
let indiceProductoActual = -1;

let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("excelFile").addEventListener("change", cargarExcel);
    document.getElementById("buscarBtn").addEventListener("click", buscarProductoManual);
    document.getElementById("guardarBtn").addEventListener("click", guardarStock);
    document.getElementById("descargarBtn").addEventListener("click", descargarExcel);
    document.getElementById("cargarCamarasBtn").addEventListener("click", cargarCamaras);
    document.getElementById("iniciarCamaraBtn").addEventListener("click", iniciarCamara);
    document.getElementById("detenerCamaraBtn").addEventListener("click", detenerCamara);
});

function cargarExcel(e) {
    const archivo = e.target.files[0];

    if (!archivo) {
        alert("Seleccioná un Excel");
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

        alert("Excel cargado correctamente. Productos cargados: " + datos.length);
    };

    lector.readAsArrayBuffer(archivo);
}

function buscarProductoManual() {
    const codigo = document.getElementById("codigo").value.trim();
    buscarProductoPorCodigo(codigo, false);
}

function buscarProductoPorCodigo(codigoBuscado, pedirCantidadAutomatico = true) {
    if (datos.length === 0) {
        alert("Primero cargá el Excel");
        return;
    }

    if (codigoBuscado === "") {
        alert("Ingresá un código");
        return;
    }

    indiceProductoActual = datos.findIndex(fila => {
        return String(fila["codigo"]).trim() === String(codigoBuscado).trim();
    });

    if (indiceProductoActual === -1) {
        productoActual = null;
        document.getElementById("producto").innerText = "Producto no encontrado";
        alert("Producto no encontrado: " + codigoBuscado);
        return;
    }

    productoActual = datos[indiceProductoActual];

    const nombreProducto = productoActual["articulo"] || "Producto sin nombre";

    document.getElementById("codigo").value = codigoBuscado;
    document.getElementById("producto").innerText = nombreProducto;

    if (pedirCantidadAutomatico) {
        setTimeout(() => {
            pedirCantidadYGuardar(nombreProducto);
        }, 300);
    } else {
        document.getElementById("cantidad").focus();
    }
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
        limpiarProductoActual();
        return;
    }

    const cantidad = Number(cantidadTexto);

    if (!cantidad || cantidad <= 0) {
        alert("Cantidad inválida");
        limpiarProductoActual();
        return;
    }

    document.getElementById("cantidad").value = cantidad;
    guardarStock();
}

function guardarStock() {
    if (!productoActual || indiceProductoActual === -1) {
        alert("Primero buscá un producto");
        return;
    }

    const cantidad = Number(document.getElementById("cantidad").value);

    if (!cantidad || cantidad <= 0) {
        alert("Ingresá una cantidad válida");
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

    alert("Guardado: " + cantidad + " unidades");

    limpiarProductoActual();
}

function limpiarProductoActual() {
    document.getElementById("codigo").value = "";
    document.getElementById("cantidad").value = "";
    document.getElementById("producto").innerText = "Listo para escanear otro producto";

    productoActual = null;
    indiceProductoActual = -1;
}

function descargarExcel() {
    if (datos.length === 0) {
        alert("Primero cargá el Excel");
        return;
    }

    const hojaNueva = XLSX.utils.json_to_sheet(datos);
    const libroNuevo = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(libroNuevo, hojaNueva, "Stock");

    XLSX.writeFile(libroNuevo, "stock_actualizado.xlsx");
}

async function cargarCamaras() {
    try {
        lectorCodigo = new ZXing.BrowserMultiFormatReader();

        const dispositivos = await lectorCodigo.listVideoInputDevices();
        const lista = document.getElementById("listaCamaras");

        lista.innerHTML = "";

        if (dispositivos.length === 0) {
            lista.innerHTML = '<option value="">No se encontraron cámaras</option>';
            alert("No se encontraron cámaras");
            return;
        }

        dispositivos.forEach((camara, index) => {
            const opcion = document.createElement("option");
            opcion.value = camara.deviceId;
            opcion.text = camara.label || "Cámara " + (index + 1);

            const nombre = opcion.text.toLowerCase();

            if (
                nombre.includes("back") ||
                nombre.includes("rear") ||
                nombre.includes("environment") ||
                nombre.includes("trasera")
            ) {
                opcion.selected = true;
            }

            lista.appendChild(opcion);
        });

        alert("Cámaras cargadas. Probá seleccionar la cámara trasera o macro si aparece.");
    } catch (error) {
        alert("No se pudieron cargar las cámaras. Permití el acceso a la cámara.");
        console.error(error);
    }
}

async function iniciarCamara() {
    if (camaraActiva) {
        alert("La cámara ya está activa");
        return;
    }

    if (datos.length === 0) {
        alert("Primero cargá el Excel");
        return;
    }

    const lista = document.getElementById("listaCamaras");
    const deviceId = lista.value;

    if (!deviceId) {
        alert("Primero tocá 'Cargar cámaras' y elegí una cámara");
        return;
    }

    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    try {
        await lectorCodigo.decodeFromVideoDevice(
            deviceId,
            "video",
            (resultado, error) => {
                if (resultado) {
                    const codigo = resultado.text;
                    const ahora = Date.now();

                    if (codigo === ultimoCodigoLeido && ahora - tiempoUltimaLectura < 2500) {
                        return;
                    }

                    ultimoCodigoLeido = codigo;
                    tiempoUltimaLectura = ahora;

                    buscarProductoPorCodigo(codigo, true);
                }
            }
        );

        camaraActiva = true;
    } catch (error) {
        alert("No se pudo iniciar la cámara. Probá elegir otra cámara.");
        console.error(error);
    }
}

function detenerCamara() {
    if (!lectorCodigo || !camaraActiva) {
        alert("La cámara no está activa");
        return;
    }

    lectorCodigo.reset();
    camaraActiva = false;
}
