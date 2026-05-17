const Rules = {
    validateDayCoverage(dateStr, assignments, config, holidays) {
        const dayHoliday = holidays[dateStr];
        let dayType = "standard";
        
        if (dayHoliday) {
            if (dayHoliday.type === "global") dayType = "global_closure";
            else if (dayHoliday.type === "legal") dayType = "regional_holiday";
            else if (dayHoliday.type === "madrid") dayType = "standard";
        }

        const rule = config.coverage[dayType];
        const morningCount = assignments.mañana ? assignments.mañana.length : 0;
        const afternoonCount = assignments.tarde ? assignments.tarde.length : 0;

        const alerts = [];
        if (morningCount < rule.minMorning) {
            alerts.push(`Falta personal en Mañana (${morningCount}/${rule.minMorning})`);
        }
        if (afternoonCount < rule.minAfternoon) {
            alerts.push(`Falta personal en Tarde (${afternoonCount}/${rule.minAfternoon})`);
        }
        return {
            isValid: alerts.length === 0,
            alerts: alerts,
            targetMorning: rule.morning,
            targetAfternoon: rule.afternoon
        };
    },

    validateVacations(vacationsList, dateStr) {
        const count = vacationsList.filter(v => v.startDate <= dateStr && v.endDate >= dateStr).length;
        return {
            count,
            triggerWarning: count > 2
        };
    }
};