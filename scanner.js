let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;
let streamActual = null;
let trackActual = null;
let videoActual = null;
let zoomActual = null;
let zoomMin = 1;
let zoomMax = 1;
let zoomStep = 0.25;

function limpiarLecturaDuplicada() {
    ultimoCodigoLeido = "";
    tiempoUltimaLectura = 0;
}

function detenerStreamActual() {
    if (streamActual) {
        streamActual.getTracks().forEach(track => track.stop());
    }
    streamActual = null;
    trackActual = null;
    videoActual = null;
    zoomActual = null;
    zoomMin = 1;
    zoomMax = 1;
    zoomStep = 0.25;
}

async function aplicarOptimizacionCamara() {
    if (!trackActual || !trackActual.getCapabilities) return;

    const capacidades = trackActual.getCapabilities();
    const restricciones = { advanced: [] };

    if (Array.isArray(capacidades.focusMode) && capacidades.focusMode.includes("continuous")) {
        restricciones.advanced.push({ focusMode: "continuous" });
    }

    if (Array.isArray(capacidades.exposureMode) && capacidades.exposureMode.includes("continuous")) {
        restricciones.advanced.push({ exposureMode: "continuous" });
    }

    if (Array.isArray(capacidades.whiteBalanceMode) && capacidades.whiteBalanceMode.includes("continuous")) {
        restricciones.advanced.push({ whiteBalanceMode: "continuous" });
    }

    if (typeof capacidades.zoom === "object") {
        zoomMin = capacidades.zoom.min || 1;
        zoomMax = capacidades.zoom.max || zoomMin;
        zoomStep = capacidades.zoom.step || 0.25;

        // Samsung S24/S25 suele enfocar mejor si el teléfono queda un poco más lejos.
        // Por eso iniciamos con zoom digital moderado cuando el navegador lo permite.
        const zoomInicial = Math.min(Math.max(2.2, zoomMin), zoomMax);
        zoomActual = zoomInicial;
        restricciones.advanced.push({ zoom: zoomInicial });
    }

    if (restricciones.advanced.length > 0) {
        try {
            await trackActual.applyConstraints(restricciones);
        } catch (error) {
            console.warn("No se pudieron aplicar mejoras de cámara:", error);
        }
    }
}

function manejarResultado(resultado, callbackCodigo) {
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

async function iniciarConStreamManual(videoId, callbackCodigo) {
    const video = document.getElementById(videoId);
    if (!video) throw new Error("No se encontró el elemento de video");

    // Pedimos cámara trasera, resolución alta y dejamos margen para que el celular pueda elegir la mejor cámara.
    const constraints = {
        audio: false,
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
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
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 },
                frameRate: { ideal: 30, max: 60 },
                advanced: [
                    { focusMode: "continuous" },
                    { zoom: 2 }
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

export async function cambiarZoom(delta) {
    if (!trackActual || zoomActual === null || !trackActual.applyConstraints) return null;

    const nuevoZoom = Math.min(zoomMax, Math.max(zoomMin, zoomActual + delta));
    zoomActual = Math.round(nuevoZoom / zoomStep) * zoomStep;
    zoomActual = Math.min(zoomMax, Math.max(zoomMin, zoomActual));

    try {
        await trackActual.applyConstraints({ advanced: [{ zoom: zoomActual }] });
        return zoomActual;
    } catch (error) {
        console.warn("No se pudo cambiar el zoom:", error);
        return null;
    }
}

export async function aumentarZoom() {
    return cambiarZoom(zoomStep || 0.25);
}

export async function disminuirZoom() {
    return cambiarZoom(-(zoomStep || 0.25));
}

export function obtenerInfoZoom() {
    return {
        soportado: zoomActual !== null,
        zoom: zoomActual,
        min: zoomMin,
        max: zoomMax,
        step: zoomStep
    };
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
