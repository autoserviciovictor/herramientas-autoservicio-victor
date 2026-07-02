let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;
let streamActual = null;
let trackActual = null;
let videoActual = null;
let detectorNativo = null;
let loopDetectorNativo = null;
let scannerDetenido = true;

function limpiarLecturaDuplicada() {
    ultimoCodigoLeido = "";
    tiempoUltimaLectura = 0;
}

function detenerLoopNativo() {
    scannerDetenido = true;
    if (loopDetectorNativo) {
        cancelAnimationFrame(loopDetectorNativo);
        loopDetectorNativo = null;
    }
}

function detenerStreamActual() {
    detenerLoopNativo();

    if (streamActual) {
        streamActual.getTracks().forEach(track => track.stop());
    }

    streamActual = null;
    trackActual = null;
    videoActual = null;
    detectorNativo = null;
}

function soporta(capacidades, nombre, valor) {
    return Array.isArray(capacidades?.[nombre]) && capacidades[nombre].includes(valor);
}

async function aplicarOptimizacionCamara() {
    if (!trackActual || !trackActual.getCapabilities || !trackActual.applyConstraints) return;

    const capacidades = trackActual.getCapabilities();
    const advanced = [];

    if (soporta(capacidades, "focusMode", "continuous")) {
        advanced.push({ focusMode: "continuous" });
    } else if (soporta(capacidades, "focusMode", "single-shot")) {
        advanced.push({ focusMode: "single-shot" });
    }

    if (soporta(capacidades, "exposureMode", "continuous")) {
        advanced.push({ exposureMode: "continuous" });
    }

    if (soporta(capacidades, "whiteBalanceMode", "continuous")) {
        advanced.push({ whiteBalanceMode: "continuous" });
    }

    // Sin botones ni cartel: usamos zoom interno moderado solo para que el S24/S25 pueda leer
    // sosteniendo el producto más lejos, donde la cámara sí enfoca mejor.
    if (capacidades.zoom && typeof capacidades.zoom === "object") {
        const min = capacidades.zoom.min || 1;
        const max = capacidades.zoom.max || min;
        const zoomOculto = Math.min(Math.max(1.7, min), Math.min(max, 2.1));
        advanced.push({ zoom: zoomOculto });
    }

    if (!advanced.length) return;

    try {
        await trackActual.applyConstraints({ advanced });
    } catch (error) {
        console.warn("No se pudieron aplicar mejoras automáticas de cámara:", error);
    }
}

function manejarResultado(resultado, callbackCodigo) {
    if (!resultado) return;

    const codigo = String(resultado.text || resultado.rawValue || "").trim();
    const ahora = Date.now();

    if (!codigo) return;

    if (codigo === ultimoCodigoLeido && ahora - tiempoUltimaLectura < 1800) {
        return;
    }

    ultimoCodigoLeido = codigo;
    tiempoUltimaLectura = ahora;
    callbackCodigo(codigo);
}

async function iniciarDetectorNativo(callbackCodigo) {
    if (!("BarcodeDetector" in window) || !videoActual) return;

    try {
        const formatos = [
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "code_128",
            "code_39",
            "itf"
        ];

        detectorNativo = new BarcodeDetector({ formats: formatos });
        scannerDetenido = false;

        const detectar = async () => {
            if (scannerDetenido || !videoActual || videoActual.readyState < 2) {
                loopDetectorNativo = requestAnimationFrame(detectar);
                return;
            }

            try {
                const codigos = await detectorNativo.detect(videoActual);
                if (codigos && codigos.length > 0) {
                    manejarResultado(codigos[0], callbackCodigo);
                }
            } catch (_) {
                // Algunos Android fallan alguna lectura aislada. Seguimos intentando.
            }

            loopDetectorNativo = requestAnimationFrame(detectar);
        };

        detectar();
    } catch (error) {
        console.warn("Detector nativo no disponible:", error);
        detectorNativo = null;
    }
}

async function iniciarConStreamManual(videoId, callbackCodigo) {
    const video = document.getElementById(videoId);
    if (!video) throw new Error("No se encontró el elemento de video");

    const constraints = {
        audio: false,
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 30, max: 60 }
        }
    };

    streamActual = await navigator.mediaDevices.getUserMedia(constraints);
    trackActual = streamActual.getVideoTracks()[0] || null;
    videoActual = video;

    video.setAttribute("playsinline", "true");
    video.muted = true;
    video.srcObject = streamActual;
    await video.play();

    await aplicarOptimizacionCamara();

    // En Android moderno, BarcodeDetector suele enfocar/leer mejor que ZXing.
    // Lo dejamos activo en paralelo como primera opción invisible.
    await iniciarDetectorNativo(callbackCodigo);

    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    if (typeof lectorCodigo.decodeFromVideoElement === "function") {
        await lectorCodigo.decodeFromVideoElement(video, (resultado) => {
            manejarResultado(resultado, callbackCodigo);
        });
    } else {
        throw new Error("El lector no soporta decodeFromVideoElement");
    }
}

async function iniciarConFallbackZXing(videoId, callbackCodigo) {
    detenerStreamActual();

    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    await lectorCodigo.decodeFromConstraints(
        {
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
                frameRate: { ideal: 30, max: 60 },
                advanced: [
                    { focusMode: "continuous" },
                    { exposureMode: "continuous" },
                    { zoom: 1.7 }
                ]
            }
        },
        videoId,
        (resultado) => {
            manejarResultado(resultado, callbackCodigo);
        }
    );
}

export async function iniciarScanner(videoId, callbackCodigo) {
    if (camaraActiva) return;

    limpiarLecturaDuplicada();

    try {
        await iniciarConStreamManual(videoId, callbackCodigo);
    } catch (error) {
        console.warn("Inicio de cámara optimizado falló, usando fallback:", error);
        if (lectorCodigo) lectorCodigo.reset();
        lectorCodigo = null;
        await iniciarConFallbackZXing(videoId, callbackCodigo);
    }

    camaraActiva = true;
}

export function detenerScanner() {
    if (lectorCodigo) {
        lectorCodigo.reset();
    }

    lectorCodigo = null;
    detenerStreamActual();
    camaraActiva = false;
    limpiarLecturaDuplicada();
}
