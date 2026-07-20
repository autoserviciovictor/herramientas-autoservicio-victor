let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;
let dispositivoActualId = "";
let videoActivoId = "";
let sesionScanner = 0;
let iniciandoScanner = false;
let temporizadoresEnfoque = [];

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizarTexto(texto) {
    return String(texto || "").toLowerCase();
}

function limpiarTemporizadoresEnfoque() {
    temporizadoresEnfoque.forEach(id => clearTimeout(id));
    temporizadoresEnfoque = [];
}

function detenerStreamsVideo() {
    ["video", "videoVencimientos", "videoReposicion", "videoPrecios"].forEach(videoId => {
        const video = document.getElementById(videoId);
        const stream = video?.srcObject;
        if (stream?.getTracks) stream.getTracks().forEach(track => track.stop());
        if (video) {
            try { video.pause(); } catch (_) {}
            video.srcObject = null;
        }
    });
}

function crearErrorCamara(error) {
    const nombre = String(error?.name || "");
    if (nombre === "NotAllowedError" || nombre === "PermissionDeniedError") {
        return new Error("No se permitió usar la cámara. Habilitá el permiso de cámara en el navegador y volvé a intentarlo.");
    }
    if (nombre === "NotFoundError" || nombre === "DevicesNotFoundError") {
        return new Error("No se encontró una cámara disponible en este dispositivo.");
    }
    if (nombre === "NotReadableError" || nombre === "TrackStartError") {
        return new Error("La cámara está siendo usada por otra aplicación. Cerrala y volvé a intentarlo.");
    }
    if (nombre === "OverconstrainedError" || nombre === "ConstraintNotSatisfiedError") {
        return new Error("La cámara no admite la configuración solicitada.");
    }
    return new Error(error?.message || "No se pudo iniciar la cámara.");
}

async function pedirPermisoTemporalCamara() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    });
    stream.getTracks().forEach(track => track.stop());
    await esperar(120);
}

function puntuarCamara(device, index, total) {
    const label = normalizarTexto(device.label);
    let puntos = 0;
    if (label.includes("back") || label.includes("rear") || label.includes("environment") || label.includes("trasera") || label.includes("posterior")) puntos += 100;
    if (label.includes("front") || label.includes("user") || label.includes("frontal") || label.includes("delantera")) puntos -= 200;
    if (label.includes("ultra") || label.includes("wide angle") || label.includes("ultrawide") || label.includes("ultra-wide") || label.includes("gran angular")) puntos -= 35;
    if (label.includes("macro") || label.includes("tele") || label.includes("depth") || label.includes("profundidad")) puntos -= 30;
    puntos += index * 3;
    if (index === total - 1) puntos += 8;
    return puntos;
}

async function elegirCamaraTraseraPrincipal() {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    let dispositivos = await navigator.mediaDevices.enumerateDevices();
    let camaras = dispositivos.filter(d => d.kind === "videoinput");
    if (!camaras.length || camaras.every(c => !c.label)) {
        try {
            await pedirPermisoTemporalCamara();
            dispositivos = await navigator.mediaDevices.enumerateDevices();
            camaras = dispositivos.filter(d => d.kind === "videoinput");
        } catch (_) {
            // El inicio principal devolverá el mensaje de permiso correspondiente.
        }
    }
    if (!camaras.length) return null;
    const guardada = localStorage.getItem("inventarioVictorCameraId");
    if (guardada && camaras.some(c => c.deviceId === guardada)) return guardada;
    const elegida = camaras
        .map((camara, index) => ({ camara, puntos: puntuarCamara(camara, index, camaras.length) }))
        .sort((a, b) => b.puntos - a.puntos)[0]?.camara;
    if (elegida?.deviceId) {
        localStorage.setItem("inventarioVictorCameraId", elegida.deviceId);
        return elegida.deviceId;
    }
    return null;
}

function obtenerTrackVideo(videoId) {
    const video = document.getElementById(videoId);
    return video?.srcObject?.getVideoTracks?.()[0] || null;
}

