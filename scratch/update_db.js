const fs = require('fs');
const path = 'c:\\Users\\yepur\\Desktop\\My_Projects\\Ghost_Writer\\electron\\db\\DatabaseManager.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Update Meeting interface
content = content.replace(
    /isProcessed\?:\s*boolean;\s*screenshots\?:\s*string\[\];\s*}/,
    'isProcessed?: boolean;\n    screenshots?: string[];\n    context_json?: string;\n}'
);

// 2. Add Migration
if (!content.includes('context_json TEXT')) {
    content = content.replace(
        /try \{\s*this\.db\.exec\("ALTER TABLE meetings ADD COLUMN source TEXT"\);\s*\} catch \(e\) \{ \/\* Column likely exists \*\/ \}/,
        'try {\n            this.db.exec("ALTER TABLE meetings ADD COLUMN source TEXT");\n        } catch (e) { /* Column likely exists */ }\n\n        try {\n            this.db.exec("ALTER TABLE meetings ADD COLUMN context_json TEXT");\n        } catch (e) { /* Column likely exists */ }'
    );
}

// 3. Update saveMeeting prepared statement
content = content.replace(
    /INSERT OR REPLACE INTO meetings \(id, title, start_time, duration_ms, summary_json, created_at, calendar_event_id, source, is_processed, screenshots_json\)/,
    'INSERT OR REPLACE INTO meetings (id, title, start_time, duration_ms, summary_json, created_at, calendar_event_id, source, is_processed, screenshots_json, context_json)'
);

content = content.replace(
    /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/,
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

// 4. Update transaction parameters
content = content.replace(
    /JSON\.stringify\(meeting\.screenshots \|\| \[\]\)\s*\);/,
    'JSON.stringify(meeting.screenshots || []),\n                meeting.context_json || null\n            );'
);

// 5. Update getMeetingDetails
content = content.replace(
    /screenshots: screenshotsArray\s*};/,
    'screenshots: screenshotsArray,\n            context_json: meetingRow.context_json\n        };'
);

fs.writeFileSync(path, content);
console.log('Successfully updated DatabaseManager.ts');
