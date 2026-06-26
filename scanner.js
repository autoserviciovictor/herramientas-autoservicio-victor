let lectorCodigo = null;
let camaraActiva = false;

let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;

export async function iniciarScanner(videoId, callbackCodigo) {

    if (camaraActiva) {
        return;
    }

    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    await lectorCodigo.decodeFromConstraints(
        {
            video: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 },
                focusMode: "continuous"
            }
        },
        videoId,
        (resultado, error) => {

            if (!resultado) {
                return;
            }

            const codigo = String(resultado.text).trim();
            const ahora = Date.now();

            if (!codigo) {
                return;
            }

            if (
                codigo === ultimoCodigoLeido &&
                ahora - tiempoUltimaLectura < 2500
            ) {
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

    if (!lectorCodigo) {
        return;
    }

    lectorCodigo.reset();

    lectorCodigo = null;
    camaraActiva = false;

    ultimoCodigoLeido = "";
    tiempoUltimaLectura = 0;
}
