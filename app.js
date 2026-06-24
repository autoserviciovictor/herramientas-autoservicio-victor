let datos = [];
let productoActual = null;
let indiceProductoActual = -1;

let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("excelFile").addEventListener("change", cargarExcel);
    document.getElementById("buscarBtn").addEventListener("click", buscarProducto);
    document.getElementById("guardarBtn").addEventListener("click", guardarStock);
    document.getElementById("descargarBtn").addEventListener("click", descargarExcel);
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

function buscarProducto() {
    const codigoBuscado = document.getElementById("codigo").value.trim();

    if (datos.length === 0) {
        alert("Primero cargá el Excel");
        return;
    }

    if (codigoBuscado === "") {
        alert("Ingresá un código");
        return;
    }

    indiceProductoActual = datos.findIndex(fila => {
        return String(fila["codigo"]).trim() === codigoBuscado;
    });

    if (indiceProductoActual === -1) {
        productoActual = null;
        document.getElementById("producto").innerText = "Producto no encontrado";
        alert("Producto no encontrado: " + codigoBuscado);
        return;
    }

    productoActual = datos[indiceProductoActual];
    document.getElementById("producto").innerText = productoActual["articulo"];
    document.getElementById("cantidad").focus();
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

    alert("Stock guardado correctamente");

    document.getElementById("codigo").value = "";
    document.getElementById("cantidad").value = "";
    document.getElementById("producto").innerText = "Ningún producto seleccionado";

    productoActual = null;
    indiceProductoActual = -1;

    document.getElementById("codigo").focus();
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

function iniciarCamara() {
    if (camaraActiva) {
        alert("La cámara ya está activa");
        return;
    }

    if (datos.length === 0) {
        alert("Primero cargá el Excel");
        return;
    }

    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    lectorCodigo.decodeFromConstraints(
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

                document.getElementById("codigo").value = codigo;
                buscarProducto();
            }
        }
    ).then(() => {
        camaraActiva = true;
    }).catch(error => {
        alert("No se pudo iniciar la cámara. Aceptá el permiso o probá con otro navegador.");
        console.error(error);
    });
}

function detenerCamara() {
    if (!lectorCodigo || !camaraActiva) {
        alert("La cámara no está activa");
        return;
    }

    lectorCodigo.reset();
    camaraActiva = false;
}
