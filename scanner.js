let lectorCodigo = null;
let camaraActiva = false;
let ultimoCodigoLeido = "";
let tiempoUltimaLectura = 0;
let dispositivoCamaraActual = null;

function dormir(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function detenerStream(stream) {
    try {
        stream?.getTracks?.().forEach(track => track.stop());
    } catch (error) {
        // No hacemos nada. Solo intentamos liberar la cámara.
    }
}

function normalizarTexto(texto) {
    return String(texto || "").toLowerCase();
}

function puntuarCamara(device, indice) {
    const label = normalizarTexto(device.label);
    let puntos = 0;

    // Priorizar cámaras traseras.
    if (label.includes("back") || label.includes("rear") || label.includes("trasera") || label.includes("environment")) puntos += 80;
    if (label.includes("facing back")) puntos += 90;

    // En Android/Samsung la cámara principal trasera suele ser camera2 0.
    if (/camera2\s*0/i.test(device.label)) puntos += 70;
    if (/camera\s*0/i.test(device.label)) puntos += 45;
    if (/\b0\b/.test(label) && label.includes("back")) puntos += 35;

    // Evitar lentes que suelen enfocar peor códigos de cerca.
    if (label.includes("front") || label.includes("frontal") || label.includes("user")) puntos -= 200;
    if (label.includes("ultra") || label.includes("wide") || label.includes("gran angular")) puntos -= 35;
    if (label.includes("macro")) puntos -= 55;
    if (label.includes("tele") || label.includes("zoom")) puntos -= 35;
    if (label.includes("depth") || label.includes("profundidad")) puntos -= 80;

    // Si no hay labels útiles, mantener orden estable.
    puntos -= indice;
    return puntos;
}

async function obtenerDispositivoCamaraPrincipal() {
    if (!navigator.mediaDevices?.enumerateDevices) return null;

    let dispositivos = await navigator.mediaDevices.enumerateDevices();
    let camaras = dispositivos.filter(d => d.kind === "videoinput");

    const hayLabels = camaras.some(c => c.label);

    // En Android los nombres de cámaras aparecen recién después de pedir permiso una vez.
    if (!hayLabels && navigator.mediaDevices?.getUserMedia) {
        let streamTemporal = null;
        try {
            streamTemporal = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });
            await dormir(150);
        } catch (error) {
            // Si falla, seguimos con la selección normal por facingMode.
        } finally {
            detenerStream(streamTemporal);
        }

        dispositivos = await navigator.mediaDevices.enumerateDevices();
        camaras = dispositivos.filter(d => d.kind === "videoinput");
    }

    if (!camaras.length) return null;

    const ordenadas = camaras
        .map((camara, indice) => ({ camara, puntos: puntuarCamara(camara, indice) }))
        .sort((a, b) => b.puntos - a.puntos);

    return ordenadas[0]?.camara || null;
}

async function mejorarEnfoque(videoId) {
    try {
        const video = document.getElementById(videoId);
        const stream = video?.srcObject;
        const track = stream?.getVideoTracks?.()[0];
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

        // Zoom interno muy suave: no muestra botones ni cartel. Ayuda en algunos Samsung
        // a que el código ocupe más área sin cambiar el flujo de uso.
        if (capabilities.zoom) {
            const min = Number(capabilities.zoom.min ?? 1);
            const max = Number(capabilities.zoom.max ?? 1);
            const objetivo = Math.min(max, Math.max(min, 1.25));
            if (objetivo > min) advanced.push({ zoom: objetivo });
        }

        if (advanced.length) {
            await track.applyConstraints({ advanced });
        }
    } catch (error) {
        // Si el celular/navegador no soporta estas mejoras, seguimos con el escáner normal.
    }
}

function crearConstraintsVideo(deviceId = null) {
    const video = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 }
    };

    if (deviceId) {
        video.deviceId = { exact: deviceId };
    } else {
        video.facingMode = { ideal: "environment" };
    }

    return { video };
}

export async function iniciarScanner(videoId, callbackCodigo) {
    if (camaraActiva) return;

    lectorCodigo = new ZXing.BrowserMultiFormatReader();

    const camaraPrincipal = await obtenerDispositivoCamaraPrincipal();
    dispositivoCamaraActual = camaraPrincipal?.deviceId || null;

    const constraints = crearConstraintsVideo(dispositivoCamaraActual);

    try {
        await lectorCodigo.decodeFromConstraints(
            constraints,
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
    } catch (error) {
        // Si falló abrir por deviceId exacto, probamos el método clásico como respaldo.
        dispositivoCamaraActual = null;
        await lectorCodigo.decodeFromConstraints(
            crearConstraintsVideo(null),
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
    }

    camaraActiva = true;

    // Aplicar varias veces ayuda a algunos Samsung a acomodar foco/exposición después de iniciar.
    setTimeout(() => mejorarEnfoque(videoId), 350);
    setTimeout(() => mejorarEnfoque(videoId), 900);
    setTimeout(() => mejorarEnfoque(videoId), 1600);
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
