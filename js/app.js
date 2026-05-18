let appState = { users: [], holidays: [], config: {}, schedule: {}, vacaciones: [], currentDate: new Date("2026-07-01"), currentView: "month", isAdmin: false };

document.addEventListener("DOMContentLoaded", async () => { await initializeApplication(); });

async function initializeApplication() {
    const local = GitHubSync.loadLocalState();
    const cacheBust = `?v=${Date.now()}`;
    
    try {
        const [cRes, uRes, hRes] = await Promise.all([
            fetch(`data/config.json${cacheBust}`),
            fetch(`data/users.json${cacheBust}`),
            fetch(`data/holidays.json${cacheBust}`)
        ]);
        
        appState.config = await cRes.json();
        appState.users = await uRes.json();
        appState.holidays = await hRes.json();

        if (local) {
            appState.schedule = local.schedule || {};
            appState.vacaciones = local.vacaciones || [];
            if (local.currentDate) appState.currentDate = new Date(local.currentDate);
        } else {
            appState.schedule = {};
            appState.vacaciones = [];
            GitHubSync.saveLocalState(appState);
        }
    } catch(e) { 
        console.error("Error crítico de inicialización de datos desde el repositorio:", e); 
    }

    const passwordInput = document.getElementById("admin-password-input");
    if (passwordInput) {
        passwordInput.removeAttribute("onkeydown");
        passwordInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                handleAdminLoginSubmit();
            }
        });
    }

    renderHeader(); renderActiveRulesPanel(); renderMainWorkspace(); renderEquidadWidget();
}

function renderHeader() {
    const btn = document.getElementById("admin-action-btn");
    btn.innerText = appState.isAdmin ? "Cerrar Modo Admin" : "Modo Administrador";
    document.getElementById("admin-indicator").classList.toggle("hidden", !appState.isAdmin);
}

function renderActiveRulesPanel() { 
    document.getElementById("active-rules-container").classList.toggle("hidden", !appState.isAdmin); 
}

function toggleAdminMode() {
    if (appState.isAdmin) { 
        appState.isAdmin = false; renderHeader(); renderActiveRulesPanel(); renderMainWorkspace(); 
    } else { 
        document.getElementById("login-modal").classList.remove("hidden"); document.getElementById("admin-password-input").focus(); 
    }
}

async function handleAdminLoginSubmit() {
    const inp = document.getElementById("admin-password-input");
    if (!inp || !inp.value || inp.value.trim() === "") return;

    const plainPassword = inp.value;
    inp.value = "";
    const hash = await Utils.hashPassword(plainPassword);
    
    if (hash === appState.config.adminPasswordHash) {
        appState.isAdmin = true; 
        document.getElementById("login-modal").classList.add("hidden");
        renderHeader(); renderActiveRulesPanel(); renderMainWorkspace(); renderEquidadWidget();
    } else { 
        alert("Acceso Denegado: Contraseña Incorrecta"); 
    }
}

function switchView(v) { appState.currentView = v; renderMainWorkspace(); }

function navigateTime(d) {
    if (appState.currentView === "month") appState.currentDate.setMonth(appState.currentDate.getMonth() + d);
    else appState.currentDate.setDate(appState.currentDate.getDate() + (d * 7));
    renderMainWorkspace();
}

function renderMainWorkspace() {
    const title = document.getElementById("workspace-title");
    const grid = document.getElementById("calendar-grid-workspace"); grid.innerHTML = "";
    
    if (appState.currentView === "month") {
        const y = appState.currentDate.getFullYear(), m = appState.currentDate.getMonth();
        title.innerText = `${appState.currentDate.toLocaleString('es', {month:'long'})} ${y}`.toUpperCase();
        grid.className = "grid grid-cols-7 gap-2";
        ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].forEach(h => grid.innerHTML += `<div class='text-center font-bold text-xs text-slate-500 py-1'>${h}</div>`);
        
        let start = Utils.getMondayOfDate(new Date(y, m, 1));
        for (let i = 0; i < 35; i++) {
            grid.innerHTML += buildDayCellHtml(start, Utils.formatDate(start), m);
            start.setDate(start.getDate() + 1);
        }
    } else {
        const mon = Utils.getMondayOfDate(appState.currentDate);
        title.innerText = `SEMANA ${Utils.getWeekNumber(mon)} - ${mon.getFullYear()}`;
        grid.className = "space-y-3";
        Utils.getDatesForWeekByMonday(mon).forEach(dStr => grid.innerHTML += buildWeeklyRowHtml(new Date(dStr), dStr));
    }
    renderEquidadWidget();
}

