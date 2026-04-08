
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Path to Ghost Writer DB on Windows
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Ghost Writer', 'ghost-writer.db');

if (!fs.existsSync(dbPath)) {
    console.error('Database not found at:', dbPath);
    process.exit(1);
}

const db = new Database(dbPath);

try {
    const meeting = db.prepare("SELECT id FROM meetings WHERE title LIKE '%Web Form Creation Training%'").get();
    
    if (!meeting) {
        console.error('Meeting not found');
        process.exit(1);
    }

    const transcript = db.prepare("SELECT speaker, content FROM transcripts WHERE meeting_id = ? ORDER BY timestamp_ms ASC")
        .all(meeting.id);

    console.log(JSON.stringify(transcript, null, 2));
} catch (err) {
    console.error('Error querying database:', err);
    process.exit(1);
}
