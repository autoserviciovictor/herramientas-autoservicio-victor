let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;

export async function iniciarScanner(videoId, callbackCodigo) {
    if (camaraActiva) return;

    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    await lectorCodigo.decodeFromConstraints(
        {
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                focusMode: "continuous",
                advanced: [
                    { focusMode: "continuous" },
                    { zoom: 2 }
                ]
            }
        },
        videoId,
        (resultado) => {
            if (!resultado || !camaraActiva) return;

            const codigo = String(resultado.text || "").trim();
            const ahora = Date.now();

            if (!codigo) return;

            if (codigo === ultimoCodigoLeido && ahora - tiempoUltimaLectura < 2000) {
                return;
            }

            ultimoCodigoLeido = codigo;
            tiempoUltimaLectura = ahora;
            callbackCodigo(codigo);
        }
    );

    camaraActiva = true;
}

export function detenerScanner() {
    if (lectorCodigo) {
        lectorCodigo.reset();
    }

    lectorCodigo = null;
    camaraActiva = false;
    ultimoCodigoLeido = "";
    tiempoUltimaLectura = 0;
}
