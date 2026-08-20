/**
 * Storage & Portal Export/Import Manager
 * Manages LocalStorage, default sample subjects, and JSON schema for external portal sync (Mesh/Dnevnik).
 */

const STORAGE_KEY = 'school_counter_data_v1';

const DEFAULT_SUBJECTS = [];

export class StorageManager {
    static loadData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                const initialData = { subjects: DEFAULT_SUBJECTS, activePeriod: 'Четверть 1' };
                this.saveData(initialData);
                return initialData;
            }
            return JSON.parse(raw);
        } catch (e) {
            console.error('Error loading state from localStorage:', e);
            return { subjects: DEFAULT_SUBJECTS, activePeriod: 'Четверть 1' };
        }
    }

    static saveData(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            // Sync with Telegram CloudStorage if available
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.CloudStorage) {
                window.Telegram.WebApp.CloudStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
        } catch (e) {
            console.error('Error saving state:', e);
        }
    }

    /**
     * Import JSON schema from external portal (e.g. Mesh, Dnevnik.ru, NetworkCity parser)
     * Schema format: { subjects: [ { name: "...", grades: [ { grade: 5, weight: 2, date: "..." } ] } ] }
     */
    static importFromPortalJSON(jsonData) {
        try {
            const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            if (parsed && Array.isArray(parsed.subjects)) {
                const data = this.loadData();
                data.subjects = parsed.subjects.map((sub, idx) => ({
                    id: sub.id || `imported_${idx}_${Date.now()}`,
                    name: sub.name || 'Без названия',
                    icon: sub.icon || '📖',
                    grades: (sub.grades || []).map((g, gIdx) => ({
                        id: g.id || `ig_${idx}_${gIdx}`,
                        grade: Number(g.grade),
                        weight: Number(g.weight) || 1,
                        comment: g.comment || '',
                        date: g.date || new Date().toISOString().split('T')[0]
                    }))
                }));
                this.saveData(data);
                return { success: true, count: data.subjects.length };
            }
            return { success: false, error: 'Неверный формат JSON портала' };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    static exportJSON() {
        return JSON.stringify(this.loadData(), null, 2);
    }
}
