/**
 * AEQUITAS WFM - CORE SCHEDULING ENGINE
 * ROMS & CONSTRAINT VALIDATOR - VERSION v0.3 PRO
 */
const Scheduler = {
    generateWeeklyBlock(mondayDate, state) {
        const config = state.config;
        const users = state.users;
        const holidays = state.holidays;
        
        // Clonar la fecha para evitar mutaciones de punteros en los bucles superiores
        const baseMonday = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate(), 0, 0, 0, 0);
        const weekDates = Utils.getDatesForWeekByMonday(baseMonday);
        const currentYear = baseMonday.getFullYear();
        const weekNum = Utils.getWeekNumber(baseMonday);
        
        // Calcular el mes de corte real usando el jueves de la semana en curso (Norma ISO)
        const midWeekDate = new Date(baseMonday.getFullYear(), baseMonday.getMonth(), baseMonday.getDate() + 3);
        const currentMonth = midWeekDate.getMonth();

        // 1. Detectar técnicos de vacaciones en este bloque semanal
        const unavailableTechs = new Set();
        weekDates.forEach(dateStr => {
            if (state.vacaciones && Array.isArray(state.vacaciones)) {
                state.vacaciones.forEach(vac => {
                    if (vac.startDate <= dateStr && vac.endDate >= dateStr) {
                        unavailableTechs.add(vac.userId);
                    }
                });
            }
        });

        const availableTechs = users.filter(u => !unavailableTechs.has(u.id));
        const seniors = availableTechs.filter(u => u.profile === "senior");
        const standards = availableTechs.filter(u => u.profile === "standard");
        
        // 2. Extraer métricas históricas de balance de carga anual limpia
        const historyStats = this.computeHistoricalStats(state, currentYear, weekNum, currentMonth);

        let bestPair = null;
        let minCombinedScore = Infinity;
        let hardViolationTriggered = false;

        // 3. Ejecutar emparejamiento reglamentario (1 Senior + 1 Standard)
        for (let s of seniors) {
            for (let st of standards) {
                const sPen = this.calculateTechnicianPenalty(s, historyStats[s.id], weekNum, config);
                const stPen = this.calculateTechnicianPenalty(st, historyStats[st.id], weekNum, config);
                let pairScore = sPen.score + stPen.score;

                if (pairScore < minCombinedScore) {
                    minCombinedScore = pairScore;
                    bestPair = { senior: s, standard: st };
                }
            }
        }

        // 4. Mecanismo de Fallback de Cobertura: Romper restricciones blandas si las vacaciones impiden un par limpio
        if (!bestPair || minCombinedScore >= config.scoringWeights.consecutiveTarde) {
            hardViolationTriggered = true;
            if (availableTechs.length >= 2) {
                minCombinedScore = Infinity;
                for (let i = 0; i < availableTechs.length; i++) {
                    for (let j = i + 1; j < availableTechs.length; j++) {
                        const t1 = availableTechs[i];
                        const t2 = availableTechs[j];
                        const p1 = this.calculateTechnicianPenalty(t1, historyStats[t1.id], weekNum, config);
                        const p2 = this.calculateTechnicianPenalty(t2, historyStats[t2.id], weekNum, config);
                        let totalFallbackScore = p1.score + p2.score;
                        
                        if (totalFallbackScore < minCombinedScore) {
                            minCombinedScore = totalFallbackScore;
                            bestPair = { senior: t1, standard: t2 };
                        }
                    }
                }
            }
        }

        // Si es matemáticamente imposible cubrir el servicio (menos de 2 personas totales libres)
        if (!bestPair) {
            return { success: false, msg: "Fallo crítico: No hay personal suficiente para cubrir las alertas mínimas del servicio." };
        }

        // 5. Inyectar asignación estructural de turnos semanales estables
        const weeklyAssignments = {};
        weekDates.forEach(dateStr => {
            const dayHoliday = holidays[dateStr];
            
            // Si el día es de cierre global estricto, el cuadrante se vacía automáticamente
            if (dayHoliday && dayHoliday.type === "global") {
                weeklyAssignments[dateStr] = { mañana: [], tarde: [], vacaciones: users.map(u => u.id), hardViolation: false };
                return;
            }

            const morningTeam = [];
            const afternoonTeam = [bestPair.senior.id, bestPair.standard.id];
            const vacationTeam = [];

            users.forEach(u => {
                const isOnVacation = state.vacaciones && state.vacaciones.some(v => v.startDate <= dateStr && v.endDate >= dateStr && v.userId === u.id);
                if (isOnVacation) {
                    vacationTeam.push(u.id);
                } else if (u.id !== bestPair.senior.id && u.id !== bestPair.standard.id) {
                    morningTeam.push(u.id);
                }
            });

            weeklyAssignments[dateStr] = {
                mañana: morningTeam,
                tarde: afternoonTeam,
                vacaciones: vacationTeam,
                hardViolation: hardViolationTriggered
            };
        });

        return { 
            success: true, 
            assignments: weeklyAssignments, 
            hardViolation: hardViolationTriggered,
            msg: "Asignación forzada por solapamiento de ausencias."
        };
    },

    calculateTechnicianPenalty(tech, stats, targetWeek, config) {
        let score = 0;
        if (!stats) return { score: 0 };
        
        if (stats.lastWeekTarde === targetWeek - 1) score += config.scoringWeights.consecutiveTarde;
        if (stats.tardeWeeksInCurrentMonth >= 3) score += config.scoringWeights.threeWeeksInMonth;
        else if (stats.tardeWeeksInCurrentMonth === 2) score += config.scoringWeights.twoWeeksInMonth;

        score += stats.annualTardeWeeks * config.scoringWeights.annualTardeHours;
        score += stats.annualLegalHolidaysWorked * config.scoringWeights.annualLegalHolidays;
        return { score };
    },

    computeHistoricalStats(state, year, targetWeek, targetMonth) {
        const stats = {};
        state.users.forEach(u => {
            stats[u.id] = { annualTardeWeeks: 0, annualLegalHolidaysWorked: 0, lastWeekTarde: -99, tardeWeeksInCurrentMonth: 0 };
        });

        if (!state.schedule) return stats;

        const processedWeeks = new Set();
        Object.keys(state.schedule).sort().forEach(dateStr => {
            const d = Utils.parseLocalDate(dateStr);
            if (d.getFullYear() !== year) return;
            
            const wk = Utils.getWeekNumber(d);
            if (wk >= targetWeek) return;

            const dayObj = state.schedule[dateStr];
            if (!dayObj || !dayObj.tarde) return;

            dayObj.tarde.forEach(uid => {
                if (!stats[uid]) return;
                
                if (!processedWeeks.has(`annual-${wk}-${uid}`)) {
                    stats[uid].annualTardeWeeks++;
                    processedWeeks.add(`annual-${wk}-${wk}-${uid}`);
                }
                
                if (wk === targetWeek - 1) stats[uid].lastWeekTarde = wk;
                
                const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (4 - (d.getDay() || 7)));
                if (mid.getMonth() === targetMonth) {
                    if (!processedWeeks.has(`month-${targetMonth}-${wk}-${uid}`)) {
                        stats[uid].tardeWeeksInCurrentMonth++;
                        processedWeeks.add(`month-${targetMonth}-${wk}-${uid}`); // Hotfix: Sincronización de claves corregida
                    }
                }
                if (state.holidays[dateStr] && state.holidays[dateStr].type === "legal") {
                    stats[uid].annualLegalHolidaysWorked++;
                }
            });
        });
        return stats;
    }
};
