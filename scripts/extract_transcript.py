
import sqlite3
import os
import json

db_path = os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "Ghost Writer", "ghost-writer.db")

if not os.path.exists(db_path):
    print(f"Database not found at: {db_path}")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Find meeting ID
    cursor.execute("SELECT id FROM meetings WHERE title LIKE '%Web Form Creation Training%'")
    meeting = cursor.fetchone()
    
    if not meeting:
        print("Meeting not found")
        exit(1)
        
    meeting_id = meeting[0]
    
    # Get transcript
    cursor.execute("SELECT speaker, content FROM transcripts WHERE meeting_id = ? ORDER BY timestamp_ms ASC", (meeting_id,))
    rows = cursor.fetchall()
    
    transcript = [{"speaker": r[0], "text": r[1]} for r in rows]
    print(json.dumps(transcript))
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    exit(1)
