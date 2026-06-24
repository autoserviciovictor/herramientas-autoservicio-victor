let workbook;
let worksheet;
let datos = [];
let productoActual = null;
let indiceProductoActual = -1;

document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("excelFile").addEventListener("change", cargarExcel);
    document.getElementById("buscarBtn").addEventListener("click", buscarProducto);
    document.getElementById("guardarBtn").addEventListener("click", guardarStock);
    document.getElementById("descargarBtn").addEventListener("click", descargarExcel);
});

function cargarExcel(e) {
    alert("Cargando Excel...");

    const archivo = e.target.files[0];

    if (!archivo) {
        alert("Seleccioná un archivo Excel.");
        return;
    }

    const lector = new FileReader();

    lector.onload = function (evento) {
        const data = new Uint8Array(evento.target.result);
        workbook = XLSX.read(data, { type: "array" });

        const primeraHoja = workbook.SheetNames[0];
        worksheet = workbook.Sheets[primeraHoja];

        datos = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        prepararColumnas();

        alert("Excel cargado correctamente. Productos cargados: " + datos.length);
        console.log(datos);
    };

    lector.readAsArrayBuffer(archivo);
}

function prepararColumnas() {
    datos.forEach(fila => {
        if (fila["Salon"] === undefined) fila["Salon"] = 0;
        if (fila["Deposito"] === undefined) fila["Deposito"] = 0;
        if (fila["Stock Total"] === undefined) fila["Stock Total"] = 0;
    });
}

function buscarProducto() {
    alert("Botón buscar funcionando");

    if (datos.length === 0) {
        alert("Primero cargá el Excel.");
        return;
    }

    const codigoIngresado = document.getElementById("codigo").value.trim();

    if (codigoIngresado === "") {
        alert("Ingresá o escaneá un código de barras.");
        return;
    }

    indiceProductoActual = datos.findIndex(fila => {
        return String(fila["Código de barras"]).trim() === codigoIngresado ||
               String(fila["Codigo de barras"]).trim() === codigoIngresado ||
               String(fila["codigo de barras"]).trim() === codigoIngresado ||
               String(fila["CODIGO"]).trim() === codigoIngresado ||
               String(fila["Codigo"]).trim() === codigoIngresado ||
               String(fila["codigo"]).trim() === codigoIngresado;
    });

    if (indiceProductoActual === -1) {
        productoActual = null;
        document.getElementById("producto").innerText = "Producto no encontrado";
        alert("No se encontró el producto con ese código.");
        return;
    }

    productoActual = datos[indiceProductoActual];

    const nombre =
        productoActual["Producto"] ||
        productoActual["producto"] ||
        productoActual["Articulo"] ||
        productoActual["Artículo"] ||
        productoActual["articulo"] ||
        "Sin nombre";

    document.getElementById("producto").innerText = nombre;
    document.getElementById("cantidad").focus();
}

function guardarStock() {
    if (!productoActual || indiceProductoActual === -1) {
        alert("Primero buscá un producto.");
        return;
    }

    const cantidad = Number(document.getElementById("cantidad").value);

    if (!cantidad || cantidad <= 0) {
        alert("Ingresá una cantidad válida.");
        return;
    }

    const modo = document.querySelector('input[name="modo"]:checked').value;

    if (modo === "salon") {
        datos[indiceProductoActual]["Salon"] =
            Number(datos[indiceProductoActual]["Salon"] || 0) + cantidad;
    }

    if (modo === "deposito") {
        datos[indiceProductoActual]["Deposito"] =
            Number(datos[indiceProductoActual]["Deposito"] || 0) + cantidad;
    }

    datos[indiceProductoActual]["Stock Total"] =
        Number(datos[indiceProductoActual]["Salon"] || 0) +
        Number(datos[indiceProductoActual]["Deposito"] || 0);

    alert("Stock guardado correctamente.");

    document.getElementById("codigo").value = "";
    document.getElementById("cantidad").value = "";
    document.getElementById("producto").innerText = "Ningún producto seleccionado";

    productoActual = null;
    indiceProductoActual = -1;

    document.getElementById("codigo").focus();
}

function descargarExcel() {
    if (datos.length === 0) {
        alert("Primero cargá el Excel.");
        return;
    }

    const nuevaHoja = XLSX.utils.json_to_sheet(datos);
    const nuevoLibro = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(nuevoLibro, nuevaHoja, "Stock");

    XLSX.writeFile(nuevoLibro, "stock_actualizado.xlsx");
}
