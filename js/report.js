const Report = {
    compileStats(state, startDateStr, endDateStr) {
        const stats = {};
        state.users.forEach(u => {
            stats[u.id] = { 
                name: u.name, profile: u.profile, 
                morningDays: 0, morningHours: 0, 
                afternoonDays: 0, afternoonHours: 0, 
                legalHolidayDays: 0, legalHolidayHours: 0, 
                madridDays: 0, madridHours: 0, 
                totalHours: 0 
            };
        });

        Object.keys(state.schedule).forEach(dateStr => {
            if (dateStr < startDateStr || dateStr > endDateStr) return;
            const dayAssign = state.schedule[dateStr];
            const holiday = state.holidays[dateStr];
            const isLegal = holiday && holiday.type === "legal";
            const isMadrid = holiday && holiday.type === "madrid";

            dayAssign.mañana.forEach(uid => {
                if (!stats[uid]) return;
                stats[uid].morningDays++; stats[uid].morningHours += 9; stats[uid].totalHours += 9;
                if (isLegal) { stats[uid].legalHolidayDays++; stats[uid].legalHolidayHours += 9; }
                if (isMadrid) { stats[uid].madridDays++; stats[uid].madridHours += 9; }
            });

            dayAssign.tarde.forEach(uid => {
                if (!stats[uid]) return;
                stats[uid].afternoonDays++; stats[uid].afternoonHours += 9; stats[uid].totalHours += 9;
                if (isLegal) { stats[uid].legalHolidayDays++; stats[uid].legalHolidayHours += 9; }
                if (isMadrid) { stats[uid].madridDays++; stats[uid].madridHours += 9; }
            });
        });
        return stats;
    },

    exportCSV(state, startDateStr, endDateStr, label) {
        const stats = this.compileStats(state, startDateStr, endDateStr);
        const rows = [["Técnico", "Perfil", "Días Mañana", "Horas Mañana", "Días Tarde", "Horas Tarde", "Días Festivo Legal", "Horas Festivo Legal", "Días Impacto Madrid", "Horas Impacto Madrid", "Total Horas"]];
        
        Object.values(stats).forEach(s => {
            rows.push([
                s.name, s.profile.toUpperCase(),
                s.morningDays, s.morningHours,
                s.afternoonDays, s.afternoonHours,
                s.legalHolidayDays, s.legalHolidayHours,
                s.madridDays, s.madridHours,
                s.totalHours
            ]);
        });
        Utils.exportToCSV(`Reporte_Equidad_${label}_2026.csv`, rows);
    }
};