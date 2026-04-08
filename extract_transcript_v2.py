
import sqlite3
import os
import json

db_path = os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "Ghost Writer", "ghost-writer.db")

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM meetings WHERE title LIKE '%Web Form Creation Training%'")
    meeting = cursor.fetchone()
    if meeting:
        cursor.execute("SELECT speaker, content FROM transcripts WHERE meeting_id = ? ORDER BY timestamp_ms ASC", (meeting[0],))
        rows = cursor.fetchall()
        transcript = [{"speaker": r[0], "text": r[1]} for r in rows]
        with open('transcript_utf8.json', 'w', encoding='utf-8') as f:
            json.dump(transcript, f, indent=2)
    conn.close()
except Exception as e:
    print(f"Error: {e}")
