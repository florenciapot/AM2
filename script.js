(function() {
    // --- APP ARCHITECTURE STATE ---
    let state = {
        initialized: false,
        cameraGranted: false,
        geoGranted: false,
        snapshotData: null,
        startTime: Date.now(),
        totalTime: 0,
        clicks: 0,
        openedFolders: [],
        folderOpenCounts: {
            'EVIDENCIA_VISUAL': 0,
            'REGISTROS_TECNICOS': 0,
            'SUJETO': 0,
            'ACTIVIDAD': 0,
            'CLASIFICACION': 0
        },
        navigationOrder: [],
        idleTime: 0,
        revisits: 0,
        lastInteractionTime: Date.now(),
        notifiedFolders: ['EVIDENCIA_VISUAL', 'REGISTROS_TECNICOS', 'SUJETO', 'ACTIVIDAD', 'CLASIFICACION'],
        geoData: null,
        iconPositions: {},
        lastMilestoneValue: 0,
        imageEverOpened: false,
        canvasReadyToProcess: false 
    };

    const WIN_WIDTH_DEFAULT = 450;
    const WIN_HEIGHT_DEFAULT = 350;
    let matrixLoggingActive = false;
    let uiThrottlerCount = 0; 

    const initScreen = document.getElementById('init-screen');
    const desktop = document.getElementById('desktop');
    const btnGrantPerms = document.getElementById('btn-grant-perms');
    const permLog = document.getElementById('perm-log');
    const loadingPanel = document.getElementById('loading-panel');
    const initProgress = document.getElementById('init-progress');
    const loadingStatusText = document.getElementById('loading-status-text');
    const windowLayer = document.getElementById('window-layer');
    const clockElement = document.getElementById('system-clock');
    const desktopArea = document.getElementById('desktop-area');
    const matrixTrigger = document.getElementById('matrix-trigger');

    function loadState() {
        const saved = localStorage.getItem('archivo_incompleto_state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                state = { ...state, ...parsed };
                state.startTime = Date.now() - (state.totalTime * 1000);
                state.lastInteractionTime = Date.now();
                return true;
            } catch(e) {
                return false;
            }
        }
        return false;
    }

    function saveState() {
        localStorage.setItem('archivo_incompleto_state', JSON.stringify(state));
    }

    window.addEventListener('DOMContentLoaded', () => {
        const hasSavedState = loadState();
        updateSystemClock();
        setInterval(updateSystemClock, 1000);

        if (hasSavedState && state.initialized) {
            initScreen.classList.add('hidden');
            desktop.classList.remove('hidden');
            setTimeout(spreadLooseFolders, 100);
            initializeTracking();
            renderBadges();
        } else {
            btnGrantPerms.addEventListener('click', requestSensorsPipeline);
        }
    });

    function pushMatrixLog(message) {
        if (!matrixLoggingActive) return;
        const wall = document.getElementById('matrix-log-wall');
        if (wall) {
            const timestamp = new Date().toISOString().slice(11, 19);
            wall.textContent += `\n[${timestamp}] ${message}`;
            const container = wall.parentElement;
            container.scrollTop = container.scrollHeight;
            
            if (wall.textContent.length > 8000) {
                wall.textContent = wall.textContent.slice(4000);
            }
        }
    }

    function logPermMessage(text) {
        const p = document.createElement('p');
        p.textContent = `> ${text}`;
        permLog.appendChild(p);
        permLog.scrollTop = permLog.scrollHeight;
    }

    async function requestSensorsPipeline() {
        btnGrantPerms.disabled = true;
        logPermMessage("Iniciando solicitud de interfaz criptográfica visual...");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            state.cameraGranted = true;
            logPermMessage("CÁMARA CONCEDIDA: Capturando matriz de reflectancia...");
            
            const hiddenVideo = document.getElementById('webcam-hidden');
            hiddenVideo.srcObject = stream;
            
            await new Promise((resolve) => {
                hiddenVideo.onloadedmetadata = () => {
                    setTimeout(resolve, 600);
                };
            });

            const canvas = document.getElementById('capture-canvas');
            const ctx = canvas.getContext('2d');
            ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
            
            state.snapshotData = canvas.toDataURL('image/jpeg', 0.4);
            stream.getTracks().forEach(track => track.stop());
            hiddenVideo.srcObject = null;
            logPermMessage("CANAL DE CÁMARA APAGADO SEGURO: Flujo guardado en memoria volatil.");
        } catch (err) {
            state.cameraGranted = false;
            logPermMessage("ERROR: ACCESO A CÁMARA NO CONCEDIDO o Periférico Ausente.");
        }

        logPermMessage("Evaluando coordenadas pasivas terrestres (GPS/IP)...");
        if (navigator.geolocation) {
            try {
                const geoPos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                });
                state.geoGranted = true;
                state.geoData = {
                    lat: geoPos.coords.latitude.toFixed(4),
                    lon: geoPos.coords.longitude.toFixed(4),
                    acc: geoPos.coords.accuracy
                };
                logPermMessage(`COORDENADAS REGISTRADAS: Lat ${state.geoData.lat}, Lon ${state.geoData.lon}.`);
            } catch (geoErr) {
                state.geoGranted = false;
                logPermMessage("LOCALIZACIÓN NO DISPONIBLE: IGNORADO POR EL SCRIPT INTERNO.");
            }
        } else {
            state.geoGranted = false;
            logPermMessage("LOCALIZACIÓN NO DISPONIBLE: API ausente en terminal.");
        }

        setTimeout(triggerSystemCompilationAnimation, 1000);
    }

    function triggerSystemCompilationAnimation() {
        permLog.classList.add('hidden');
        document.querySelector('.perm-buttons').classList.add('hidden');
        loadingPanel.classList.remove('hidden');

        let progress = 0;
        const statusPhrases = [
            "Extrayendo descriptores de entorno del sujeto ausente...",
            "Compilando diccionarios lingüísticos e históricos de la terminal...",
            "Estructurando base heurística de la última sesión registrada...",
            "Abriendo canal paralelo en ARCHIVO_INCOMPLETO...",
            "Alineando trazas de red. Desplegando peritaje de desaparición."
        ];

        const interval = setInterval(() => {
            progress += 2;
            initProgress.style.width = `${progress}%`;
            
            if (progress % 20 === 0 && progress < 100) {
                loadingStatusText.textContent = statusPhrases[Math.floor(progress / 20) % statusPhrases.length];
            }

            if (progress >= 100) {
                clearInterval(interval);
                state.initialized = true;
                spreadLooseFolders();
                saveState();
                
                initScreen.style.transition = "opacity 0.6s ease";
                initScreen.style.opacity = 0;
                setTimeout(() => {
                    initScreen.classList.add('hidden');
                    desktop.classList.remove('hidden');
                    initializeTracking();
                    renderBadges();
                }, 600);
            }
        }, 40);
    }

    function spreadLooseFolders() {
        const icons = document.querySelectorAll('.desktop-icon');
        
        let areaWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
        let areaHeight = window.innerHeight || document.documentElement.clientHeight || 768;

        const slots = [
            { x: areaWidth * 0.10, y: areaHeight * 0.15 },
            { x: areaWidth * 0.65, y: areaHeight * 0.20 },
            { x: areaWidth * 0.38, y: areaHeight * 0.45 },
            { x: areaWidth * 0.12, y: areaHeight * 0.68 },
            { x: areaWidth * 0.70, y: areaHeight * 0.65 }
        ];

        icons.forEach((icon, index) => {
            const fName = icon.getAttribute('data-folder');
            
            if (state.iconPositions && state.iconPositions[fName]) {
                const pos = state.iconPositions[fName];
                icon.style.left = `0px`;
                icon.style.top = `0px`;
                icon.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
                icon.setAttribute('data-x', pos.x);
                icon.setAttribute('data-y', pos.y);
            } else {
                const slot = slots[index % slots.length];
                const varianceX = Math.floor(Math.random() * 30) - 15;
                const varianceY = Math.floor(Math.random() * 30) - 15;
                
                const finalX = Math.max(20, Math.min(areaWidth - 130, slot.x + varianceX));
                const finalY = Math.max(50, Math.min(areaHeight - 150, slot.y + varianceY));

                icon.style.left = `0px`;
                icon.style.top = `0px`;
                icon.style.transform = `translate(${finalX}px, ${finalY}px)`;
                icon.setAttribute('data-x', finalX);
                icon.setAttribute('data-y', finalY);
                
                if(!state.iconPositions) state.iconPositions = {};
                state.iconPositions[fName] = { x: finalX, y: finalY };
            }
        });
    }

    function updateSystemClock() {
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        if (clockElement) clockElement.textContent = timeStr;
    }

    function initializeTracking() {
        document.body.addEventListener('click', (e) => {
            if (!e.target.closest('.btn-close')) {
                state.clicks += 1;
            }
            state.lastInteractionTime = Date.now();
            pushMatrixLog(`EVENT: MOUSE_CLICK // TARGET: ${e.target.tagName || 'UNKNOWN'} // CLASS: ${e.target.className || 'NONE'}`);
            
            recalculateInferenceEngine();
            saveState();

            if (e.target && e.target.classList.contains('censor-text-link') && e.target.dataset.ref) {
                pushMatrixLog(`LINK_XREF_TRIGGERED: Target node -> ${e.target.dataset.ref}`);
                openFolderWindow(e.target.dataset.ref);
            }
        });

        document.body.addEventListener('mousemove', (e) => {
            state.lastInteractionTime = Date.now();
            if (state.clicks % 15 === 0) {
                pushMatrixLog(`VECTOR: MOUSE_MOVE // POS: X:${e.clientX} Y:${e.clientY}`);
            }
        });

        document.body.addEventListener('keydown', (e) => {
            state.lastInteractionTime = Date.now();
            state.clicks += 1;
            pushMatrixLog(`EVENT: KEY_DOWN // KEY_CODE: ${e.code}`);
            recalculateInferenceEngine();
            saveState();
        });

        matrixTrigger.addEventListener('click', () => {
            createWindowInstance('MATRIX_LOGGER', 'SYS_LOGGER // RAW_TRAFFIC_FLOW.sh', 'tpl-matrix-terminal');
            matrixLoggingActive = true;
            pushMatrixLog("STREAM_LOGGER CONNECTED. CASCADE PIPELINE ESTABLISHED.");
        });

        setInterval(() => {
            state.totalTime = Math.floor((Date.now() - state.startTime) / 1000);
            
            const timeSinceLastAct = Date.now() - state.lastInteractionTime;
            if (timeSinceLastAct > 4000) {
                state.idleTime += 1;
                pushMatrixLog(`STATE_WARNING: User state assigned as IDLE (${state.idleTime}s total)`);
            } else {
                pushMatrixLog(`TICK: Time total = ${state.totalTime}s // Active confidence ratio sync...`);
            }

            uiThrottlerCount++;
            if (uiThrottlerCount >= 4) {
                uiThrottlerCount = 0;
                updateLiveTelemetryUI();
                recalculateInferenceEngine();
                pushMatrixLog("BATCH_UPDATE: Flujo masivo de datos sincronizado en interfaces periciales.");
            }
            
            const canvas = document.getElementById('forensic-canvas');
            if (canvas && state.cameraGranted && state.snapshotData) {
                const ctx = canvas.getContext('2d');
                const img = new Image();
                img.src = state.snapshotData;
                renderProcessedStaticFrame(canvas, ctx, img);
            }

            saveState();
        }, 1000);

        setupWindowManager();
    }

    function renderBadges() {
        const icons = document.querySelectorAll('.desktop-icon');
        icons.forEach(icon => {
            const fName = icon.getAttribute('data-folder');
            const badge = icon.querySelector('.badge');
            if (badge) {
                if (state.notifiedFolders.includes(fName)) {
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        });
    }

    function updateLiveTelemetryUI() {
        let totalMetricsValue = 0;
        if (state.imageEverOpened && state.canvasReadyToProcess) {
            totalMetricsValue = Math.min(100, state.clicks * 4.0);
        }

        const elements = {
            'm-time': `${state.totalTime}s`,
            'm-clicks': state.clicks,
            'm-folders': `${state.openedFolders.length} / 5`,
            'm-idle': `${state.idleTime}s`,
            'm-revisits': state.revisits,
            'act-order-stream': state.navigationOrder.join(' -> ') || "NINGUNO"
        };

        for (const [id, value] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) {
                if (totalMetricsValue > 50) {
                    el.classList.remove('privacy-masked');
                    el.textContent = value;
                } else {
                    el.classList.add('privacy-masked');
                    el.textContent = "██████";
                }
            }
        }
    }

    function isWindowOpen(id) {
        return document.getElementById(`win-${id}`) !== null;
    }

    function recalculateInferenceEngine() {
        let exploratoryScore = Math.min(100, Math.floor((state.openedFolders.length / 5) * 60 + Math.min(40, state.clicks / 2)));
        let revisitScore = Math.min(100, state.revisits * 25);

        let persistenceScore = 0;
        if (state.totalTime > 0) {
            const activeRatio = (state.totalTime - state.idleTime) / state.totalTime;
            persistenceScore = Math.min(100, Math.floor(activeRatio * 50 + Math.min(50, state.totalTime / 3)));
        }

        let curiosityScore = Math.min(100, Math.floor((state.clicks * 1.5) + (state.revisits * 10)));
        let confidenceScore = Math.min(99, Math.floor((exploratoryScore + revisitScore + persistenceScore + curiosityScore) / 4));
        if (state.openedFolders.length === 5) confidenceScore = Math.min(100, confidenceScore + 15);

        const pExplVal = document.getElementById('p-exploratory-val');
        const pExplBar = document.getElementById('p-exploratory-bar');
        const pRevVal = document.getElementById('p-revisit-val');
        const pRevBar = document.getElementById('p-revisit-bar');
        const pPerVal = document.getElementById('p-persistence-val');
        const pPerBar = document.getElementById('p-persistence-bar');
        const pCurVal = document.getElementById('p-curiosity-val');
        const pCurBar = document.getElementById('p-curiosity-bar');
        const infConf = document.getElementById('inference-confidence');

        if (pExplVal) pExplVal.textContent = `${exploratoryScore}%`;
        if (pExplBar) pExplBar.style.width = `${exploratoryScore}%`;
        if (pRevVal) pRevVal.textContent = `${revisitScore}%`;
        if (pRevBar) pRevBar.style.width = `${revisitScore}%`;
        if (pPerVal) pPerVal.textContent = `${persistenceScore}%`;
        if (pPerBar) pPerBar.style.width = `${persistenceScore}%`;
        if (pCurVal) pCurVal.textContent = `${curiosityScore}%`;
        if (pCurBar) pCurBar.style.width = `${curiosityScore}%`;
        if (infConf) infConf.textContent = `${confidenceScore}%`;

        evaluateCensoredBlocksProgression(exploratoryScore, curiosityScore, confidenceScore);
    }

    function evaluateCensoredBlocksProgression(expl, cur, conf) {
        let textRevealAllowed = false;
        if (state.imageEverOpened && state.canvasReadyToProcess && conf > 30) textRevealAllowed = true;

        const blocks = document.querySelectorAll('.censor-text');
        blocks.forEach((b, index) => {
            if (!textRevealAllowed) return;
            if (index % 3 === 0 && expl > 65) b.classList.add('revealed');
            if (index % 3 === 1 && cur > 75) b.classList.add('revealed');
            if (index % 3 === 2 && conf > 85) b.classList.add('revealed');
        });

        const techFields = document.querySelectorAll('.tech-field');
        techFields.forEach(f => {
            const fieldType = f.getAttribute('data-field');
            if (state.imageEverOpened && state.canvasReadyToProcess && conf > 55) {
                const specs = getTechnicalSpecs();
                if (specs[fieldType]) f.textContent = specs[fieldType];
            } else {
                f.textContent = "█████████████████";
            }
        });

        const subCerteza = document.getElementById('sujeto-certeza');
        const subLang = document.getElementById('sujeto-lang');
        const subGeo = document.getElementById('sujeto-geo');
        const subRadio = document.getElementById('sujeto-radio');
        const subAlert = document.getElementById('sujeto-dinamico-msg');

        if (subCerteza && conf > 15) {
            if (conf < 45) subCerteza.textContent = "BAJO // CORRELACIÓN TÉCNICA PARCIAL";
            else if (conf < 75) {
                subCerteza.textContent = "PROBABLE // COINCIDENCIA COMPORTAMENTAL";
                if(subAlert) subAlert.classList.remove('hidden');
            }
            else subCerteza.textContent = "CRÍTICO // IDENTIDAD ASIMILADA POR TRAZAS";
        }
        if (subLang) subLang.textContent = (navigator.language || navigator.userLanguage || "Desconocido").toUpperCase();
        
        if (subGeo) {
            if (state.geoGranted && state.geoData) {
                if (state.imageEverOpened && state.canvasReadyToProcess && conf > 40) {
                    subGeo.textContent = `REGIONAL: LAT ${state.geoData.lat} / LON ${state.geoData.lon}`;
                    if (subRadio) subRadio.textContent = `± ${state.geoData.acc} METROS`;
                } else {
                    subGeo.textContent = "CALIBRANDO COORDENADAS VECTORES...";
                    if (subRadio) subRadio.textContent = "CÁLCULO EN CURSO";
                }
            } else {
                subGeo.textContent = "ACOTACIÓN NEGADA POR TERMINAL - FILTRADO POR ZONA IP ESTIMADA";
                if (subRadio) subRadio.textContent = "INDETERMINADO (>100km)";
            }
        }

        let currentMilestone = Math.floor((expl + cur + conf) / 20);
        if (currentMilestone > state.lastMilestoneValue) {
            state.lastMilestoneValue = currentMilestone;
            const allBaseFolders = ['EVIDENCIA_VISUAL', 'REGISTROS_TECNICOS', 'SUJETO', 'ACTIVIDAD', 'CLASIFICACION'];
            
            allBaseFolders.forEach(folder => {
                let targetWinId = folder;
                if (folder === 'EVIDENCIA_VISUAL') targetWinId = 'EVIDENCIA_DOCUMENTO';

                if (!isWindowOpen(targetWinId) && !state.notifiedFolders.includes(folder)) {
                    state.notifiedFolders.push(folder);
                }
            });
            renderBadges();
            pushMatrixLog("HEURISTIC MILESTONE BROKEN: Decryption arrays re-notified on dashboard.");
        }
    }

    function setupWindowManager() {
        interact('.window-header').draggable({
            listeners: {
                move(event) {
                    const targetWin = event.target.closest('.os-window');
                    const x = (parseFloat(targetWin.getAttribute('data-x')) || 0) + event.dx;
                    const y = (parseFloat(targetWin.getAttribute('data-y')) || 0) + event.dy;

                    targetWin.style.transform = `translate(${x}px, ${y}px)`;
                    targetWin.setAttribute('data-x', x);
                    targetWin.setAttribute('data-y', y);
                }
            }
        });

        interact('.desktop-icon').draggable({
            listeners: {
                move(event) {
                    const targetIcon = event.target;
                    const x = (parseFloat(targetIcon.getAttribute('data-x')) || 0) + event.dx;
                    const y = (parseFloat(targetIcon.getAttribute('data-y')) || 0) + event.dy;

                    targetIcon.style.transform = `translate(${x}px, ${y}px)`;
                    targetIcon.setAttribute('data-x', x);
                    targetIcon.setAttribute('data-y', y);

                    const fName = targetIcon.getAttribute('data-folder');
                    state.iconPositions[fName] = { x: x, y: y };
                },
                end(event) {
                    const fName = event.target.getAttribute('data-folder');
                    pushMatrixLog(`ICON_DRAG_END: Folder node [${fName}] repositioned.`);
                    saveState();
                }
            }
        });

        const looseIcons = document.querySelectorAll('.desktop-icon');
        looseIcons.forEach(icon => {
            let dragCheckDistance = 0;
            icon.addEventListener('mousedown', () => { dragCheckDistance = 0; });
            icon.addEventListener('mousemove', () => { dragCheckDistance += 1; });
            icon.addEventListener('mouseup', () => {
                if (dragCheckDistance < 3) {
                    const targetFolder = icon.getAttribute('data-folder');
                    openFolderWindow(targetFolder);
                }
            });
        });

        windowLayer.addEventListener('mousedown', (e) => {
            const clickedWin = e.target.closest('.os-window');
            if (clickedWin) {
                focusWindow(clickedWin);
            }
        }, true);
    }

    function focusWindow(winEl) {
        document.querySelectorAll('.os-window').forEach(w => w.classList.remove('active-window'));
        winEl.classList.add('active-window');
        pushMatrixLog(`WINDOW_FOCUS: Shifted layer target to [${winEl.id}]`);
    }

    function openFolderWindow(folderName) {
        pushMatrixLog(`FOLDER_OPEN_REQUEST: Accessing node [${folderName}]`);
        
        if (folderName === 'EVIDENCIA_VISUAL' && !state.imageEverOpened) {
            state.imageEverOpened = true;
            state.canvasReadyToProcess = false; 
            pushMatrixLog("FLAG_ACTIVATED: Canal visual invocado. Render forzado a la base degradada 0%.");
        }

        state.notifiedFolders = state.notifiedFolders.filter(f => f !== folderName);
        renderBadges();

        if (!state.openedFolders.includes(folderName)) {
            state.openedFolders.push(folderName);
        } else {
            state.revisits += 1;
        }

        if (state.folderOpenCounts[folderName] !== undefined) {
            state.folderOpenCounts[folderName] += 1;
        }

        state.navigationOrder.push(folderName);
        if (state.navigationOrder.length > 8) state.navigationOrder.shift();

        saveState();

        if (folderName === 'EVIDENCIA_VISUAL') {
            createWindowInstance('EVIDENCIA_DOCUMENTO', 'INFORME_METADATOS.txt', 'tpl-evidencia-doc');
            createWindowInstance('EVIDENCIA_IMAGEN', 'VISOR_RECONSTRUCCIÓN.raw', 'tpl-evidencia-viewer');
            
            setTimeout(() => { 
                initializeForensicCanvasRendering(); 
                state.canvasReadyToProcess = true; 
            }, 150);
        } else if (folderName === 'REGISTROS_TECNICOS') {
            createWindowInstance('REGISTROS_TECNICOS', 'EXTRACCIÓN_SISTEMA.log', 'tpl-registros');
        } else if (folderName === 'SUJETO') {
            createWindowInstance('SUJETO', 'ANÁLISIS_ENTORNO_OPERADOR.doc', 'tpl-sujeto');
        } else if (folderName === 'ACTIVIDAD') {
            createWindowInstance('ACTIVIDAD', 'LOG_CADENCIA_INTERACTIVA.dat', 'tpl-actividad');
            updateLiveTelemetryUI();
        } else if (folderName === 'CLASIFICACION') {
            createWindowInstance('CLASIFICACION', 'MATRIZ_INFERENCIA_HEURÍSTICA.bin', 'tpl-clasificacion');
            recalculateInferenceEngine();
        }
    }

    function createWindowInstance(id, title, templateId) {
        const existing = document.getElementById(`win-${id}`);
        if (existing) {
            focusWindow(existing);
            return;
        }

        const template = document.getElementById(templateId);
        if (!template) return;

        const win = document.createElement('div');
        win.id = `win-${id}`;
        win.classList.add('os-window');
        
        win.innerHTML = `
            <div class="window-header">
                <span class="window-title">${title}</span>
                <div class="window-controls">
                    <button class="btn-close">✕</button>
                </div>
            </div>
            <div class="window-content"></div>
        `;

        const contentTarget = win.querySelector('.window-content');
        contentTarget.appendChild(template.content.cloneNode(true));

        win.querySelector('.btn-close').addEventListener('click', () => {
            if (id === 'MATRIX_LOGGER') matrixLoggingActive = false;
            if (id === 'EVIDENCIA_IMAGEN') state.canvasReadyToProcess = false; 
            win.remove();
            pushMatrixLog(`WINDOW_CLOSED: Destroyed runtime node [win-${id}]`);
        });

        win.style.width = `${WIN_WIDTH_DEFAULT}px`;
        win.style.height = `${WIN_HEIGHT_DEFAULT}px`;
        
        let areaWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
        let areaHeight = window.innerHeight || document.documentElement.clientHeight || 768;

        let maxX = areaWidth - WIN_WIDTH_DEFAULT - 20;
        let maxY = areaHeight - WIN_HEIGHT_DEFAULT - 40;

        let randomX = Math.max(10, Math.floor(Math.random() * maxX));
        let randomY = Math.max(40, Math.floor(Math.random() * maxY));

        win.style.transform = `translate(${randomX}px, ${randomY}px)`;
        win.setAttribute('data-x', randomX);
        win.setAttribute('data-y', randomY);

        windowLayer.appendChild(win);
        focusWindow(win);
    }

    function initializeForensicCanvasRendering() {
        const canvas = document.getElementById('forensic-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const errorMsg = document.getElementById('cam-denied-msg');

        if (!state.cameraGranted || !state.snapshotData) {
            if (errorMsg) errorMsg.classList.remove('hidden');
            canvas.style.display = 'none';
            return;
        }

        if (errorMsg) errorMsg.classList.add('hidden');
        canvas.style.display = 'block';

        const img = new Image();
        img.src = state.snapshotData;
        img.onload = () => {
            renderProcessedStaticFrame(canvas, ctx, img);
        };
    }

    // --- DESGLITCHEO ACELERADO DIRECTO POR CLICKS (4% POR ACCIÓN) ---
    function renderProcessedStaticFrame(canvas, ctx, img) {
        let totalMetricsValue = 0;
        
        if (state.imageEverOpened && state.canvasReadyToProcess) {
            // Ajustado a 4% directo para que con ~25 clicks se limpie al 100%
            let clickScore = state.clicks * 4.0;
            totalMetricsValue = Math.min(100, clickScore);
        }

        // Umbrales limpios basados en tus clicks acumulados
        let pixelSize = 80; 
        if (totalMetricsValue > 20)  pixelSize = 48; // Transición rápida inicial
        if (totalMetricsValue > 45)  pixelSize = 24; // Silueta general asentada
        if (totalMetricsValue > 70)  pixelSize = 8;  // Rasgos faciales legibles
        if (totalMetricsValue >= 95) pixelSize = 1;  // Reconstrucción forense perfecta al 100%

        const w = canvas.width;
        const h = canvas.height;

        ctx.drawImage(img, 0, 0, w, h);

        if (pixelSize > 1) {
            const sw = Math.ceil(w / pixelSize);
            const sh = Math.ceil(h / pixelSize);
            
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = sw;
            tmpCanvas.height = sh;
            const tmpCtx = tmpCanvas.getContext('2d');
            
            tmpCtx.drawImage(canvas, 0, 0, w, h, 0, 0, sw, sh);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tmpCanvas, 0, 0, sw, sh, 0, 0, w, h);
        }

        const integrityLabels = document.querySelectorAll('.img-integrity-val');
        integrityLabels.forEach(l => l.textContent = `${totalMetricsValue.toFixed(2)}%`);

        const deconVal = document.getElementById('decon-val');
        const deconBar = document.getElementById('decon-bar');
        if (deconVal) deconVal.textContent = `${Math.floor(totalMetricsValue)}%`;
        if (deconBar) deconBar.style.width = `${totalMetricsValue}%`;
    }

    function getTechnicalSpecs() {
        const ua = navigator.userAgent;
        let browser = "Navegador Indefinido";
        if (ua.indexOf("Firefox") > -1) browser = "Mozilla Firefox Engine";
        else if (ua.indexOf("SamsungBrowser") > -1) browser = "Samsung Mobile Browser";
        else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browser = "Opera System Core";
        else if (ua.indexOf("Trident") > -1) browser = "Legacy Internet Explorer";
        else if (ua.indexOf("Edge") > -1 || ua.indexOf("Edg") > -1) browser = "Microsoft Edge Subsystem";
        else if (ua.indexOf("Chrome") > -1) browser = "Google Chrome / Chromium Core";
        else if (ua.indexOf("Safari") > -1) browser = "Apple Safari Engine Infrastructure";

        let os = "Distribución Desconocida";
        if (ua.indexOf("Windows NT 10.0") > -1) os = "Microsoft Windows 10/11 Terminal Architecture";
        else if (ua.indexOf("Windows NT 6.2") > -1) os = "Windows 8 Architecture Standard";
        else if (ua.indexOf("Macintosh") > -1) os = "Apple macOS Architecture Darwin Node";
        else if (ua.indexOf("X11") > -1) os = "Linux UNIX Base System Infrastructure";
        else if (ua.indexOf("Android") > -1) os = "Google Android Linux Kernel Subsystem";
        else if (ua.indexOf("iPhone") > -1) os = "Apple iOS Mobile Core Node";

        let gpu = "Procesador Gráfico Genérico / Desconocido";
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
            }
        } catch(e) {}

        let connectionType = "Estable / Acceso de Red de Banda Ancha";
        if (navigator.connection) {
            connectionType = `Protocolo Extrapolado: ${navigator.connection.effectiveType || 'Desconocido'} / RTT estimado: ${navigator.connection.rtt || 'N/A'}ms`;
        }

        return {
            os: os,
            browser: browser,
            gpu: gpu,
            lang: (navigator.language || "es").toUpperCase(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC/GMT Offset",
            resolution: `${window.screen.width} x ${window.screen.height} píxeles`,
            connection: connectionType
        };
    }
})();