function buildDayCellHtml(date, dStr, targetMonth) {
    const isCur = date.getMonth() === targetMonth;
    const hol = appState.holidays[dStr];
    const dayData = appState.schedule[dStr] || { mañana: [], tarde: [], vacaciones: [] };
    let badge = hol ? `<span class='text-[9px] px-1.5 py-0.5 rounded font-bold uppercase truncate ${hol.type==='legal'?'bg-amber-500/20 text-amber-300 border border-amber-500/30':hol.type==='global'?'bg-rose-500/20 text-rose-300 border border-rose-500/30':'bg-blue-500/20 text-blue-300 border border-blue-500/30'}'>${hol.type}</span>` : "";
    const vCount = appState.vacaciones.filter(v => v.startDate <= dStr && v.endDate >= dStr).length;
    
    const mNames = dayData.mañana.map(id => appState.users.find(u => u.id === id)?.name || id).join(', ') || 'Ninguno';
    const tNames = dayData.tarde.map(id => appState.users.find(u => u.id === id)?.name || id).join(', ') || 'Ninguno';

    let borderAlert = dayData.hardViolation ? "border-rose-500/50 bg-rose-950/10" : "";

    return `
        <div onclick="openManualEditModal('${dStr}')" class="calendar-grid-cell p-3 rounded-xl border ${borderAlert ? borderAlert : 'border-slate-800/80'} ${isCur && !borderAlert ? 'bg-slate-900' : !isCur && !borderAlert ? 'bg-slate-900/40 text-slate-600' : ''} cursor-pointer hover:border-indigo-500/50 tooltip-trigger relative group shadow-inner">
            <div class='flex justify-between items-center'><span class='text-xs font-bold'>${date.getDate()}</span>${badge}</div>
            <div class='mt-2 text-[10px] space-y-1'>
                ${dayData.tarde.length > 0 ? `<div class='bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded truncate font-medium'>Tarde: ${dayData.tarde.length}</div>` : ''}
            </div>
            <div class='absolute bottom-2 left-3 right-3 flex justify-between text-[10px] text-slate-500 border-t border-slate-800/60 pt-1'>
                <span>M:${dayData.mañana.length} T:${dayData.tarde.length}</span>
                ${vCount > 0 ? `<span class='text-rose-400 font-bold bg-rose-500/10 px-1 rounded text-[9px]'>V:${vCount}</span>` : ''}
            </div>
            <div class="tooltip-content absolute z-50 bottom-full left-1/2 mb-2 w-48 bg-slate-950 border border-slate-800 p-2.5 rounded-xl shadow-2xl pointer-events-none text-[11px] text-slate-400 space-y-1">
                <div class="font-bold text-indigo-400">${dStr}</div>
                <div><span class="text-emerald-400 font-medium">Mañana:</span> ${mNames}</div>
                <div><span class="text-indigo-400 font-medium">Tarde:</span> ${tNames}</div>
                ${dayData.hardViolation ? `<div class="text-rose-400 font-bold pt-1 border-t border-slate-800">⚠️ Requiere corrección manual</div>` : ''}
            </div>
        </div>`;
}

