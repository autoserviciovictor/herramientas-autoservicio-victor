let datos = [];
let historial = [];
let contador = 0;

export function cargarExcel(archivo) {
    return new Promise((resolve, reject) => {

        if (!archivo) {
            reject(new Error("Seleccioná un archivo Excel"));
            return;
        }

        const lector = new FileReader();

        lector.onload = function (evento) {

            const data = new Uint8Array(evento.target.result);

            const workbook = XLSX.read(data, {
                type: "array"
            });

            const hoja = workbook.Sheets[workbook.SheetNames[0]];

            datos = XLSX.utils.sheet_to_json(hoja, {
                defval: "",
                raw: false
            });

            datos.forEach(fila => {

                if (fila["codigo"] === undefined) fila["codigo"] = "";
                if (fila["articulo"] === undefined) fila["articulo"] = "";

                if (fila["salon"] === undefined || fila["salon"] === "")
                    fila["salon"] = 0;

                if (fila["deposito"] === undefined || fila["deposito"] === "")
                    fila["deposito"] = 0;

                if (fila["stock"] === undefined || fila["stock"] === "")
                    fila["stock"] = 0;

                fila["salon"] = Number(fila["salon"]);
                fila["deposito"] = Number(fila["deposito"]);
                fila["stock"] = fila["salon"] + fila["deposito"];

            });

            historial = [];
            contador = 0;

            resolve(datos.length);

        };

        lector.onerror = () => {
            reject(new Error("No se pudo leer el Excel"));
        };

        lector.readAsArrayBuffer(archivo);

    });
}

export function obtenerCantidadProductos() {
    return datos.length;
}

export function buscarProductoPorCodigo(codigoBuscado) {

    const codigo = String(codigoBuscado).trim();

    const indice = datos.findIndex(fila => {
        return String(fila["codigo"]).trim() === codigo;
    });

    if (indice === -1) {
        return {
            encontrado: false
        };
    }

    const fila = datos[indice];

    return {

        encontrado: true,

        producto: {

            indice,

            codigo: fila["codigo"],

            articulo: fila["articulo"] || "Sin descripción",

            salon: Number(fila["salon"]),

            deposito: Number(fila["deposito"]),

            stock: Number(fila["stock"])

        }

    };

}

export function guardarCantidadEnProducto(indice, cantidad, ubicacion) {

    const fila = datos[indice];

    const movimiento = {

        indice,

        codigo: fila["codigo"],

        articulo: fila["articulo"],

        cantidad,

        ubicacion,

        salonAnterior: Number(fila["salon"]),

        depositoAnterior: Number(fila["deposito"]),

        stockAnterior: Number(fila["stock"])

    };

    if (ubicacion === "salon") {

        fila["salon"] =
            Number(fila["salon"]) + cantidad;

    } else {

        fila["deposito"] =
            Number(fila["deposito"]) + cantidad;

    }

    fila["stock"] =
        Number(fila["salon"]) +
        Number(fila["deposito"]);

    contador++;

    historial.unshift({

        codigo: fila["codigo"],

        articulo: fila["articulo"],

        cantidad,

        ubicacion,

        salon: fila["salon"],

        deposito: fila["deposito"],

        stock: fila["stock"],

        movimiento

    });

    if (historial.length > 10) {
        historial.pop();
    }

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

    if (historial.length === 0) {

        return null;

    }

    const ultimo = historial.shift();

    const m = ultimo.movimiento;

    datos[m.indice]["salon"] = m.salonAnterior;
    datos[m.indice]["deposito"] = m.depositoAnterior;
    datos[m.indice]["stock"] = m.stockAnterior;

    contador--;

    if (contador < 0) contador = 0;

    return {

        contador,

        historial

    };

}

export function descargarExcel() {

    if (datos.length === 0) {

        throw new Error("Primero cargá un Excel");

    }

    const hojaNueva =
        XLSX.utils.json_to_sheet(datos);

    const libroNuevo =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        libroNuevo,
        hojaNueva,
        "Stock"
    );

    XLSX.writeFile(
        libroNuevo,
        "stock_actualizado.xlsx"
    );

}
