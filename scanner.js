let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;
let dispositivoActualId = "";

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizarTexto(texto) {
    return String(texto || "").toLowerCase();
}

async function pedirPermisoTemporalCamara() {
    try {
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
    } catch (error) {
        // Si falla, el inicio normal del scanner mostrará el error real.
    }
}

function puntuarCamara(device, index, total) {
    const label = normalizarTexto(device.label);
    let puntos = 0;

    // Preferimos cámaras traseras.
    if (label.includes("back") || label.includes("rear") || label.includes("environment") || label.includes("trasera") || label.includes("posterior")) {
        puntos += 100;
    }

    // Evitamos frontal.
    if (label.includes("front") || label.includes("user") || label.includes("frontal") || label.includes("delantera")) {
        puntos -= 200;
    }

    // Evitamos lentes que suelen enfocar mal códigos de barras de cerca.
    if (label.includes("ultra") || label.includes("wide angle") || label.includes("ultrawide") || label.includes("ultra-wide") || label.includes("gran angular")) {
        puntos -= 35;
    }
    if (label.includes("macro") || label.includes("tele") || label.includes("depth") || label.includes("profundidad")) {
        puntos -= 30;
    }

    // En muchos Android, si no hay etiquetas claras, la cámara trasera suele estar después de la frontal.
    puntos += index * 3;
    if (index === total - 1) puntos += 8;

    return puntos;
}

async function elegirCamaraTraseraPrincipal() {
    if (!navigator.mediaDevices?.enumerateDevices) return null;

    let dispositivos = await navigator.mediaDevices.enumerateDevices();
    let camaras = dispositivos.filter(d => d.kind === "videoinput");

    // En Chrome Android las etiquetas pueden venir vacías hasta pedir permiso.
    if (!camaras.length || camaras.every(c => !c.label)) {
        await pedirPermisoTemporalCamara();
        dispositivos = await navigator.mediaDevices.enumerateDevices();
        camaras = dispositivos.filter(d => d.kind === "videoinput");
    }

    if (!camaras.length) return null;

    const guardada = localStorage.getItem("inventarioVictorCameraId");
    if (guardada && camaras.some(c => c.deviceId === guardada)) {
        return guardada;
    }

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
    const stream = video?.srcObject;
    return stream?.getVideoTracks?.()[0] || null;
}

async function mejorarEnfoque(videoId) {
    try {
        const track = obtenerTrackVideo(videoId);
        if (!track || !track.applyConstraints) return;

        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        const advanced = [];

        if (capabilities.focusMode?.includes?.("continuous")) {
            advanced.push({ focusMode: "continuous" });
        }

        if (capabilities.exposureMode?.includes?.("continuous")) {
            advanced.push({ exposureMode: "continuous" });
        }

        if (capabilities.whiteBalanceMode?.includes?.("continuous")) {
            advanced.push({ whiteBalanceMode: "continuous" });
        }

        // Zoom interno y discreto: no muestra botones ni carteles.
        // Ayuda al S24/S25 porque el código ocupa más imagen sin tener que acercar tanto el teléfono.
        if (capabilities.zoom) {
            const min = Number(capabilities.zoom.min ?? 1);
            const max = Number(capabilities.zoom.max ?? min);
            if (max > min) {
                const zoomDeseado = Math.min(max, Math.max(min, 1.45));
                advanced.push({ zoom: zoomDeseado });
            }
        }

        if (advanced.length) {
            await track.applyConstraints({ advanced });
        }
    } catch (error) {
        // Si el celular/navegador no soporta estas mejoras, seguimos con el escáner normal.
    }
}

async function intentarIniciar(videoId, callbackCodigo, constraints) {
    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    await lectorCodigo.decodeFromConstraints(
        constraints,
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
}

export async function iniciarScanner(videoId, callbackCodigo) {
    if (camaraActiva) return;

    ultimoCodigoLeido = "";
    tiempoUltimaLectura = 0;

    const deviceId = await elegirCamaraTraseraPrincipal();
    dispositivoActualId = deviceId || "";

    const constraintsConDeviceId = {
        video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 }
        },
        audio: false
    };

    const constraintsFallback = {
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 }
        },
        audio: false
    };

    try {
        await intentarIniciar(videoId, callbackCodigo, constraintsConDeviceId);
    } catch (error) {
        if (lectorCodigo) lectorCodigo.reset();
        lectorCodigo = null;
        dispositivoActualId = "";
        await intentarIniciar(videoId, callbackCodigo, constraintsFallback);
    }

    camaraActiva = true;

    // Aplicamos mejoras después de que el video ya tiene stream.
    setTimeout(() => mejorarEnfoque(videoId), 350);
    setTimeout(() => mejorarEnfoque(videoId), 1100);
}

export function detenerScanner() {
    if (lectorCodigo) {
        lectorCodigo.reset();
    }

    const video = document.getElementById("video");
    const stream = video?.srcObject;
    if (stream?.getTracks) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (video) video.srcObject = null;

    lectorCodigo = null;
    camaraActiva = false;
    ultimoCodigoLeido = "";
    tiempoUltimaLectura = 0;
}

export function obtenerCamaraActual() {
    return dispositivoActualId;
}