function buildWeeklyRowHtml(date, dStr) {
    const dayData = appState.schedule[dStr] || { mañana: [], tarde: [], vacaciones: [] };
    const mN = dayData.mañana.map(id => appState.users.find(u=>u.id===id)?.name || id).join(', ') || 'Ninguno';
    const tN = dayData.tarde.map(id => appState.users.find(u=>u.id===id)?.name || id).join(', ') || 'Ninguno';
    const vN = appState.vacaciones.filter(v => v.startDate <= dStr && v.endDate >= dStr).map(v => appState.users.find(u=>u.id===v.userId)?.name || v.userId).join(', ') || 'Ninguno';
    return `
    <div class='bg-slate-900 border border-slate-800 rounded-xl p-4 flex gap-4 text-xs shadow-md hover:border-slate-700/60 transition'>
        <div class='w-1/4 font-bold text-slate-300 flex flex-col justify-center'>
            <span class="capitalize text-sm text-indigo-400">${date.toLocaleDateString('es', {weekday:'long'})}</span>
            <span class="text-slate-500 text-[11px]">${date.toLocaleDateString('es', {day:'numeric', month:'short'})}</span>
        </div>
        <div class='w-3/4 grid grid-cols-1 sm:grid-cols-3 gap-3'>
            <div class='p-2 bg-slate-950/60 border border-slate-800/60 rounded-lg'><strong class="text-emerald-400 block mb-1">Mañana:</strong> <span class='text-slate-300 text-[11px]'>${mN}</span></div>
            <div class='p-2 bg-slate-950/60 border border-slate-800/60 rounded-lg'><strong class="text-indigo-400 block mb-1">Tarde:</strong> <span class='text-slate-300 text-[11px]'>${tN}</span></div>
            <div class='p-2 bg-slate-950/60 border border-slate-800/60 rounded-lg'><strong class="text-rose-400 block mb-1">Vacaciones:</strong> <span class='text-slate-400 text-[11px]'>${vN}</span></div>
        </div>
    </div>`;
}

function handleAutoGenerateTrigger() {
    if(!appState.isAdmin) return alert("Acceso denegado: Habilite el modo Administrador.");
    const s = document.getElementById("gen-start-date").value, e = document.getElementById("gen-end-date").value;
    if(!s || !e) return alert("Por favor, introduzca un rango de fechas coherente.");
    
    let curr = Utils.getMondayOfDate(Utils.parseLocalDate(s));
    let limit = Utils.parseLocalDate(e);
    let count = 0;
    let fallbackWarnings = [];

    while(curr <= limit) {
        const res = Scheduler.generateWeeklyBlock(curr, appState);
        if(res.success) { 
            appState.schedule = { ...appState.schedule, ...res.assignments }; 
            if (res.hardViolation) {
                fallbackWarnings.push(`Semana ${Utils.getWeekNumber(curr)}: ${res.msg}`);
            }
            count++; 
        } else {
            fallbackWarnings.push(`Semana ${Utils.getWeekNumber(curr)}: ${res.msg}`);
        }
        curr.setDate(curr.getDate() + 7);
    }
    
    GitHubSync.saveLocalState(appState); 
    renderMainWorkspace(); 
    
    if (fallbackWarnings.length > 0) {
        alert(`Planificación procesada para ${count} semanas.\n\n[AVISO DE REVISIÓN MANUAL]:\n` + fallbackWarnings.join("\n"));
    } else {
        alert(`Planificación completada con éxito para ${count} semanas sin conflictos de restricciones.`);
    }
}

function openVacationManagementModal() { document.getElementById("vacation-modal").classList.remove("hidden"); renderVacationModalList(); }

function renderVacationModalList() {
    const sel = document.getElementById("vac-user-select"); sel.innerHTML = "";
    appState.users.forEach(u => sel.innerHTML += `<option value="${u.id}">${u.name}</option>`);
    const list = document.getElementById("active-vacations-list"); list.innerHTML = "";
    appState.vacaciones.forEach((v, idx) => {
        const u = appState.users.find(user => user.id === v.userId);
        list.innerHTML += `
        <div class='flex justify-between items-center bg-slate-950 border border-slate-800 p-2 rounded-xl text-xs'>
            <span><strong class="text-indigo-400">${u?u.name:v.userId}</strong>: ${v.startDate} al ${v.endDate}</span>
            ${appState.isAdmin?`<button onclick='removeVacationBlock(${idx})' class='text-rose-400 hover:text-rose-300 font-bold px-2'>Eliminar</button>`:''}
        </div>`;
    });
}

