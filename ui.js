const estadoExcel = document.getElementById("estadoExcel");
const estadoExcelNumero = document.getElementById("estadoExcelNumero");

const btnSalon = document.getElementById("btnSalon");
const btnDeposito = document.getElementById("btnDeposito");
const ubicacionTexto = document.getElementById("ubicacionTexto");

const btnIniciarCamara = document.getElementById("btnIniciarCamara");
const btnDetenerCamara = document.getElementById("btnDetenerCamara");
const estadoCamaraTexto = document.getElementById("estadoCamaraTexto");

const productoCard = document.getElementById("productoCard");
const estadoProducto = document.getElementById("estadoProducto");

const codigoProducto = document.getElementById("codigoProducto");
const nombreProducto = document.getElementById("nombreProducto");

const stockSalon = document.getElementById("stockSalon");
const stockDeposito = document.getElementById("stockDeposito");
const stockTotal = document.getElementById("stockTotal");

const cantidadInput = document.getElementById("cantidadInput");

const btnGuardarCantidad = document.getElementById("btnGuardarCantidad");
const btnDescargar = document.getElementById("btnDescargar");
const btnDeshacer = document.getElementById("btnDeshacer");

const contadorTop = document.getElementById("contadorTop");
const historial = document.getElementById("historial");

const mensaje = document.getElementById("mensaje");

export function mostrarMensaje(texto, tipo = "") {

    mensaje.textContent = texto;
    mensaje.className = tipo;

}

export function actualizarEstadoExcel(cantidad) {

    estadoExcel.textContent =
        `Excel cargado correctamente (${cantidad} productos)`;

    estadoExcelNumero.textContent = cantidad;

}

export function actualizarUbicacion(ubicacion) {

    if (ubicacion === "salon") {

        btnSalon.classList.add("active");
        btnDeposito.classList.remove("active");

        ubicacionTexto.textContent = "SALÓN";

    } else {

        btnDeposito.classList.add("active");
        btnSalon.classList.remove("active");

        ubicacionTexto.textContent = "DEPÓSITO";

    }

}

export function mostrarProducto(producto) {

    productoCard.classList.remove("idle");
    productoCard.classList.remove("not-found");
    productoCard.classList.add("found");

    estadoProducto.textContent = "Encontrado";

    codigoProducto.textContent = producto.codigo;
    nombreProducto.textContent = producto.articulo;

    stockSalon.textContent = producto.salon;
    stockDeposito.textContent = producto.deposito;
    stockTotal.textContent = producto.stock;

    setTimeout(() => {
        productoCard.classList.remove("found");
    }, 500);

}

export function mostrarProductoNoEncontrado(codigo) {

    productoCard.classList.remove("found");
    productoCard.classList.add("not-found");

    estadoProducto.textContent = "No encontrado";

    codigoProducto.textContent = codigo;
    nombreProducto.textContent = "Producto inexistente";

    stockSalon.textContent = "-";
    stockDeposito.textContent = "-";
    stockTotal.textContent = "-";

}

export function limpiarProducto(texto = "Esperando escaneo...") {

    productoCard.classList.remove("found");
    productoCard.classList.remove("not-found");

    estadoProducto.textContent = "Esperando";

    codigoProducto.textContent = "-";
    nombreProducto.textContent = texto;

    stockSalon.textContent = "0";
    stockDeposito.textContent = "0";
    stockTotal.textContent = "0";

    cantidadInput.value = "";

}

export function actualizarContador(numero) {

    contadorTop.textContent = numero;

}

export function actualizarHistorial(lista) {

    historial.innerHTML = "";

    lista.forEach(item => {

        const li = document.createElement("li");

        const ubicacion =
            item.ubicacion === "salon"
                ? "Salón"
                : "Depósito";

        li.innerHTML = `
            <strong>${item.articulo}</strong>

            <div class="historial-linea">
                <span>${item.codigo}</span>

                <span class="historial-ubicacion ${item.ubicacion}">
                    ${ubicacion} +${item.cantidad}
                </span>
            </div>
        `;

        historial.appendChild(li);

    });

}

export function activarBotonGuardar(estado) {

    btnGuardarCantidad.disabled = !estado;

}

export function activarBotonDescargar(estado) {

    btnDescargar.disabled = !estado;

}

export function activarBotonDeshacer(estado) {

    btnDeshacer.disabled = !estado;

}

export function cambiarEstadoCamara(activa) {

    btnIniciarCamara.disabled = activa;
    btnDetenerCamara.disabled = !activa;

    estadoCamaraTexto.textContent =
        activa ? "Activa" : "Detenida";

}

export function reproducirConfirmacion(tipo = "ok") {

    if ("vibrate" in navigator) {

        navigator.vibrate(40);

    }

    const audio = new Audio(
        tipo === "guardado"
            ? "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg"
            : "https://actions.google.com/sounds/v1/cartoon/pop.ogg"
    );

    audio.volume = 0.35;

    audio.play().catch(() => {});

}
