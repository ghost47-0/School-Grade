// Supabase Cloud Database & Auth Integration
// Connects Telegram Mini App to Supabase PostgreSQL Database

export const SUPABASE_CONFIG = {
    url: 'YOUR_SUPABASE_PROJECT_URL', // e.g. https://xyz.supabase.co
    anonKey: 'YOUR_SUPABASE_ANON_KEY'
};

let supabaseClient = null;

export function initSupabase(url = null, key = null) {
    const supabaseUrl = url || SUPABASE_CONFIG.url;
    const supabaseKey = key || SUPABASE_CONFIG.anonKey;

    if (window.supabase && supabaseUrl !== 'YOUR_SUPABASE_PROJECT_URL') {
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        console.log('⚡ Supabase Cloud Database connected!');
        return supabaseClient;
    }
    return null;
}

export function getSupabase() {
    return supabaseClient;
}

// Sync appData to Supabase Cloud
export async function syncAppDataToCloud(appData, userId) {
    if (!supabaseClient || !userId) return false;

    try {
        const { data, error } = await supabaseClient
            .from('user_data')
            .upsert({
                user_id: userId,
                data_json: appData,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
        console.log('☁️ App state synced to Supabase Cloud');
        return true;
    } catch (err) {
        console.warn('Supabase Sync Notice:', err.message);
        return false;
    }
}

// Fetch appData from Supabase Cloud
export async function fetchAppDataFromCloud(userId) {
    if (!supabaseClient || !userId) return null;

    try {
        const { data, error } = await supabaseClient
            .from('user_data')
            .select('data_json')
            .eq('user_id', userId)
            .single();

        if (error) throw error;
        return data ? data.data_json : null;
    } catch (err) {
        console.warn('Supabase Fetch Notice:', err.message);
        return null;
    }
}
