import os
import json
import urllib.parse
import mimetypes
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import database

PORT = int(os.environ.get('PORT', 8000))
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')

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

    title = meetup.get('title', 'Зустріч з друзями')
    location = meetup.get('cafe_name') or meetup.get('activity_detail') or ('Прогулянка' if meetup.get('activity_type') == 'walk' else 'Зустріч')
    
    participants_str = ", ".join([f"{p['name']} ({p.get('drink_choice') or 'учасник'})" for p in meetup.get('participants', [])])
    description = f"Тип: {meetup.get('activity_type')}\\nОрганізатор: {meetup.get('creator_name')}\\nУчасники: {participants_str}"
    if meetup.get('notes'):
        description += "\\n\\nПримітки:"
        for n in meetup['notes']:
            description += f"\\n- {n['author_name']}: {n['content']}"

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
        f"SUMMARY:{title}",
        f"LOCATION:{location}",
        f"DESCRIPTION:{description}",
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
            meetups = database.get_meetups(start_date, end_date)
            self._set_json_headers(200)
            self.wfile.write(json.dumps({'meetups': meetups}, ensure_ascii=False).encode('utf-8'))
            return

        # API: single meetup
        if path.startswith('/api/meetups/') and not path.endswith('/calendar.ics'):
            meetup_id = path.split('/')[-1]
            meetup = database.get_meetup_by_id(meetup_id)
            if meetup:
                self._set_json_headers(200)
                self.wfile.write(json.dumps({'meetup': meetup}, ensure_ascii=False).encode('utf-8'))
            else:
                self._set_json_headers(404)
                self.wfile.write(json.dumps({'error': 'Зустріч не знайдено'}, ensure_ascii=False).encode('utf-8'))
            return

        # API: download .ics calendar file
        if path.startswith('/api/meetups/') and path.endswith('/calendar.ics'):
            parts = path.split('/')
            meetup_id = parts[3]
            meetup = database.get_meetup_by_id(meetup_id)
            if not meetup:
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
        except Exception:
            payload = {}

        # Create meetup
        if path == '/api/meetups':
            if not payload.get('date') or not payload.get('time'):
                self._set_json_headers(400)
                self.wfile.write(json.dumps({'error': 'Дата та час є обов\'язковими'}, ensure_ascii=False).encode('utf-8'))
                return

            new_meetup = database.create_meetup(payload)
            self._set_json_headers(201)
            self.wfile.write(json.dumps({'meetup': new_meetup}, ensure_ascii=False).encode('utf-8'))
            return

        # Join meetup
        if path.startswith('/api/meetups/') and path.endswith('/join'):
            parts = path.split('/')
            meetup_id = parts[3]
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
            meetup_id = path.split('/')[-1]
            database.delete_meetup(meetup_id)
            self._set_json_headers(200)
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
            return

        self._set_json_headers(404)
        self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))

def run_server(port=PORT):
    database.init_db()
    database.seed_sample_data_if_empty()
    
    server_address = ('0.0.0.0', port)
    try:
        httpd = ThreadingHTTPServer(server_address, AppRequestHandler)
    except OSError:
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
