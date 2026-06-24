let datos = [];
let productoActual = null;
let indiceProductoActual = -1;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("excelFile").addEventListener("change", cargarExcel);
    document.getElementById("buscarBtn").addEventListener("click", buscarProducto);
    document.getElementById("guardarBtn").addEventListener("click", guardarStock);
    document.getElementById("descargarBtn").addEventListener("click", descargarExcel);
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

        alert("Excel cargado. Filas encontradas: " + datos.length);
        console.log(datos);
        console.log("Columnas:", Object.keys(datos[0] || {}));
    };

    lector.readAsArrayBuffer(archivo);
}

function buscarProducto() {
    alert("Buscando producto...");

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
        const valoresFila = Object.values(fila).map(v => String(v).trim());
        return valoresFila.includes(codigoBuscado);
    });

    if (indiceProductoActual === -1) {
        productoActual = null;
        document.getElementById("producto").innerText = "Producto no encontrado";
        alert("Producto no encontrado");
        return;
    }

    productoActual = datos[indiceProductoActual];

    const columnas = Object.keys(productoActual);

    let nombreProducto =
        productoActual["Producto"] ||
        productoActual["producto"] ||
        productoActual["Artículo"] ||
        productoActual["Articulo"] ||
        productoActual["articulo"] ||
        productoActual["ARTICULO"] ||
        productoActual[columnas[1]] ||
        "Producto encontrado";

    document.getElementById("producto").innerText = nombreProducto;

    alert("Producto encontrado: " + nombreProducto);
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

    if (!datos[indiceProductoActual]["Salon"]) {
        datos[indiceProductoActual]["Salon"] = 0;
    }

    if (!datos[indiceProductoActual]["Deposito"]) {
        datos[indiceProductoActual]["Deposito"] = 0;
    }

    if (modo === "salon") {
        datos[indiceProductoActual]["Salon"] =
            Number(datos[indiceProductoActual]["Salon"]) + cantidad;
    } else {
        datos[indiceProductoActual]["Deposito"] =
            Number(datos[indiceProductoActual]["Deposito"]) + cantidad;
    }

    datos[indiceProductoActual]["Stock Total"] =
        Number(datos[indiceProductoActual]["Salon"]) +
        Number(datos[indiceProductoActual]["Deposito"]);

    alert("Stock guardado");

    document.getElementById("codigo").value = "";
    document.getElementById("cantidad").value = "";
    document.getElementById("producto").innerText = "Ningún producto seleccionado";

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
