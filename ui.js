const estadoExcel = document.getElementById("estadoExcel");
const estadoUbicacion = document.getElementById("estadoUbicacion");
const btnSalon = document.getElementById("btnSalon");
const btnDeposito = document.getElementById("btnDeposito");

const btnIniciarCamara = document.getElementById("btnIniciarCamara");
const btnDetenerCamara = document.getElementById("btnDetenerCamara");

const codigoProducto = document.getElementById("codigoProducto");
const nombreProducto = document.getElementById("nombreProducto");
const stockProducto = document.getElementById("stockProducto");

const cantidadInput = document.getElementById("cantidadInput");
const btnGuardarCantidad = document.getElementById("btnGuardarCantidad");
const btnDescargar = document.getElementById("btnDescargar");
const btnDeshacer = document.getElementById("btnDeshacer");

const contador = document.getElementById("contador");
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
        estadoUbicacion.textContent = "Ubicación seleccionada: Salón";
    }

    if (ubicacion === "deposito") {
        btnDeposito.classList.add("activo");
        btnSalon.classList.remove("activo");
        estadoUbicacion.textContent = "Ubicación seleccionada: Depósito";
    }
}

export function mostrarProducto(producto) {
    codigoProducto.textContent = producto.codigo;
    nombreProducto.textContent = producto.articulo;
    stockProducto.textContent =
        `Salón: ${producto.salon} | Depósito: ${producto.deposito} | Stock: ${producto.stock}`;
}

export function limpiarProducto(texto = "Esperando escaneo...") {
    codigoProducto.textContent = "-";
    nombreProducto.textContent = texto;
    stockProducto.textContent = "-";
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

        li.innerHTML = `
            <strong>${item.articulo}</strong><br>
            Código: ${item.codigo}<br>
            ${ubicacionTexto}: +${item.cantidad}<br>
            Stock: ${item.stock}
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
