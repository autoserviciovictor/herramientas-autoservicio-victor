let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;

async function mejorarEnfoque(videoId) {
    try {
        const video = document.getElementById(videoId);
        const stream = video?.srcObject;
        const track = stream?.getVideoTracks?.()[0];
        if (!track || !track.applyConstraints) return;

        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        const constraints = { advanced: [] };

        if (capabilities.focusMode?.includes?.("continuous")) {
            constraints.advanced.push({ focusMode: "continuous" });
        }

        if (capabilities.exposureMode?.includes?.("continuous")) {
            constraints.advanced.push({ exposureMode: "continuous" });
        }

        if (capabilities.whiteBalanceMode?.includes?.("continuous")) {
            constraints.advanced.push({ whiteBalanceMode: "continuous" });
        }

        if (constraints.advanced.length) {
            await track.applyConstraints(constraints);
        }
    } catch (error) {
        // Si el celular/navegador no soporta estas mejoras, seguimos con el escáner normal.
    }
}

export async function iniciarScanner(videoId, callbackCodigo) {
    if (camaraActiva) return;

    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    await lectorCodigo.decodeFromConstraints(
        {
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                focusMode: "continuous"
            }
        },
        videoId,
        (resultado) => {
            if (!resultado || !camaraActiva) return;

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

    camaraActiva = true;
    setTimeout(() => mejorarEnfoque(videoId), 450);
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
