const Scheduler = {
    generateWeeklyBlock(mondayDate, state) {
        const config = state.config;
        const users = state.users;
        const holidays = state.holidays;
        const weekDates = Utils.getDatesForWeekByMonday(mondayDate);
        const currentYear = mondayDate.getFullYear();
        const weekNum = Utils.getWeekNumber(mondayDate);
        
        const midWeekDate = new Date(mondayDate);
        midWeekDate.setDate(mondayDate.getDate() + 3);
        const currentMonth = midWeekDate.getMonth();

        const unavailableTechs = new Set();
        weekDates.forEach(dateStr => {
            state.vacaciones.forEach(vac => {
                if (vac.startDate <= dateStr && vac.endDate >= dateStr) {
                    unavailableTechs.add(vac.userId);
                }
            });
        });

        const availableTechs = users.filter(u => !unavailableTechs.has(u.id));
        const seniors = availableTechs.filter(u => u.profile === "senior");
        const standards = availableTechs.filter(u => u.profile === "standard");
        const historyStats = this.computeHistoricalStats(state, currentYear, weekNum, currentMonth);

        let bestPair = null;
        let minCombinedScore = Infinity;

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

        if (!bestPair || minCombinedScore >= config.scoringWeights.consecutiveTarde) {
            return {
                success: false,
                msg: "Restricción dura violada. Intervención manual requerida."
            };
        }

        const weeklyAssignments = {};
        weekDates.forEach(dateStr => {
            const dayHoliday = holidays[dateStr];
            if (dayHoliday && dayHoliday.type === "global") {
                weeklyAssignments[dateStr] = { mañana: [], tarde: [], vacaciones: users.map(u => u.id) };
                return;
            }

            const morningTeam = [];
            const afternoonTeam = [bestPair.senior.id, bestPair.standard.id];
            const vacationTeam = [];

            users.forEach(u => {
                if (state.vacaciones.some(v => v.startDate <= dateStr && v.endDate >= dateStr && v.userId === u.id)) {
                    vacationTeam.push(u.id);
                } else if (u.id !== bestPair.senior.id && u.id !== bestPair.standard.id) {
                    morningTeam.push(u.id);
                }
            });

            weeklyAssignments[dateStr] = {
                mañana: morningTeam,
                tarde: afternoonTeam,
                vacaciones: vacationTeam
            };
        });

        return { success: true, assignments: weeklyAssignments };
    },

    calculateTechnicianPenalty(tech, stats, targetWeek, config) {
        let score = 0;
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

        const processedWeeks = new Set();
        Object.keys(state.schedule).forEach(dateStr => {
            const d = new Date(dateStr);
            if (d.getFullYear() !== year) return;
            const wk = Utils.getWeekNumber(d);
            if (wk >= targetWeek) return;

            const dayObj = state.schedule[dateStr];
            dayObj.tarde.forEach(uid => {
                if (!stats[uid]) return;
                if (!processedWeeks.has(`${wk}-${uid}`)) {
                    stats[uid].annualTardeWeeks++;
                    processedWeeks.add(`${wk}-${uid}`);
                }
                if (wk === targetWeek - 1) stats[uid].lastWeekTarde = wk;
                
                const mid = new Date(d); mid.setDate(mid.getDate() + 3);
                if (mid.getMonth() === targetMonth && !processedWeeks.has(`m-${wk}-${uid}`)) {
                    stats[uid].tardeWeeksInCurrentMonth++;
                    processedWeeks.add(`m-${wk}-${uid}`);
                }
                if (state.holidays[dateStr] && state.holidays[dateStr].type === "legal") {
                    stats[uid].annualLegalHolidaysWorked++;
                }
            });
        });
        return stats;
    }
};