function handleAddVacationSubmit() {
    if(!appState.isAdmin) return alert("Acción protegida. Entre en modo admin.");
    const uid = document.getElementById("vac-user-select").value, s = document.getElementById("vac-start-date").value, e = document.getElementById("vac-end-date").value;
    if(!s || !e) return alert("Rellene los campos obligatorios.");
    if(s >= "2026-07-15") {
        const dS = new Date(s), dE = new Date(e);
        if(dS.getDay() !== 1 || dE.getDay() !== 0 || ((dE-dS)/86400000)+1 < 7) {
            return alert("Restricción Legal 2026: Las vacaciones a partir del 15/07 deben constar de semanas íntegras de Lunes a Domingo (mínimo 7 días consecutivos).");
        }
    }
    appState.vacaciones.push({ userId: uid, startDate: s, endDate: e });
    GitHubSync.saveLocalState(appState); renderVacationModalList(); renderMainWorkspace();
}

function removeVacationBlock(idx) { appState.vacaciones.splice(idx,1); GitHubSync.saveLocalState(appState); renderVacationModalList(); renderMainWorkspace(); }

let activeManualDate = "";
function openManualEditModal(dStr) {
    if(!appState.isAdmin) return; activeManualDate = dStr;
    document.getElementById("manual-edit-modal-title").innerText = `Edición Manual: ${dStr}`;
    const dayData = appState.schedule[dStr] || { mañana: [], tarde: [], vacaciones: [] };
    const cont = document.getElementById("manual-users-assignment-list"); cont.innerHTML = "";
    appState.users.forEach(u => {
        let cur = "libre"; if(dayData.mañana.includes(u.id)) cur = "mañana"; else if(dayData.tarde.includes(u.id)) cur = "tarde";
        cont.innerHTML += `
        <div class='flex justify-between items-center py-2 border-b border-slate-800 text-xs text-slate-300'>
            <span>${u.name}</span>
            <select id='manual-sel-${u.id}' class='bg-slate-950 border border-slate-700 text-white rounded-lg p-1 text-xs focus:outline-none'><option value='mañana' ${cur==='mañana'?'selected':''}>Mañana</option><option value='tarde' ${cur==='tarde'?'selected':''}>Tarde</option><option value='libre' ${cur==='libre'?'selected':''}>Libre</option></select>
        </div>`;
    });
    document.getElementById("manual-edit-modal").classList.remove("hidden");
}

function handleSaveManualEditSubmit() {
    const dStr = activeManualDate; const dayData = { mañana: [], tarde: [], vacaciones: [] };
    appState.users.forEach(u => {
        const val = document.getElementById(`manual-sel-${u.id}`).value;
        if(val === "mañana") dayData.mañana.push(u.id); else if(val === "tarde") dayData.tarde.push(u.id);
    });
    appState.schedule[dStr] = dayData; GitHubSync.saveLocalState(appState);
    document.getElementById("manual-edit-modal").classList.add("hidden"); renderMainWorkspace();
}

function renderEquidadWidget() {
    const cont = document.getElementById("equidad-widget-container"); cont.innerHTML = "";
    const stats = Report.compileStats(appState, "2026-01-01", "2026-12-31");
    Object.values(stats).forEach(s => {
        cont.innerHTML += `
        <div class='p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-[11px] space-y-1.5 shadow-sm'>
            <div class='flex justify-between font-bold text-slate-200'><span>${s.name}</span><span class="text-indigo-400 font-mono">${s.totalHours}h</span></div>
            <div class='text-slate-500 flex justify-between text-[10px]'><span>Tardes: <strong class="text-indigo-300">${s.afternoonDays}d</strong></span><span>Festivos Leg.: <strong class="text-amber-400">${s.legalHolidayDays}d</strong></span></div>
        </div>`;
    });
}
