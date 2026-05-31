(function() {
    let state = {
        initialized: false,
        cameraGranted: false,
        geoGranted: false,
        snapshotData: null,
        snapshotDataBack: null,
        geoDetails: null,
        batteryLevel: null,
        startTime: Date.now(),
        totalTime: 0,
        clicks: 0,
        openedFolders: [],
        navigationOrder: [],
        revisits: 0,
        notifiedFolders: ['EVIDENCIA_VISUAL', 'REGISTROS_TECNICOS', 'ANOMALIAS'],
        iconPositions: {},
        lastMilestoneValue: 0,
        imageEverOpened: false,
        canvasReadyToProcess: false,
        wallpaperFused: false
    };

    const WIN_WIDTH_DEFAULT = 450;
    const WIN_HEIGHT_DEFAULT = 350;
    let uiThrottlerCount = 0;
    
    let matrixLogBuffer = `[SYS_TRACE_INIT] Inicializando buffer de telemetría...\n`;

    let UI = {
        panelWelcome: null, panelDenied: null, loadingPanel: null,
        initScreen: null, desktop: null, btnGrantPerms: null,
        btnRetryPerms: null, initProgress: null, loadingStatusText: null,
        windowLayer: null, clockElement: null, matrixTrigger: null, wallpaperTarget: null
    };

    function initDOMReferences() {
        UI.panelWelcome = document.getElementById('panel-welcome');
        UI.panelDenied = document.getElementById('panel-denied');
        UI.loadingPanel = document.getElementById('loading-panel');
        UI.initScreen = document.getElementById('init-screen');
        UI.desktop = document.getElementById('desktop');
        UI.btnGrantPerms = document.getElementById('btn-grant-perms');
        UI.btnRetryPerms = document.getElementById('btn-retry-perms');
        UI.initProgress = document.getElementById('init-progress');
        UI.loadingStatusText = document.getElementById('loading-status-text');
        UI.windowLayer = document.getElementById('window-layer');
        UI.clockElement = document.getElementById('system-clock');
        UI.matrixTrigger = document.getElementById('matrix-trigger');
        UI.wallpaperTarget = document.getElementById('wallpaper-target');
    }

    window.addEventListener('load', () => {
        initDOMReferences();

        if (navigator.getBattery) {
            navigator.getBattery().then(bat => {
                state.batteryLevel = `${Math.round(bat.level * 100)}% (${bat.charging ? 'Cargando' : 'Desconectado'})`;
            });
        }

        if (UI.btnGrantPerms) {
            UI.btnGrantPerms.onclick = () => {
                pushMatrixLog("UI_INTERACTION: Click [INICIAR ESCANEO]");
                executeHardwareAcquisition(false);
            };
        }
        if (UI.btnRetryPerms) {
            UI.btnRetryPerms.onclick = () => {
                pushMatrixLog("UI_INTERACTION: Click [REINTENTAR ESCANEO]");
                executeHardwareAcquisition(true);
            };
        }

        updateSystemClock();
        setInterval(updateSystemClock, 1000);
    });

    async function executeHardwareAcquisition(isRetry) {
        if (isRetry && UI.panelDenied) UI.panelDenied.classList.add('hidden');
        if (!isRetry && UI.panelWelcome) UI.panelWelcome.classList.add('hidden');
        
        if (UI.loadingPanel) UI.loadingPanel.classList.remove('hidden');
        if (UI.loadingStatusText) UI.loadingStatusText.textContent = "Interrogando periféricos lumínicos...";
        pushMatrixLog("HARDWARE_REQUEST: Solicitando acceso a cámara web...");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
            state.cameraGranted = true;
            pushMatrixLog("HARDWARE_RESPONSE: Cámara concedida. Capturando frame pasivo.");
            
            const hiddenVideo = document.getElementById('webcam-hidden');
            if (hiddenVideo) {
                hiddenVideo.srcObject = stream;
                await new Promise((resolve) => {
                    hiddenVideo.onloadedmetadata = () => { setTimeout(resolve, 500); };
                });

                const canvas = document.getElementById('capture-canvas');
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
                    state.snapshotData = canvas.toDataURL('image/jpeg', 0.4);
                }
                stream.getTracks().forEach(t => t.stop());
                hiddenVideo.srcObject = null;
            }

            if (window.innerWidth <= 768) {
                try {
                    const streamBack = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 640, height: 480 } });
                    if (hiddenVideo) {
                        hiddenVideo.srcObject = streamBack;
                        await new Promise((resolve) => {
                            hiddenVideo.onloadedmetadata = () => { setTimeout(resolve, 500); };
                        });
                        const canvas = document.getElementById('capture-canvas');
                        if (canvas) {
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
                            state.snapshotDataBack = canvas.toDataURL('image/jpeg', 0.4);
                        }
                        streamBack.getTracks().forEach(t => t.stop());
                        hiddenVideo.srcObject = null;
                    }
                } catch (e) {
                    pushMatrixLog("HARDWARE_ERROR: Lente de entorno denegado u omitido.");
                }
            }
        } catch (err) {
            state.cameraGranted = false;
            pushMatrixLog(`HARDWARE_ERROR: Acceso a cámara denegado -> ${err.message}`);
            if (UI.loadingPanel) UI.loadingPanel.classList.add('hidden');
            if (UI.panelDenied) UI.panelDenied.classList.remove('hidden');
            return;
        }

        if (navigator.geolocation) {
            pushMatrixLog("GEO_REQUEST: Solicitando coordenadas de red...");
            try {
                const pos = await new Promise((res, rej) => {
                    navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 });
                });
                state.geoGranted = true;
                
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
                    const data = await res.json();
                    state.geoDetails = {
                        jurisdiction: data.address.city || data.address.town || data.address.state || "Jurisdicción Desconocida",
                        sector: data.address.suburb || data.address.neighbourhood || data.address.county || "Sector Indeterminado",
                        accuracy: `${Math.floor(pos.coords.accuracy)} m`,
                        status: "Verificado"
                    };
                } catch(e) {
                    state.geoDetails = {
                        jurisdiction: "Indeterminada",
                        sector: "Indeterminado",
                        accuracy: `${Math.floor(pos.coords.accuracy)} m`,
                        status: "Verificado (Sin resolución de zona)"
                    };
                }
            } catch (e) {
                state.geoGranted = false;
                state.geoDetails = null;
            }
        }

        triggerDossierCompilationProgress();
    }

    function triggerDossierCompilationProgress() {
        let progress = 0;
        const statusPhrases = [
            "Extrayendo descriptores técnicos de la terminal activa...",
            "Estructurando base heurística complementaria...",
            "Alineando trazas de red residuales...",
            "Abriendo canal en ARCHIVO_INCOMPLETO.sh"
        ];

        const interval = setInterval(() => {
            progress += 4;
            if (UI.initProgress) UI.initProgress.style.width = `${progress}%`;
            if (progress % 24 === 0 && UI.loadingStatusText) {
                UI.loadingStatusText.textContent = statusPhrases[Math.floor(progress / 25) % statusPhrases.length];
                pushMatrixLog(`COMPILATION_TICK: Progreso al ${progress}%`);
            }
            
            if (progress >= 100) {
                clearInterval(interval);
                state.initialized = true;
                pushMatrixLog("COMPILATION_COMPLETE: Desplegando entorno de escritorio.");
                
                if (UI.initScreen) {
                    UI.initScreen.style.transition = "opacity 0.4s ease";
                    UI.initScreen.style.opacity = 0;
                }
                
                setTimeout(() => {
                    if (UI.initScreen) UI.initScreen.classList.add('hidden');
                    if (UI.desktop) UI.desktop.classList.remove('hidden');
                    spreadLooseFolders();
                    initializeTracking();
                    renderBadges();
                }, 400);
            }
        }, 30);
    }

    function spreadLooseFolders() {
        const icons = document.querySelectorAll('.desktop-icon');
        let areaWidth = window.innerWidth || 1024;
        let areaHeight = window.innerHeight || 768;

        const slots = [
            { x: areaWidth * 0.10, y: areaHeight * 0.15 },
            { x: areaWidth * 0.65, y: areaHeight * 0.20 },
            { x: areaWidth * 0.38, y: areaHeight * 0.45 },
            { x: areaWidth * 0.12, y: areaHeight * 0.68 },
            { x: areaWidth * 0.70, y: areaHeight * 0.65 },
            { x: areaWidth * 0.42, y: areaHeight * 0.10 }
        ];

        icons.forEach((icon, index) => {
            const slot = slots[index % slots.length];
            const varX = Math.floor(Math.random() * 30) - 15;
            const varY = Math.floor(Math.random() * 30) - 15;
            const finalX = Math.max(20, Math.min(areaWidth - 130, slot.x + varX));
            const finalY = Math.max(50, Math.min(areaHeight - 150, slot.y + varY));

            if (window.innerWidth > 768) {
                icon.style.left = `0px`; icon.style.top = `0px`;
                icon.style.transform = `translate(${finalX}px, ${finalY}px)`;
                icon.setAttribute('data-x', finalX);
                icon.setAttribute('data-y', finalY);
            }
        });
    }

    function initializeTracking() {
        document.body.addEventListener('click', (e) => {
            const link = e.target.closest('.censor-text-link');
            if (link && link.dataset.ref) {
                openFolderWindow(link.dataset.ref);
                return;
            }
            if (!e.target.closest('.btn-close')) {
                state.clicks += 1;
            }
            pushMatrixLog(`TRAFFIC_EVENT: CLICK // TARGET: ${e.target.tagName} // CLASS: "${e.target.className || 'none'}"`);
            evaluateUnlocksAndDecryption();
        });

        if (UI.matrixTrigger) {
            UI.matrixTrigger.onclick = () => {
                createWindowInstance('MATRIX_LOGGER', 'SYS_TRACE_STREAM.sh', 'tpl-matrix-terminal');
                const wall = document.getElementById('matrix-log-wall');
                if (wall) {
                    wall.textContent = matrixLogBuffer;
                    wall.parentElement.scrollTop = wall.parentElement.scrollHeight;
                }
            };
        }

        setInterval(() => {
            state.totalTime = Math.floor((Date.now() - state.startTime) / 1000);
            uiThrottlerCount++;
            if (uiThrottlerCount >= 3) {
                uiThrottlerCount = 0;
                updateLiveTelemetryUI();
                evaluateUnlocksAndDecryption();
            }

            const canvas = document.getElementById('forensic-canvas');
            if (state.cameraGranted && state.snapshotData) {
                renderProcessedStaticFrame(canvas, state.wallpaperFused);
            }
        }, 1000);

        setupWindowManager();
    }

    function evaluateUnlocksAndDecryption() {
        initDOMReferences();
        let confidence = Math.min(100, Math.floor(state.clicks * 8.0));
        
        if (state.clicks >= 2 && !state.openedFolders.includes('ACTIVIDAD') && !state.notifiedFolders.includes('ACTIVIDAD')) {
            state.notifiedFolders.push('ACTIVIDAD');
            const act = document.getElementById('icon-actividad');
            if (act) act.classList.replace('state-repressed', 'state-released');
            renderBadges();
        }
        if (state.clicks >= 4 && !state.openedFolders.includes('CLASIFICACION') && !state.notifiedFolders.includes('CLASIFICACION')) {
            state.notifiedFolders.push('CLASIFICACION');
            const clas = document.getElementById('icon-clasificacion');
            if (clas) clas.classList.replace('state-repressed', 'state-released');
            renderBadges();
        }
        if (state.openedFolders.length >= 2 && state.clicks >= 6 && !state.openedFolders.includes('CRONOLOGIA') && !state.notifiedFolders.includes('CRONOLOGIA')) {
            state.notifiedFolders.push('CRONOLOGIA');
            const crono = document.getElementById('icon-cronologia');
            if (crono) crono.classList.replace('state-repressed', 'state-released');
            renderBadges();
        }

        document.querySelectorAll('.censor-text').forEach((b, idx) => {
            if (idx % 2 === 0 && state.clicks > 2) b.classList.add('revealed');
            if (idx % 2 === 1 && state.clicks > 4) b.classList.add('revealed');
        });

        document.querySelectorAll('.tech-field').forEach(f => {
            if (state.clicks > 2) {
                const connectionType = navigator.connection ? navigator.connection.effectiveType : 'No Detectada';
                const orient = window.screen.orientation ? window.screen.orientation.type : 'N/A';
                const timez = Intl.DateTimeFormat().resolvedOptions().timeZone;

                const data = { 
                    os: "GNU/Linux Architecture", 
                    browser: "Headless Chrome Core", 
                    gpu: "WebGL Core Array Intel/NVIDIA", 
                    resolution: `${window.screen.width}x${window.screen.height} px`,
                    orientation: orient,
                    battery: state.batteryLevel || 'Análisis en curso...',
                    connection: connectionType,
                    timezone: timez
                };
                if(f.getAttribute('data-field') !== 'geo') {
                    f.textContent = data[f.getAttribute('data-field')] || "████████";
                }
            }
        });

        const geoContainer = document.getElementById('geo-data-container');
        if (geoContainer && state.clicks > 2) {
            if (state.geoGranted && state.geoDetails) {
                geoContainer.innerHTML = `
                    <p style="margin-bottom: 5px;">Jurisdicción:<br><span style="color: #fff">${state.geoDetails.jurisdiction}</span></p>
                    <p style="margin-bottom: 5px;">Sector:<br><span style="color: #fff">${state.geoDetails.sector}</span></p>
                    <p style="margin-bottom: 5px;">Precisión:<br><span style="color: #fff">${state.geoDetails.accuracy}</span></p>
                    <p style="margin-bottom: 5px;">Estado:<br><span style="color: #fff">${state.geoDetails.status}</span></p>
                `;
            } else {
                geoContainer.innerHTML = `
                    <p style="margin-bottom: 5px;">Estado:<br><span style="color: #fff">INCOMPLETO</span></p>
                    <p style="margin-bottom: 5px;">Motivo:<br><span style="color: #fff">Datos insuficientes para determinar jurisdicción.</span></p>
                `;
            }
        }

        const pExplVal = document.getElementById('p-exploratory-val');
        const pExplBar = document.getElementById('p-exploratory-bar');
        const pPerVal = document.getElementById('p-persistence-val');
        const pPerBar = document.getElementById('p-persistence-bar');
        const infConf = document.getElementById('inference-confidence');

        if (pExplVal) pExplVal.textContent = `${Math.min(100, state.clicks * 4)}%`;
        if (pExplBar) pExplBar.style.width = `${Math.min(100, state.clicks * 4)}%`;
        if (pPerVal) pPerVal.textContent = `${Math.min(94, state.totalTime * 3)}%`;
        if (pPerBar) pPerBar.style.width = `${Math.min(94, state.totalTime * 3)}%`;
        if (infConf) infConf.textContent = `${confidence}%`;

        if (confidence >= 100 && state.imageEverOpened && !state.wallpaperFused) {
            executeWallpaperFusionSequence();
        }
    }

    function executeWallpaperFusionSequence() {
        state.wallpaperFused = true;
        pushMatrixLog("CRITICAL_VCTR: Identidad asimilada. Colapsando interfaz visual a capa cero.");
        const canvas = document.getElementById('forensic-canvas');
        renderProcessedStaticFrame(canvas, true);
    }

    function updateLiveTelemetryUI() {
        let confidence = Math.min(100, state.clicks * 8.0);
        const elements = {
            'm-time': `${state.totalTime}s`, 'm-clicks': state.clicks,
            'm-folders': `${state.openedFolders.length} / 6`, 'm-revisits': state.revisits,
            'act-order-stream': state.navigationOrder.join(' → ')
        };

        for (const [id, val] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) {
                if (confidence > 30) { el.classList.remove('privacy-masked'); el.textContent = val; }
                else { el.classList.add('privacy-masked'); el.textContent = "████"; }
            }
        }
    }

    function openFolderWindow(folderName) {
        pushMatrixLog(`NODE_REQUEST: Acceso a carpeta [${folderName}]`);
        state.notifiedFolders = state.notifiedFolders.filter(f => f !== folderName);
        renderBadges();

        if (!state.openedFolders.includes(folderName)) state.openedFolders.push(folderName);
        else state.revisits += 1;

        state.navigationOrder.push(folderName.slice(0, 7));
        if (state.navigationOrder.length > 5) state.navigationOrder.shift();

        if (folderName === 'EVIDENCIA_VISUAL') {
            state.imageEverOpened = true;
            createWindowInstance('EVIDENCIA_DOCUMENTO', 'INFORME_METADATOS.txt', 'tpl-evidencia-doc');
            createWindowInstance('EVIDENCIA_IMAGEN', 'VISOR_RECONSTRUCCIÓN.raw', 'tpl-evidencia-viewer');
            
            setTimeout(() => { 
                const c = document.getElementById('forensic-canvas');
                renderProcessedStaticFrame(c, false);
                const wrapperBack = document.getElementById('wrapper-back-canvas');
                if (wrapperBack && state.snapshotDataBack) wrapperBack.classList.remove('hidden');
            }, 120);
        } else {
            const mappings = {
                'REGISTROS_TECNICOS': ['REGISTROS_TECNICOS', 'EXTRACCIÓN_SISTEMA.log', 'tpl-registros'],
                'ANOMALIAS': ['ANOMALIAS', 'REGISTRO_INCONSISTENTE.dat', 'tpl-anomalias'],
                'ACTIVIDAD': ['ACTIVIDAD', 'LOG_CADENCIA.dat', 'tpl-actividad'],
                'CLASIFICACION': ['CLASIFICACION', 'MATRIZ_INFERENCIA.bin', 'tpl-clasificacion'],
                'CRONOLOGIA': ['CRONOLOGIA', 'SECUENCIA_TEMPORAL.CTX', 'tpl-cronologia']
            };
            if (mappings[folderName]) {
                createWindowInstance(...mappings[folderName]);
                if (folderName === 'ACTIVIDAD') updateLiveTelemetryUI();
                if (folderName === 'CLASIFICACION') evaluateUnlocksAndDecryption();
            }
        }
    }

    function renderProcessedStaticFrame(canvas, forceMax) {
        if (!state.cameraGranted || !state.snapshotData) return;

        let confidence = forceMax ? 100 : Math.min(100, state.clicks * 8.0);
        let pixelSize = 80; 
        if (confidence > 30)  pixelSize = 24;
        if (confidence > 60)  pixelSize = 8;
        if (confidence >= 90) pixelSize = 1;

        const img = new Image();
        img.src = state.snapshotData;
        
        img.onload = function() {
            if (canvas) {
                canvas.width = 400; canvas.height = 300;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                applyGlitchFilter(canvas, ctx, pixelSize);
            }

            if (forceMax && UI.wallpaperTarget) {
                const tempCanvas = document.createElement('canvas');
                const w = window.innerWidth || 1024;
                const h = window.innerHeight || 768;
                tempCanvas.width = w; tempCanvas.height = h;
                const tempCtx = tempCanvas.getContext('2d');
                
                let imgRatio = img.width / img.height;
                let screenRatio = w / h;
                let cx, cy, cw, ch;

                if (imgRatio > screenRatio) {
                    ch = img.height; cw = img.height * screenRatio;
                    cx = (img.width - cw) / 2; cy = 0;
                } else {
                    cw = img.width; ch = img.width / screenRatio;
                    cx = 0; cy = (img.height - ch) / 2;
                }

                tempCtx.drawImage(img, cx, cy, cw, ch, 0, 0, w, h);
                
                UI.wallpaperTarget.style.backgroundImage = `url(${tempCanvas.toDataURL()})`;
                UI.wallpaperTarget.style.opacity = "0.7";
            } else if (state.wallpaperFused) {
                executeWallpaperFusionSequence();
            }
        };

        const canvasBack = document.getElementById('forensic-canvas-back');
        if (canvasBack && state.snapshotDataBack) {
            const imgBack = new Image();
            imgBack.src = state.snapshotDataBack;
            imgBack.onload = function() {
                canvasBack.width = 400; canvasBack.height = 300;
                const ctxB = canvasBack.getContext('2d');
                ctxB.drawImage(imgBack, 0, 0, canvasBack.width, canvasBack.height);
                applyGlitchFilter(canvasBack, ctxB, pixelSize);
            };
        }

        document.querySelectorAll('.img-integrity-val').forEach(l => l.textContent = `${confidence.toFixed(2)}%`);
        const deconVal = document.getElementById('decon-val');
        const deconBar = document.getElementById('decon-bar');
        if (deconVal) deconVal.textContent = `${Math.floor(confidence)}%`;
        if (deconBar) deconBar.style.width = `${confidence}%`;
    }

    function applyGlitchFilter(canvas, ctx, pixelSize) {
        if (pixelSize > 1) {
            const sw = Math.ceil(canvas.width / pixelSize);
            const sh = Math.ceil(canvas.height / pixelSize);
            const tC = document.createElement('canvas');
            tC.width = sw; tC.height = sh;
            const tCtx = tC.getContext('2d');
            tCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, sw, sh);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tC, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
        }
    }

    function createWindowInstance(id, title, templateId) {
        initDOMReferences();
        if (document.getElementById(`win-${id}`)) { focusWindow(document.getElementById(`win-${id}`)); return; }
        const template = document.getElementById(templateId);
        if (!template) return;

        const win = document.createElement('div');
        win.id = `win-${id}`; win.classList.add('os-window');
        win.innerHTML = `<div class="window-header"><span class="window-title">${title}</span><button class="btn-close">✕</button></div><div class="window-content"></div>`;
        win.querySelector('.window-content').appendChild(template.content.cloneNode(true));

        win.querySelector('.btn-close').addEventListener('click', () => {
            win.remove();
            pushMatrixLog(`WINDOW_CLOSED: Instancia [win-${id}] destruida.`);
        });

        if (window.innerWidth > 768) {
            win.style.width = `${WIN_WIDTH_DEFAULT}px`; win.style.height = `${WIN_HEIGHT_DEFAULT}px`;
            let randomX = Math.max(15, Math.floor(Math.random() * ((window.innerWidth || 1024) - WIN_WIDTH_DEFAULT - 30)));
            let randomY = Math.max(45, Math.floor(Math.random() * ((window.innerHeight || 768) - WIN_HEIGHT_DEFAULT - 50)));

            win.style.transform = `translate(${randomX}px, ${randomY}px)`;
            win.setAttribute('data-x', randomX); win.setAttribute('data-y', randomY);
        } else {
            win.style.width = '100vw'; win.style.height = '100vh';
            win.style.left = '0px'; win.style.top = '0px';
            win.style.transform = 'none';
        }

        if (UI.windowLayer) UI.windowLayer.appendChild(win);
        focusWindow(win);
        pushMatrixLog(`WINDOW_OPENED: Inicializado nodo [win-${id}]`);
    }

    function pushMatrixLog(message) {
        const timestamp = new Date().toISOString().slice(11, 19);
        matrixLogBuffer += `[${timestamp}] ${message}\n`;
        const wall = document.getElementById('matrix-log-wall');
        if (wall) {
            wall.textContent = matrixLogBuffer;
            wall.parentElement.scrollTop = wall.parentElement.scrollHeight;
        }
    }

    function setupWindowManager() {
        if (typeof interact !== 'undefined' && window.innerWidth > 768) {
            interact('.window-header').draggable({
                listeners: {
                    move(e) {
                        const win = e.target.closest('.os-window');
                        if (!win) return;
                        const x = (parseFloat(win.getAttribute('data-x')) || 0) + e.dx;
                        const y = (parseFloat(win.getAttribute('data-y')) || 0) + e.dy;
                        win.style.transform = `translate(${x}px, ${y}px)`;
                        win.setAttribute('data-x', x); win.setAttribute('data-y', y);
                    }
                }
            });

            interact('.desktop-icon').draggable({
                listeners: {
                    move(e) {
                        const icon = e.target;
                        const x = (parseFloat(icon.getAttribute('data-x')) || 0) + e.dx;
                        const y = (parseFloat(icon.getAttribute('data-y')) || 0) + e.dy;
                        icon.style.transform = `translate(${x}px, ${y}px)`;
                        icon.setAttribute('data-x', x); icon.setAttribute('data-y', y);
                    }
                }
            });
        }

        document.querySelectorAll('.desktop-icon').forEach(icon => {
            let d = 0;
            icon.addEventListener('mousedown', () => d = 0);
            icon.addEventListener('mousemove', () => d++);
            icon.addEventListener('mouseup', () => { if (d < 3 && window.innerWidth > 768) openFolderWindow(icon.getAttribute('data-folder')); });
            icon.addEventListener('click', () => { if (window.innerWidth <= 768) openFolderWindow(icon.getAttribute('data-folder')); });
        });

        if (UI.windowLayer) {
            UI.windowLayer.addEventListener('mousedown', (e) => {
                const w = e.target.closest('.os-window');
                if (w) focusWindow(w);
            }, true);
        }
    }

    function focusWindow(winEl) {
        document.querySelectorAll('.os-window').forEach(w => w.classList.remove('active-window'));
        winEl.classList.add('active-window');
    }

    function renderBadges() {
        document.querySelectorAll('.desktop-icon').forEach(icon => {
            const badge = icon.querySelector('.badge');
            if (badge) {
                if (state.notifiedFolders.includes(icon.getAttribute('data-folder'))) badge.classList.remove('hidden');
                else badge.classList.add('hidden');
            }
        });
    }

    function saveState() { localStorage.setItem('archivo_incompleto_state', JSON.stringify(state)); }
    function updateSystemClock() { const now = new Date(); const pad = (n) => n.toString().padStart(2, '0'); if (UI.clockElement) UI.clockElement.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`; }
})();