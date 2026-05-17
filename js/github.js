const GitHubSync = {
    loadLocalState() {
        const stored = localStorage.getItem("aequitas_wfm_state");
        if (stored) {
            try { return JSON.parse(stored); } catch(e) { console.error(e); }
        }
        return null;
    },

    saveLocalState(state) {
        localStorage.setItem("aequitas_wfm_state", JSON.stringify(state));
    },

    exportDatabaseBackup(state) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const link = document.createElement("a");
        link.setAttribute("href", dataStr);
        link.setAttribute("download", `aequitas_backup_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};