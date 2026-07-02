let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;
let streamActual = null;

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getVideo(videoId) {
    return typeof videoId === "string" ? document.getElementById(videoId) : videoId;
}

async function aplicarMejorasDeCamara(video) {
    try {
        const stream = video?.srcObject;
        const track = stream?.getVideoTracks?.()[0];
        if (!track || !track.getCapabilities || !track.applyConstraints) return;

        const caps = track.getCapabilities();
        const advanced = [];

        // Autofocus continuo: ayuda en Samsung S24/S25 y otros modelos nuevos.
        if (caps.focusMode && Array.from(caps.focusMode).includes("continuous")) {
            advanced.push({ focusMode: "continuous" });
        }

        // Un poco de zoom mejora mucho la lectura de códigos chicos.
        if (caps.zoom) {
            const min = Number(caps.zoom.min ?? 1);
            const max = Number(caps.zoom.max ?? 1);
            const zoomIdeal = Math.min(max, Math.max(min, 2));
            advanced.push({ zoom: zoomIdeal });
        }

        if (advanced.length) {
            await track.applyConstraints({ advanced });
        }
    } catch (error) {
        console.warn("No se pudieron aplicar mejoras de enfoque/zoom:", error);
    }
}

async function listarCamaras() {
    try {
        const dispositivos = await navigator.mediaDevices.enumerateDevices();
        return dispositivos.filter(d => d.kind === "videoinput");
    } catch (_) {
        return [];
    }
}

function elegirCamaraTrasera(camaras) {
    if (!camaras.length) return null;

    const prioridad = [
        /back|rear|environment|trasera|posterior/i,
        /wide|main|principal/i,
        /camera 0|0/i
    ];

    for (const regla of prioridad) {
        const encontrada = camaras.find(camara => regla.test(camara.label || ""));
        if (encontrada) return encontrada.deviceId;
    }

    return camaras[camaras.length - 1]?.deviceId || null;
}

async function probarScannerConConstraints(videoId, callbackCodigo, constraints) {
    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    await lectorCodigo.decodeFromConstraints(
        constraints,
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

    const video = getVideo(videoId);
    streamActual = video?.srcObject || null;
    await esperar(250);
    await aplicarMejorasDeCamara(video);
}

export async function iniciarScanner(videoId, callbackCodigo) {
    if (camaraActiva) return;

    if (!window.isSecureContext) {
        throw new Error("La cámara necesita HTTPS para funcionar.");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este navegador no permite usar la cámara.");
    }

    detenerScanner();

    const intentos = [];

    // Primer intento: cámara trasera con tamaño ideal. Sin focusMode acá para evitar
    // que algunos Samsung/Chrome rechacen todo el inicio de la cámara.
    intentos.push({
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    });

    // Segundo intento: resolución más baja, más compatible.
    intentos.push({
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 640 },
            height: { ideal: 480 }
        }
    });

    // Tercer intento: cualquier cámara disponible.
    intentos.push({ video: true });

    let ultimoError = null;

    for (const constraints of intentos) {
        try {
            await probarScannerConConstraints(videoId, callbackCodigo, constraints);
            camaraActiva = true;
            return;
        } catch (error) {
            ultimoError = error;
            detenerScanner();
            await esperar(150);
        }
    }

    // Último intento: pedir permiso, listar cámaras y elegir trasera por deviceId.
    try {
        const permiso = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        permiso.getTracks().forEach(track => track.stop());
        const camaras = await listarCamaras();
        const deviceId = elegirCamaraTrasera(camaras);

        if (deviceId) {
            await probarScannerConConstraints(videoId, callbackCodigo, {
                video: {
                    deviceId: { exact: deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            camaraActiva = true;
            return;
        }
    } catch (error) {
        ultimoError = error;
        detenerScanner();
    }

    throw ultimoError || new Error("No se pudo iniciar la cámara.");
}

export function detenerScanner() {
    try {
        if (lectorCodigo) lectorCodigo.reset();
    } catch (_) {}

    try {
        if (streamActual) {
            streamActual.getTracks().forEach(track => track.stop());
        }
    } catch (_) {}

    lectorCodigo = null;
    streamActual = null;
    camaraActiva = false;
    ultimoCodigoLeido = "";
    tiempoUltimaLectura = 0;
}
