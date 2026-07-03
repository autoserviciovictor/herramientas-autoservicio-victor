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
let lecturaPausada = false;
let intervaloEnfoque = null;

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

    if (intervaloEnfoque) {
        clearInterval(intervaloEnfoque);
        intervaloEnfoque = null;
    }

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

    // Samsung S24/S25: se usa zoom interno oculto para obligar a leer desde más distancia,
    // donde la cámara principal enfoca mejor. No se muestra ningún botón ni cartel de zoom.
    if (capacidades.zoom && typeof capacidades.zoom === "object") {
        const min = capacidades.zoom.min || 1;
        const max = capacidades.zoom.max || min;
        const zoomIdeal = 2.15;
        const zoomOculto = Math.min(Math.max(zoomIdeal, min), Math.min(max, 2.6));
        advanced.push({ zoom: zoomOculto });
    }

    if (!advanced.length) return;

    try {
        await trackActual.applyConstraints({ advanced });
    } catch (error) {
        console.warn("No se pudieron aplicar mejoras automáticas de cámara:", error);
    }
}

function mantenerEnfoqueActivo() {
    if (intervaloEnfoque) clearInterval(intervaloEnfoque);

    intervaloEnfoque = setInterval(async () => {
        if (!camaraActiva || !trackActual || lecturaPausada) return;
        await aplicarOptimizacionCamara();
    }, 1400);
}

function manejarResultado(resultado, callbackCodigo) {
    if (lecturaPausada) return;
    if (!resultado) return;

    const codigo = String(resultado.text || resultado.rawValue || "").trim();
    const ahora = Date.now();

    if (!codigo) return;

    if (codigo === ultimoCodigoLeido && ahora - tiempoUltimaLectura < 1800) {
        return;
    }

    ultimoCodigoLeido = codigo;
    tiempoUltimaLectura = ahora;

    // Pausa inmediata dentro del scanner para evitar doble lectura
    // antes de que la app muestre la cantidad.
    lecturaPausada = true;
    callbackCodigo(codigo);
}

async function iniciarDetectorNativo(callbackCodigo) {
    if (!("BarcodeDetector" in window) || !videoActual) return;

    try {
        let formatos = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

        if (typeof BarcodeDetector.getSupportedFormats === "function") {
            const soportados = await BarcodeDetector.getSupportedFormats();
            formatos = formatos.filter(f => soportados.includes(f));
            if (!formatos.length) return;
        }

        detectorNativo = new BarcodeDetector({ formats: formatos });
        scannerDetenido = false;

        const detectar = async () => {
            if (scannerDetenido) return;

            if (!videoActual || videoActual.readyState < 2) {
                loopDetectorNativo = requestAnimationFrame(detectar);
                return;
            }

            try {
                const codigos = await detectorNativo.detect(videoActual);
                if (codigos && codigos.length > 0) {
                    manejarResultado(codigos[0], callbackCodigo);
                }
            } catch (_) {}

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
    mantenerEnfoqueActivo();

    // Chrome Android: el detector nativo suele leer mejor en Samsung actuales.
    await iniciarDetectorNativo(callbackCodigo);

    // ZXing queda funcionando en paralelo como respaldo.
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
                    { zoom: 1.8 }
                ]
            }
        },
        videoId,
        (resultado) => {
            manejarResultado(resultado, callbackCodigo);
        }
    );

    trackActual = document.getElementById(videoId)?.srcObject?.getVideoTracks?.()[0] || trackActual;
    await aplicarOptimizacionCamara();
}

export async function iniciarScanner(videoId, callbackCodigo) {
    if (camaraActiva) return;

    limpiarLecturaDuplicada();
    lecturaPausada = false;

    try {
        await iniciarConStreamManual(videoId, callbackCodigo);
    } catch (error) {
        console.warn("Inicio de cámara optimizado falló, usando fallback:", error);
        if (lectorCodigo) lectorCodigo.reset();
        lectorCodigo = null;
        await iniciarConFallbackZXing(videoId, callbackCodigo);
    }

    camaraActiva = true;
    mantenerEnfoqueActivo();
}

export function detenerScanner() {
    if (lectorCodigo) {
        lectorCodigo.reset();
    }

    lectorCodigo = null;
    detenerStreamActual();
    camaraActiva = false;
    lecturaPausada = false;
    limpiarLecturaDuplicada();
}

export function pausarLecturaScanner() {
    lecturaPausada = true;
}

export function reanudarLecturaScanner() {
    lecturaPausada = false;
    limpiarLecturaDuplicada();
}

