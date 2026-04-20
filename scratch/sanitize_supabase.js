const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://vgsrnsrgfkdssngtpkfg.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnc3Juc3JnZmtkc3NuZ3Rwa2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMTMwNzEsImV4cCI6MjA4Nzg4OTA3MX0.IhJV5T2xOYJBET0bV4fAAYMPBGL7l4RSxNjjpqPaj48";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function sanitizeDatabase() {
    console.log('--- SUPABASE DATA SANITATION STARTED ---\n');
    
    const tables = ['installations', 'checkout_sessions'];
    
    for (const table of tables) {
        try {
            console.log(`Cleaning table: ${table}...`);
            // Without a filter, we use .not('id', 'eq', -1) or similar if needed, 
            // but for simple delete all, we can filter on something that is always true
            // or use a very broad filter. 
            // In Supabase client, you must have a filter to prevent accidental full-table deletes 
            // if configured so, but usually .neq('machine_id', 'none') works for installations.
            
            const filterCol = table === 'installations' ? 'machine_id' : 'session_id';
            
            const { error } = await supabase
                .from(table)
                .delete()
                .not(filterCol, 'is', null); // Catch all non-null entries
                
            if (error) {
                console.log(`[${table}] Error: ${error.message}`);
            } else {
                console.log(`[${table}] Successfully wiped.`);
            }
        } catch (err) {
            console.log(`[${table}] Fatal Error: ${err.message}`);
        }
    }
    
    console.log('\n--- SANITATION COMPLETE ---');
}

sanitizeDatabase();
