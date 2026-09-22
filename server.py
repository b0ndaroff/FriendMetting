import os
import sqlite3
import json
import urllib.parse
import mimetypes
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import database

PORT = int(os.environ.get('PORT', 8000))
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

def generate_ics_content(meetup):
    # Format dates for iCalendar format: YYYYMMDDTHHMMSS
    # Assuming local time / no timezone offset specified or float time
    date_str = meetup['date'].replace('-', '')
    time_str = meetup['time'].replace(':', '') + '00'
    start_dt = f"{date_str}T{time_str}"
    
    # End time or default +1.5 hours
    if meetup.get('end_time'):
        end_time_str = meetup['end_time'].replace(':', '') + '00'
        end_dt = f"{date_str}T{end_time_str}"
    else:
        # compute +90 minutes
        try:
            h, m = map(int, meetup['time'].split(':'))
            dt = datetime.strptime(meetup['date'], "%Y-%m-%d") + timedelta(hours=h, minutes=m, seconds=5400)
            end_dt = dt.strftime("%Y%m%dT%H%M00")
        except Exception:
            end_dt = start_dt

    def escape_ics(value):
        return str(value or '').replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\r\n', '\\n').replace('\n', '\\n').replace('\r', '\\n')

    title = meetup.get('title', 'Зустріч з друзями')
    location = meetup.get('cafe_name') or meetup.get('activity_detail') or ('Прогулянка' if meetup.get('activity_type') == 'walk' else 'Зустріч')
    
    participants_str = ", ".join([f"{p['name']} ({p.get('drink_choice') or 'учасник'})" for p in meetup.get('participants', [])])
    description = f"Тип: {meetup.get('activity_type')}\nОрганізатор: {meetup.get('creator_name')}\nУчасники: {participants_str}"
    if meetup.get('notes'):
        description += "\n\nПримітки:"
        for n in meetup['notes']:
            description += f"\n- {n['author_name']}: {n['content']}"

    now_stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//FriendsMeetup//UA",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{meetup['id']}@friendsmeetup.app",
        f"DTSTAMP:{now_stamp}",
        f"DTSTART:{start_dt}",
        f"DTEND:{end_dt}",
        f"SUMMARY:{escape_ics(title)}",
        f"LOCATION:{escape_ics(location)}",
        f"DESCRIPTION:{escape_ics(description)}",
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR"
    ]
    return "\r\n".join(ics_lines)