async function mejorarEnfoque(videoId, sesion) {
    try {
        if (!camaraActiva || sesion !== sesionScanner || videoId !== videoActivoId) return;
        const track = obtenerTrackVideo(videoId);
        if (!track || !track.applyConstraints || track.readyState === "ended") return;
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        const advanced = [];
        if (capabilities.focusMode?.includes?.("continuous")) advanced.push({ focusMode: "continuous" });
        if (capabilities.exposureMode?.includes?.("continuous")) advanced.push({ exposureMode: "continuous" });
        if (capabilities.whiteBalanceMode?.includes?.("continuous")) advanced.push({ whiteBalanceMode: "continuous" });
        if (capabilities.zoom) {
            const min = Number(capabilities.zoom.min ?? 1);
            const max = Number(capabilities.zoom.max ?? min);
            if (max > min) advanced.push({ zoom: Math.min(max, Math.max(min, 1.45)) });
        }
        if (advanced.length) await track.applyConstraints({ advanced });
    } catch (_) {
        // Algunos navegadores no admiten estas restricciones; el escáner sigue funcionando normalmente.
    }
}

async function intentarIniciar(videoId, callbackCodigo, constraints, sesion) {
    const lector = new ZXing.BrowserMultiFormatReader();
    lectorCodigo = lector;
    await lector.decodeFromConstraints(constraints, videoId, resultado => {
        if (!resultado || !camaraActiva || sesion !== sesionScanner || lector !== lectorCodigo) return;
        const codigo = String(resultado.text || "").trim();
        const ahora = Date.now();
        if (!codigo) return;
        if (codigo === ultimoCodigoLeido && ahora - tiempoUltimaLectura < 2000) return;
        ultimoCodigoLeido = codigo;
        tiempoUltimaLectura = ahora;
        callbackCodigo(codigo);
    });
}

export async function iniciarScanner(videoId, callbackCodigo) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador no permite utilizar la cámara.");
    if (typeof ZXing === "undefined" || !ZXing.BrowserMultiFormatReader) throw new Error("No se pudo cargar el lector de códigos. Revisá la conexión e intentá nuevamente.");
    if (!document.getElementById(videoId)) throw new Error("No se encontró el visor de la cámara.");
    if (typeof callbackCodigo !== "function") throw new Error("No se configuró la lectura del código.");
    if (iniciandoScanner) return;
    if (camaraActiva) detenerScanner();

    iniciandoScanner = true;
    const sesion = ++sesionScanner;
    videoActivoId = videoId;
    ultimoCodigoLeido = "";
    tiempoUltimaLectura = 0;
    limpiarTemporizadoresEnfoque();
    detenerStreamsVideo();

    try {
        const deviceId = await elegirCamaraTraseraPrincipal();
        if (sesion !== sesionScanner) return;
        dispositivoActualId = deviceId || "";
        const principal = {
            video: {
                ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
                width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }
            }, audio: false
        };
        const fallback = {
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
            audio: false
        };
        try {
            await intentarIniciar(videoId, callbackCodigo, principal, sesion);
        } catch (primerError) {
            lectorCodigo?.reset();
            lectorCodigo = null;
            dispositivoActualId = "";
            detenerStreamsVideo();
            if (sesion !== sesionScanner) return;
            try {
                await intentarIniciar(videoId, callbackCodigo, fallback, sesion);
            } catch (segundoError) {
                throw segundoError || primerError;
            }
        }
        if (sesion !== sesionScanner) {
            detenerScanner();
            return;
        }
        camaraActiva = true;
        temporizadoresEnfoque.push(setTimeout(() => mejorarEnfoque(videoId, sesion), 350));
        temporizadoresEnfoque.push(setTimeout(() => mejorarEnfoque(videoId, sesion), 1100));
    } catch (error) {
        detenerScanner();
        throw crearErrorCamara(error);
    } finally {
        iniciandoScanner = false;
    }
}

export function detenerScanner() {
    sesionScanner += 1;
    limpiarTemporizadoresEnfoque();
    try { lectorCodigo?.reset(); } catch (_) {}
    detenerStreamsVideo();
    lectorCodigo = null;
    camaraActiva = false;
    iniciandoScanner = false;
    videoActivoId = "";
    ultimoCodigoLeido = "";
    tiempoUltimaLectura = 0;
}

export function obtenerCamaraActual() {
    return dispositivoActualId;
}
