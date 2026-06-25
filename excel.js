let datos = [];
let historial = [];
let contador = 0;

export function cargarExcel(archivo) {
    return new Promise((resolve, reject) => {
        if (!archivo) {
            reject(new Error("Seleccioná un Excel"));
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

            normalizarDatos();

            historial = [];
            contador = 0;

            resolve(datos.length);
        };

        lector.onerror = function () {
            reject(new Error("No se pudo leer el archivo"));
        };

        lector.readAsArrayBuffer(archivo);
    });
}

function normalizarDatos() {
    datos.forEach(fila => {
        if (fila["codigo"] === undefined) fila["codigo"] = "";
        if (fila["articulo"] === undefined) fila["articulo"] = "";
        if (fila["salon"] === undefined || fila["salon"] === "") fila["salon"] = 0;
        if (fila["deposito"] === undefined || fila["deposito"] === "") fila["deposito"] = 0;
        if (fila["stock"] === undefined || fila["stock"] === "") fila["stock"] = 0;

        fila["salon"] = Number(fila["salon"] || 0);
        fila["deposito"] = Number(fila["deposito"] || 0);
        fila["stock"] = fila["salon"] + fila["deposito"];
    });
}

export function obtenerCantidadProductos() {
    return datos.length;
}

export function buscarProductoPorCodigo(codigoBuscado) {
    const codigoLimpio = String(codigoBuscado).trim();

    const indice = datos.findIndex(fila =>
        String(fila["codigo"]).trim() === codigoLimpio
    );

    if (indice === -1) {
        return { encontrado: false };
    }

    const fila = datos[indice];

    return {
        encontrado: true,
        producto: {
            indice,
            codigo: fila["codigo"],
            articulo: fila["articulo"] || "Producto sin nombre",
            salon: Number(fila["salon"] || 0),
            deposito: Number(fila["deposito"] || 0),
            stock: Number(fila["stock"] || 0)
        }
    };
}

export function guardarCantidadEnProducto(indice, cantidad, ubicacion) {
    const fila = datos[indice];

    const anterior = {
        indice,
        salon: Number(fila["salon"] || 0),
        deposito: Number(fila["deposito"] || 0),
        stock: Number(fila["stock"] || 0)
    };

    if (ubicacion === "salon") {
        fila["salon"] += cantidad;
    } else {
        fila["deposito"] += cantidad;
    }

    fila["stock"] = fila["salon"] + fila["deposito"];

    contador++;

    historial.unshift({
        codigo: fila["codigo"],
        articulo: fila["articulo"],
        cantidad,
        ubicacion,
        salon: fila["salon"],
        deposito: fila["deposito"],
        stock: fila["stock"],
        anterior
    });

    if (historial.length > 5) historial.pop();

    return {
        producto: {
            indice,
            codigo: fila["codigo"],
            articulo: fila["articulo"],
            salon: fila["salon"],
            deposito: fila["deposito"],
            stock: fila["stock"]
        },
        contador,
        historial
    };
}

export function deshacerUltimoMovimiento() {
    if (historial.length === 0) return null;

    const ultimo = historial.shift();
    const anterior = ultimo.anterior;

    datos[anterior.indice]["salon"] = anterior.salon;
    datos[anterior.indice]["deposito"] = anterior.deposito;
    datos[anterior.indice]["stock"] = anterior.stock;

    if (contador > 0) contador--;

    return { contador, historial };
}

export function descargarExcel() {
    if (datos.length === 0) {
        throw new Error("Primero cargá el Excel");
    }

    const hojaNueva = XLSX.utils.json_to_sheet(datos);
    const libroNuevo = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(libroNuevo, hojaNueva, "Stock");
    XLSX.writeFile(libroNuevo, "stock_actualizado.xlsx");
}