class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def _set_json_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # API: list meetups
        if path == '/api/meetups':
            start_date = query.get('start', [None])[0]
            end_date = query.get('end', [None])[0]
            meetups = [m for m in database.get_meetups(start_date, end_date) if not m.get('is_private')]
            self._set_json_headers(200)
            self.wfile.write(json.dumps({'meetups': meetups}, ensure_ascii=False).encode('utf-8'))
            return

        # API: single meetup
        if path.startswith('/api/meetups/') and not path.endswith('/calendar.ics'):
            meetup_id = urllib.parse.unquote(path.split('/')[-1])
            meetup = database.get_meetup_by_id(meetup_id)
            if meetup and not meetup.get('is_private'):
                self._set_json_headers(200)
                self.wfile.write(json.dumps({'meetup': meetup}, ensure_ascii=False).encode('utf-8'))
            else:
                self._set_json_headers(404)
                self.wfile.write(json.dumps({'error': 'Зустріч не знайдено'}, ensure_ascii=False).encode('utf-8'))
            return

        # API: download .ics calendar file
        if path.startswith('/api/meetups/') and path.endswith('/calendar.ics'):
            parts = path.split('/')
            meetup_id = urllib.parse.unquote(parts[3])
            meetup = database.get_meetup_by_id(meetup_id)
            if not meetup or meetup.get('is_private'):
                self._set_json_headers(404)
                self.wfile.write(json.dumps({'error': 'Зустріч не знайдено'}).encode('utf-8'))
                return

            ics_content = generate_ics_content(meetup)
            self.send_response(200)
            self.send_header('Content-Type', 'text/calendar; charset=utf-8')
            self.send_header('Content-Disposition', f'attachment; filename="meetup-{meetup_id[:8]}.ics"')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(ics_content.encode('utf-8'))
            return

        # Normalization: if client requests /static/*, strip /static
        if path.startswith('/static/'):
            self.path = self.path[7:]
            path = path[7:]

        # Serve SPA: if route doesn't have an extension, serve index.html
        if path == '/' or (not os.path.splitext(path)[1] and not path.startswith('/api')):
            self.path = '/index.html'

        return super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            payload = json.loads(body.decode('utf-8'))
            if not isinstance(payload, dict):
                raise ValueError('JSON body must be an object')
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            self._set_json_headers(400)
            self.wfile.write(json.dumps({'error': 'Некоректні дані запиту'}, ensure_ascii=False).encode('utf-8'))
            return

        # Create meetup
        if path == '/api/meetups':
            owner_token = payload.get('owner_token')
            if not isinstance(owner_token, str) or len(owner_token) < 32:
                self._set_json_headers(400)
                self.wfile.write(json.dumps({'error': 'Не вдалося створити ключ власника зустрічі'}, ensure_ascii=False).encode('utf-8'))
                return
            try:
                datetime.strptime(payload.get('date', ''), '%Y-%m-%d')
                datetime.strptime(payload.get('time', ''), '%H:%M')
            except (TypeError, ValueError):
                self._set_json_headers(400)
                self.wfile.write(json.dumps({'error': 'Вкажіть коректні дату та час'}, ensure_ascii=False).encode('utf-8'))
                return

            new_meetup = database.create_meetup(payload)
            self._set_json_headers(201)
            self.wfile.write(json.dumps({'meetup': new_meetup}, ensure_ascii=False).encode('utf-8'))
            return

        # Join meetup
        if path.startswith('/api/meetups/') and path.endswith('/join'):
            parts = path.split('/')
            meetup_id = parts[3]
            meetup_id = urllib.parse.unquote(parts[3])
            if not database.get_meetup_by_id(meetup_id):
                self._set_json_headers(404)
                self.wfile.write(json.dumps({'error': 'Зустріч не знайдено'}, ensure_ascii=False).encode('utf-8'))
                return
            if not payload.get('name', '').strip():
                self._set_json_headers(400)
                self.wfile.write(json.dumps({'error': 'Вкажіть ім’я'}, ensure_ascii=False).encode('utf-8'))
                return
            updated = database.add_participant(meetup_id, payload)
            if updated:
                self._set_json_headers(200)
                self.wfile.write(json.dumps({'meetup': updated}, ensure_ascii=False).encode('utf-8'))
            else:
                self._set_json_headers(404)
                self.wfile.write(json.dumps({'error': 'Зустріч не знайдено'}).encode('utf-8'))
            return

        # Add note
        if path.startswith('/api/meetups/') and path.endswith('/notes'):
            parts = path.split('/')
            meetup_id = parts[3]
            if not payload.get('content', '').strip():
                self._set_json_headers(400)
                self.wfile.write(json.dumps({'error': 'Текст примітки не може бути порожнім'}).encode('utf-8'))
                return

            meetup_id = urllib.parse.unquote(parts[3])
            if not database.get_meetup_by_id(meetup_id):
                self._set_json_headers(404)
                self.wfile.write(json.dumps({'error': 'Зустріч не знайдено'}, ensure_ascii=False).encode('utf-8'))
                return
            updated = database.add_note(meetup_id, payload)
            if updated:
                self._set_json_headers(200)
                self.wfile.write(json.dumps({'meetup': updated}, ensure_ascii=False).encode('utf-8'))
            else:
                self._set_json_headers(404)
                self.wfile.write(json.dumps({'error': 'Зустріч не знайдено'}).encode('utf-8'))
            return

        self._set_json_headers(404)
        self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith('/api/meetups/'):
            meetup_id = urllib.parse.unquote(path.split('/')[-1])
            content_length = int(self.headers.get('Content-Length', 0))
            try:
                payload = json.loads(self.rfile.read(content_length).decode('utf-8')) if content_length else {}
                if not isinstance(payload, dict):
                    raise ValueError('JSON body must be an object')
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
                self._set_json_headers(400)
                self.wfile.write(json.dumps({'error': 'Некоректні дані запиту'}, ensure_ascii=False).encode('utf-8'))
                return

            result = database.delete_meetup(meetup_id, payload.get('owner_token'))
            if result == 'deleted':
                self._set_json_headers(200)
                self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
            elif result == 'not_found':
                self._set_json_headers(404)
                self.wfile.write(json.dumps({'error': 'Зустріч не знайдено'}, ensure_ascii=False).encode('utf-8'))
            else:
                self._set_json_headers(403)
                self.wfile.write(json.dumps({'error': 'Видалити зустріч може лише її автор із цього браузера'}, ensure_ascii=False).encode('utf-8'))
            return

        self._set_json_headers(404)
        self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))

def run_server(port=PORT):
    database.init_db()
    # One-time cleanup of confirmed invalid sample meetups.
    with sqlite3.connect(database.DB_PATH) as conn:
        conn.execute('PRAGMA foreign_keys = ON')
        conn.executemany('DELETE FROM meetups WHERE id = ?', [
            ('02f8fb58-fcf2-4e79-98f6-c46829dff8f9',),
            ('ee086eb5-1b75-412c-aee5-a78364652621',),
            ('e4ce7cf6-7419-4ed3-b103-de66f21dff59',),
        ])
    
    server_address = ('0.0.0.0', port)
    try:
        httpd = ThreadingHTTPServer(server_address, AppRequestHandler)
    except OSError:
        if port != 8000:
            raise
        # Try port 8080 if 8000 is occupied
        port = 8080
        server_address = ('0.0.0.0', port)
        httpd = ThreadingHTTPServer(server_address, AppRequestHandler)

    print(f"==================================================")
    print(f"  Сервер зустрічей запущено на http://localhost:{port}")
    print(f"  Натисніть Ctrl+C для зупинки")
    print(f"==================================================")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()

