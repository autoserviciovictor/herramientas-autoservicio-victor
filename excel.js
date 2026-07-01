let datos = [];
let contador = 0;
let ultimosEscaneados = [];

function normalizarNumero(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) && numero >= 0 ? numero : 0;
}

function normalizarTexto(valor) {
    return String(valor ?? "").trim();
}

function armarProducto(fila, indice) {
    const salon = normalizarNumero(fila["salon"]);
    const deposito = normalizarNumero(fila["deposito"]);
    const stock = salon + deposito;

    return {
        indice,
        codigo: normalizarTexto(fila["codigo"]),
        articulo: normalizarTexto(fila["articulo"]) || "Sin descripción",
        salon,
        deposito,
        stock
    };
}

function recalcularFila(indice) {
    const fila = datos[indice];
    fila["salon"] = normalizarNumero(fila["salon"]);
    fila["deposito"] = normalizarNumero(fila["deposito"]);
    fila["stock"] = fila["salon"] + fila["deposito"];
    return armarProducto(fila, indice);
}

function registrarUltimo(producto) {
    ultimosEscaneados = ultimosEscaneados.filter(item => item.indice !== producto.indice);
    ultimosEscaneados.unshift(producto);

    if (ultimosEscaneados.length > 10) {
        ultimosEscaneados.pop();
    }
}

export function cargarExcel(archivo) {
    return new Promise((resolve, reject) => {
        if (!archivo) {
            reject(new Error("Seleccioná un archivo Excel"));
            return;
        }

        const lector = new FileReader();

        lector.onload = function (evento) {
            try {
                const data = new Uint8Array(evento.target.result);
                const workbook = XLSX.read(data, { type: "array" });
                const hoja = workbook.Sheets[workbook.SheetNames[0]];

                datos = XLSX.utils.sheet_to_json(hoja, {
                    defval: "",
                    raw: false
                });

                datos.forEach(fila => {
                    if (fila["codigo"] === undefined) fila["codigo"] = "";
                    if (fila["articulo"] === undefined) fila["articulo"] = "";
                    if (fila["salon"] === undefined || fila["salon"] === "") fila["salon"] = 0;
                    if (fila["deposito"] === undefined || fila["deposito"] === "") fila["deposito"] = 0;
                    if (fila["stock"] === undefined || fila["stock"] === "") fila["stock"] = 0;

                    fila["codigo"] = normalizarTexto(fila["codigo"]);
                    fila["articulo"] = normalizarTexto(fila["articulo"]);
                    fila["salon"] = normalizarNumero(fila["salon"]);
                    fila["deposito"] = normalizarNumero(fila["deposito"]);
                    fila["stock"] = fila["salon"] + fila["deposito"];
                });

                contador = 0;
                ultimosEscaneados = [];

                resolve(datos.length);
            } catch (error) {
                reject(new Error("No se pudo procesar el Excel"));
            }
        };

        lector.onerror = () => reject(new Error("No se pudo leer el Excel"));
        lector.readAsArrayBuffer(archivo);
    });
}

export function obtenerCantidadProductos() {
    return datos.length;
}

export function obtenerContador() {
    return contador;
}

export function obtenerUltimosEscaneados() {
    return [...ultimosEscaneados];
}

export function reiniciarContador() {
    contador = 0;
    ultimosEscaneados = [];
    return contador;
}

export function buscarProductoPorCodigo(codigoBuscado) {
    const codigo = normalizarTexto(codigoBuscado);

    const indice = datos.findIndex(fila => normalizarTexto(fila["codigo"]) === codigo);

    if (indice === -1) {
        return { encontrado: false };
    }

    return {
        encontrado: true,
        producto: armarProducto(datos[indice], indice)
    };
}

export function buscarProductosPorTexto(texto, limite = 10) {
    const consulta = normalizarTexto(texto).toLowerCase();

    if (!consulta) {
        return obtenerUltimosEscaneados();
    }

    const resultados = [];

    for (let i = 0; i < datos.length; i++) {
        const codigo = normalizarTexto(datos[i]["codigo"]).toLowerCase();
        const articulo = normalizarTexto(datos[i]["articulo"]).toLowerCase();

        if (codigo.includes(consulta) || articulo.includes(consulta)) {
            resultados.push(armarProducto(datos[i], i));
        }

        if (resultados.length >= limite) break;
    }

    return resultados;
}

export function guardarCantidadEnProducto(indice, cantidad, ubicacion) {
    if (!datos[indice]) {
        throw new Error("Producto inválido");
    }

    const fila = datos[indice];
    const cantidadNumerica = normalizarNumero(cantidad);

    if (cantidadNumerica <= 0) {
        throw new Error("Ingresá una cantidad válida");
    }

    if (ubicacion === "deposito") {
        fila["deposito"] = normalizarNumero(fila["deposito"]) + cantidadNumerica;
    } else {
        fila["salon"] = normalizarNumero(fila["salon"]) + cantidadNumerica;
    }

    const producto = recalcularFila(indice);
    contador++;
    registrarUltimo(producto);

    return {
        producto,
        contador,
        ultimos: obtenerUltimosEscaneados()
    };
}

export function modificarStockProducto(indice, salon, deposito) {
    if (!datos[indice]) {
        throw new Error("Producto inválido");
    }

    datos[indice]["salon"] = normalizarNumero(salon);
    datos[indice]["deposito"] = normalizarNumero(deposito);

    const producto = recalcularFila(indice);
    registrarUltimo(producto);

    return producto;
}

export function descargarExcel() {
    if (datos.length === 0) {
        throw new Error("Primero cargá un Excel");
    }

    const hojaNueva = XLSX.utils.json_to_sheet(datos);
    const libroNuevo = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(libroNuevo, hojaNueva, "Stock");
    XLSX.writeFile(libroNuevo, "stock_actualizado.xlsx");
}
