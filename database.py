import sqlite3
import os
import json
import uuid
import hashlib
import hmac
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'meetups.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS meetups (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            date TEXT NOT NULL,          -- YYYY-MM-DD
            time TEXT NOT NULL,          -- HH:MM
            end_time TEXT,               -- HH:MM (optional)
            activity_type TEXT NOT NULL, -- 'walk', 'cafe', 'other'
            activity_detail TEXT,        -- custom text if 'other'
            cafe_name TEXT,              -- 'Star Cup', 'Light Mood', 'Жовтий навєсік'
            default_drink TEXT,          -- 'coffee', 'tea', 'other'
            is_private INTEGER DEFAULT 0,-- 0 = public, 1 = private
            secret_code TEXT,            -- for private access
            owner_token_hash TEXT,       -- hash of the creator's delete token
            creator_name TEXT NOT NULL,
            creator_avatar TEXT NOT NULL,
            notes_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS participants (
            id TEXT PRIMARY KEY,
            meetup_id TEXT NOT NULL,
            name TEXT NOT NULL,
            avatar TEXT NOT NULL,
            drink_choice TEXT,           -- 'coffee', 'tea', 'other' or custom
            status TEXT DEFAULT 'going', -- 'going', 'maybe'
            created_at TEXT NOT NULL,
            FOREIGN KEY (meetup_id) REFERENCES meetups(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            meetup_id TEXT NOT NULL,
            author_name TEXT NOT NULL,
            author_avatar TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (meetup_id) REFERENCES meetups(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_meetups_date ON meetups(date);
        CREATE INDEX IF NOT EXISTS idx_participants_meetup ON participants(meetup_id);
        CREATE INDEX IF NOT EXISTS idx_notes_meetup ON notes(meetup_id);
        """)
        columns = {row['name'] for row in conn.execute('PRAGMA table_info(meetups)')}
        if 'owner_token_hash' not in columns:
            conn.execute('ALTER TABLE meetups ADD COLUMN owner_token_hash TEXT')

def seed_sample_data_if_empty():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM meetups")
        count = cursor.fetchone()[0]
        if count == 0:
            now = datetime.now()
            today_str = now.strftime("%Y-%m-%d")
            
            # Create a sample meetup for today + 2 days
            sample_id = str(uuid.uuid4())
            cursor.execute("""
            INSERT INTO meetups (
                id, title, date, time, end_time, activity_type, cafe_name, 
                default_drink, is_private, creator_name, creator_avatar, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sample_id,
                "Кава та плани на вихідні",
                today_str,
                "18:30",
                "20:00",
                "cafe",
                "Star Cup",
                "coffee",
                0,
                "Олег",
                "☕",
                datetime.now().isoformat()
            ))

            # Add creator as participant
            cursor.execute("""
            INSERT INTO participants (id, meetup_id, name, avatar, drink_choice, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (str(uuid.uuid4()), sample_id, "Олег", "☕", "coffee", "going", datetime.now().isoformat()))

            # Add sample friend
            cursor.execute("""
            INSERT INTO participants (id, meetup_id, name, avatar, drink_choice, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (str(uuid.uuid4()), sample_id, "Катя", "✨", "tea", "going", datetime.now().isoformat()))

            # Add sample note
            cursor.execute("""
            INSERT INTO notes (id, meetup_id, author_name, author_avatar, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (str(uuid.uuid4()), sample_id, "Катя", "✨", "Я буду на 10 хвилин раніше, займу столик біля вікна!", datetime.now().isoformat()))

            conn.commit()

def get_meetups(start_date=None, end_date=None, user_secret_codes=None):
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM meetups WHERE 1=1"
        params = []
        if start_date:
            query += " AND date >= ?"
            params.append(start_date)
        if end_date:
            query += " AND date <= ?"
            params.append(end_date)
        
        query += " ORDER BY date ASC, time ASC"
        cursor.execute(query, params)
        meetups = [dict(row) for row in cursor.fetchall()]

        # Attach participants and notes for each
        for m in meetups:
            m.pop('owner_token_hash', None)
            cursor.execute("SELECT * FROM participants WHERE meetup_id = ? ORDER BY created_at ASC", (m['id'],))
            m['participants'] = [dict(p) for p in cursor.fetchall()]
            
            cursor.execute("SELECT * FROM notes WHERE meetup_id = ? ORDER BY created_at ASC", (m['id'],))
            m['notes'] = [dict(n) for n in cursor.fetchall()]

        return meetups

def get_meetup_by_id(meetup_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM meetups WHERE id = ?", (meetup_id,))
        row = cursor.fetchone()
        if not row:
            return None
        meetup = dict(row)
        meetup.pop('owner_token_hash', None)
        cursor.execute("SELECT * FROM participants WHERE meetup_id = ? ORDER BY created_at ASC", (meetup_id,))
        meetup['participants'] = [dict(p) for p in cursor.fetchall()]
        cursor.execute("SELECT * FROM notes WHERE meetup_id = ? ORDER BY created_at ASC", (meetup_id,))
        meetup['notes'] = [dict(n) for n in cursor.fetchall()]
        return meetup

def create_meetup(data):
    meetup_id = str(uuid.uuid4())
    secret_code = str(uuid.uuid4())[:8] if data.get('is_private') else None
    now_iso = datetime.now().isoformat()
    owner_token = data.get('owner_token')
    owner_token_hash = hashlib.sha256(owner_token.encode('utf-8')).hexdigest() if isinstance(owner_token, str) and owner_token else None
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO meetups (
            id, title, date, time, end_time, activity_type, activity_detail,
            cafe_name, default_drink, is_private, secret_code, creator_name,
            creator_avatar, created_at, owner_token_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            meetup_id,
            data.get('title', 'Зустріч з друзями').strip() or 'Зустріч з друзями',
            data.get('date'),
            data.get('time', '18:00'),
            data.get('end_time', ''),
            data.get('activity_type', 'cafe'),
            data.get('activity_detail', ''),
            data.get('cafe_name', ''),
            data.get('default_drink', 'coffee'),
            1 if data.get('is_private') else 0,
            secret_code,
            data.get('creator_name', 'Організатор').strip() or 'Організатор',
            data.get('creator_avatar', '😎'),
            now_iso,
            owner_token_hash
        ))

        # Add creator as the first participant
        part_id = str(uuid.uuid4())
        creator_drink = data.get('default_drink', 'coffee') if data.get('activity_type') == 'cafe' else None
        cursor.execute("""
        INSERT INTO participants (id, meetup_id, name, avatar, drink_choice, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            part_id,
            meetup_id,
            data.get('creator_name', 'Організатор').strip() or 'Організатор',
            data.get('creator_avatar', '😎'),
            creator_drink,
            'going',
            now_iso
        ))

        # If creator left an initial note
        initial_note = data.get('initial_note', '').strip()
        if initial_note:
            note_id = str(uuid.uuid4())
            cursor.execute("""
            INSERT INTO notes (id, meetup_id, author_name, author_avatar, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (
                note_id,
                meetup_id,
                data.get('creator_name', 'Організатор').strip() or 'Організатор',
                data.get('creator_avatar', '😎'),
                initial_note,
                now_iso
            ))

        conn.commit()
    return get_meetup_by_id(meetup_id)

def add_participant(meetup_id, data):
    with get_db() as conn:
        cursor = conn.cursor()
        # Check if already exists with same name
        cursor.execute("SELECT id FROM participants WHERE meetup_id = ? AND name = ?", 
                       (meetup_id, data.get('name', '').strip()))
        existing = cursor.fetchone()
        
        now_iso = datetime.now().isoformat()
        if existing:
            # Update existing
            cursor.execute("""
            UPDATE participants 
            SET avatar = ?, drink_choice = ?, status = ?
            WHERE id = ?
            """, (
                data.get('avatar', '😎'),
                data.get('drink_choice'),
                data.get('status', 'going'),
                existing['id']
            ))
        else:
            part_id = str(uuid.uuid4())
            cursor.execute("""
            INSERT INTO participants (id, meetup_id, name, avatar, drink_choice, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                part_id,
                meetup_id,
                data.get('name', 'Друг').strip() or 'Друг',
                data.get('avatar', '😎'),
                data.get('drink_choice'),
                data.get('status', 'going'),
                now_iso
            ))
        conn.commit()
    return get_meetup_by_id(meetup_id)

def add_note(meetup_id, data):
    note_id = str(uuid.uuid4())
    now_iso = datetime.now().isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO notes (id, meetup_id, author_name, author_avatar, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            note_id,
            meetup_id,
            data.get('author_name', 'Друг').strip() or 'Друг',
            data.get('author_avatar', '😎'),
            data.get('content', '').strip(),
            now_iso
        ))
        conn.commit()
    return get_meetup_by_id(meetup_id)

def delete_meetup(meetup_id, owner_token):
    if not isinstance(owner_token, str) or not owner_token:
        return 'unauthorized'
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT owner_token_hash FROM meetups WHERE id = ?', (meetup_id,))
        row = cursor.fetchone()
        if not row:
            return 'not_found'
        token_hash = row['owner_token_hash']
        provided_hash = hashlib.sha256(owner_token.encode('utf-8')).hexdigest()
        if not token_hash or not hmac.compare_digest(token_hash, provided_hash):
            return 'unauthorized'
        cursor.execute("DELETE FROM meetups WHERE id = ?", (meetup_id,))
        conn.commit()
    return 'deleted'

