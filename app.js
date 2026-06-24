document.addEventListener("DOMContentLoaded", () => {

    alert("JS funcionando");

    const buscarBtn = document.getElementById("buscarBtn");

    if (buscarBtn) {
        alert("Botón encontrado");

        buscarBtn.addEventListener("click", () => {
            alert("CLICK FUNCIONA");
        });

    } else {
        alert("No encontró buscarBtn");
    }

});
