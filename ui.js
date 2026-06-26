const estadoExcel = document.getElementById("estadoExcel");
const contador = document.getElementById("contador");

const btnSalon = document.getElementById("btnSalon");
const btnDeposito = document.getElementById("btnDeposito");
const ubicacionTexto = document.getElementById("ubicacionTexto");

const btnIniciarCamara = document.getElementById("btnIniciarCamara");
const btnDetenerCamara = document.getElementById("btnDetenerCamara");
const cameraBox = document.querySelector(".camera-box");

const productoCard = document.getElementById("productoCard");
const tituloProducto = document.getElementById("tituloProducto");
const codigoProducto = document.getElementById("codigoProducto");
const nombreProducto = document.getElementById("nombreProducto");
const stockSalon = document.getElementById("stockSalon");
const stockDeposito = document.getElementById("stockDeposito");
const stockTotal = document.getElementById("stockTotal");

const cantidadInput = document.getElementById("cantidadInput");
const btnGuardarCantidad = document.getElementById("btnGuardarCantidad");
const btnDescargar = document.getElementById("btnDescargar");
const btnDeshacer = document.getElementById("btnDeshacer");

const historial = document.getElementById("historial");
const mensaje = document.getElementById("mensaje");

export function mostrarMensaje(texto, tipo = "") {
    mensaje.textContent = texto;
    mensaje.className = tipo;
    console.log(texto);
}

export function actualizarEstadoExcel(texto) {
    estadoExcel.textContent = texto;
}

export function actualizarUbicacion(ubicacion) {
    if (ubicacion === "salon") {
        btnSalon.classList.add("activo");
        btnDeposito.classList.remove("activo");
        ubicacionTexto.textContent = "SALÓN";
    } else {
        btnDeposito.classList.add("activo");
        btnSalon.classList.remove("activo");
        ubicacionTexto.textContent = "DEPÓSITO";
    }
}

export function mostrarProducto(producto) {
    productoCard.classList.remove("no-encontrado");
    productoCard.classList.remove("encontrado");

    void productoCard.offsetWidth;

    productoCard.classList.add("encontrado");

    tituloProducto.textContent = "PRODUCTO ENCONTRADO";
    codigoProducto.textContent = producto.codigo;
    nombreProducto.textContent = producto.articulo;
    stockSalon.textContent = producto.salon;
    stockDeposito.textContent = producto.deposito;
    stockTotal.textContent = producto.stock;
}

export function mostrarProductoNoEncontrado(codigo) {
    productoCard.classList.remove("encontrado");
    productoCard.classList.add("no-encontrado");

    tituloProducto.textContent = "PRODUCTO NO ENCONTRADO";
    codigoProducto.textContent = codigo;
    nombreProducto.textContent = "No está en el Excel";
    stockSalon.textContent = "0";
    stockDeposito.textContent = "0";
    stockTotal.textContent = "0";

    cantidadInput.value = "";
}

export function limpiarProducto(texto = "Esperando escaneo...") {
    productoCard.classList.remove("encontrado");
    productoCard.classList.remove("no-encontrado");

    tituloProducto.textContent = "PRODUCTO ENCONTRADO";
    codigoProducto.textContent = "-";
    nombreProducto.textContent = texto;
    stockSalon.textContent = "0";
    stockDeposito.textContent = "0";
    stockTotal.textContent = "0";

    cantidadInput.value = "";
}

export function actualizarContador(numero) {
    contador.textContent = numero;
}

export function actualizarHistorial(lista) {
    historial.innerHTML = "";

    lista.forEach(item => {
        const li = document.createElement("li");
        const ubicacionTexto = item.ubicacion === "salon" ? "Salón" : "Depósito";
        const clase = item.ubicacion === "salon" ? "historial-salon" : "historial-deposito";

        li.innerHTML = `
            <div class="historial-nombre">${item.articulo}</div>
            <div class="historial-detalle">
                <span>${item.codigo}</span>
                <span class="${clase}">${ubicacionTexto} +${item.cantidad}</span>
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
}

export function marcarCamaraActiva(activa) {
    if (activa) {
        cameraBox.classList.add("activa");
    } else {
        cameraBox.classList.remove("activa");
    }
}

export function enfocarCantidad() {
    setTimeout(() => {
        cantidadInput.focus();
    }, 200);
}

export function avisarEscaneo() {
    try {
        if (navigator.vibrate) {
            navigator.vibrate(120);
        }

        const audio = new Audio(
            "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
        );

        audio.play().catch(() => {});
    } catch (error) {
        console.log("Aviso de escaneo no disponible");
    }
}
