let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;
let videoTrack = null;
let linternaActiva = false;

export async function iniciarScanner(videoId, callbackCodigo) {
    if (camaraActiva) return;

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
        (resultado) => {
            if (!resultado) return;

            const codigo = String(resultado.text || "").trim();
            const ahora = Date.now();

            if (!codigo) return;

            if (codigo === ultimoCodigoLeido && ahora - tiempoUltimaLectura < 1800) {
                return;
            }

            ultimoCodigoLeido = codigo;
            tiempoUltimaLectura = ahora;
            callbackCodigo(codigo);
        }
    );

    const video = document.getElementById(videoId);
    const stream = video?.srcObject;
    videoTrack = stream?.getVideoTracks?.()[0] || null;

    camaraActiva = true;
    linternaActiva = false;
}

export function detenerScanner() {
    if (lectorCodigo) {
        lectorCodigo.reset();
    }

    lectorCodigo = null;
    camaraActiva = false;
    ultimoCodigoLeido = "";
    tiempoUltimaLectura = 0;
    videoTrack = null;
    linternaActiva = false;
}

export async function alternarLinterna() {
    if (!videoTrack) {
        return false;
    }

    const capacidades = videoTrack.getCapabilities?.();

    if (!capacidades || !capacidades.torch) {
        return false;
    }

    linternaActiva = !linternaActiva;
    await videoTrack.applyConstraints({ advanced: [{ torch: linternaActiva }] });
    return linternaActiva;
}

export function linternaDisponible() {
    const capacidades = videoTrack?.getCapabilities?.();
    return Boolean(capacidades?.torch);
}
