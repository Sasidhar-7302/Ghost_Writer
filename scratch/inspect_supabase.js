const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = "https://vgsrnsrgfkdssngtpkfg.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnc3Juc3JnZmtkc3NuZ3Rwa2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMTMwNzEsImV4cCI6MjA4Nzg4OTA3MX0.IhJV5T2xOYJBET0bV4fAAYMPBGL7l4RSxNjjpqPaj48";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectTables() {
    const tables = ['installations', 'beta_users', 'checkout_sessions', 'enterprise_analytics', 'global_config'];
    
    console.log('--- SUPABASE DATA INSPECTION ---\n');
    
    for (const table of tables) {
        try {
            const { data, count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact' });
                
            if (error) {
                console.log(`[${table}] Error: ${error.message}`);
                continue;
            }
            
            console.log(`Table: ${table}`);
            console.log(`Count: ${count}`);
            if (data && data.length > 0) {
                console.log('Sample Rows (up to 3):');
                data.slice(0, 3).forEach(row => console.log(JSON.stringify(row, null, 2)));
            } else {
                console.log('No data found.');
            }
            console.log('-------------------------------\n');
        } catch (err) {
            console.log(`[${table}] Fatal Error: ${err.message}`);
        }
    }
}

inspectTables();
