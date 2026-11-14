"""Loopback-only preview server, with optional local featured-item editing."""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parents[1]
SOURCES = frozenset(('publications', 'projects', 'blogs', 'news'))


class EditorServer(ThreadingHTTPServer):
    def __init__(self, address, root=ROOT, edit=False):
        if address[0] != '127.0.0.1':
            raise ValueError('The editor must bind to loopback only')
        self.root = Path(root).resolve()
        self.edit = edit
        self.token = secrets.token_urlsafe(32)
        self.write_lock = threading.Lock()
        super().__init__(address, EditorHandler)


class EditorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(args[2].root), **kwargs)

    def end_headers(self):
        # Development must never reuse old CSS/JS after a save.
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, format, *args):
        # Never log session tokens or request bodies.
        if args and '/__editor/' in str(args[0]):
            return
        super().log_message(format, *args)

    def reply(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def allowed(self, write=False):
        port = self.server.server_port
        hosts = {f'localhost:{port}', f'127.0.0.1:{port}'}
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        # Host prevents DNS rebinding; Origin/Fetch Metadata prevent cross-site
        # browser requests. Mutations additionally require a random session token.
        if host not in hosts or self.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none'):
            self.reply(403, {'error': 'Local same-origin access only'})
            return False
        if (origin and origin != f'http://{host}') or (write and origin != f'http://{host}'):
            self.reply(403, {'error': 'Invalid origin'})
            return False
        return True

    def record(self, source):
        if source not in SOURCES:
            raise ValueError('Unsupported content source')
        path = (self.server.root / 'data' / 'content' / f'{source}.json').resolve()
        if path.parent != self.server.root / 'data' / 'content':
            raise ValueError('Invalid content path')
        raw = path.read_bytes()
        data = json.loads(raw)
        revision = hashlib.sha256(raw).hexdigest()
        items = data['items']
        selected = sorted((item for item in items if type(item.get('featuredOrder')) is int and item['featuredOrder'] > 0), key=lambda item: item['featuredOrder'])
        return path, data, {'source': source, 'revision': revision, 'ids': [item['id'] for item in selected]}

    def static_allowed(self):
        path = Path(self.translate_path(self.path)).resolve()
        if not path.is_relative_to(self.server.root) or any(part.startswith('.') or part == 'node_modules' for part in path.relative_to(self.server.root).parts):
            self.send_error(404)
            return False
        return True

    def do_HEAD(self):
        if not self.allowed():
            return
        if self.path.startswith('/__editor/'):
            self.send_error(404)
            return
        if self.static_allowed():
            super().do_HEAD()

    def do_GET(self):
        if not self.allowed():
            return
        url = urlsplit(self.path)
        if not url.path.startswith('/__editor/'):
            # Do not expose repository internals through the local static server.
            if self.static_allowed():
                super().do_GET()
            return
        if not self.server.edit:
            self.reply(404, {'error': 'Local editing is disabled'})
            return
        if url.path == '/__editor/session':
            self.reply(200, {'token': self.server.token})
        elif url.path == '/__editor/featured':
            try:
                source = parse_qs(url.query).get('source', [''])[0]
                with self.server.write_lock:
                    _, _, state = self.record(source)
                self.reply(200, state)
            except (ValueError, KeyError, OSError):
                self.reply(400, {'error': 'Unable to read this content source'})
        else:
            self.reply(404, {'error': 'Unknown editor endpoint'})

    def do_POST(self):
        if not self.allowed(write=True):
            return
        if not self.server.edit or urlsplit(self.path).path != '/__editor/featured':
            self.reply(404, {'error': 'Local editing is disabled'})
            return
        if not hmac.compare_digest(self.headers.get('X-Editor-Token', ''), self.server.token):
            self.reply(403, {'error': 'Invalid editor session'})
            return
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            self.reply(415, {'error': 'Expected JSON'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16384:
                self.reply(413, {'error': 'Invalid request size'})
                return
            request = json.loads(self.rfile.read(size))
            source, ids = request['source'], request['ids']
            if not isinstance(source, str) or source not in SOURCES or not isinstance(ids, list) or any(not isinstance(item, str) for item in ids) or len(set(ids)) != len(ids):
                raise ValueError('Invalid featured selection')
            with self.server.write_lock:
                path, data, state = self.record(source)
                if request.get('revision') != state['revision']:
                    self.reply(409, {'error': 'Content changed. Reload before saving.'})
                    return
                known = {item['id'] for item in data['items']}
                if not set(ids).issubset(known):
                    raise ValueError('Unknown item')
                order = {item: index + 1 for index, item in enumerate(ids)}
                for item in data['items']:
                    item.pop('featuredOrder', None)
                    if item['id'] in order:
                        item['featuredOrder'] = order[item['id']]
                raw = (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
                # Atomic replacement avoids truncated JSON on interruption.
                temp = None
                try:
                    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.featured-', delete=False) as stream:
                        temp = stream.name
                        stream.write(raw)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.chmod(temp, path.stat().st_mode & 0o777)
                    os.replace(temp, path)
                    temp = None
                finally:
                    if temp:
                        os.unlink(temp)
                state.update(ids=ids, revision=hashlib.sha256(raw).hexdigest())
            self.reply(200, state)
        except (ValueError, TypeError, KeyError, OSError):
            self.reply(400, {'error': 'Unable to save featured selection'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--edit', action='store_true', help='Enable local featured selection editing')
    args = parser.parse_args()
    server = EditorServer(('127.0.0.1', args.port), edit=args.edit)
    suffix = 'multipage_index.html?page=publications&lang=zh&edit=1' if args.edit else 'index.html?lang=zh'
    print(f'Preview: http://127.0.0.1:{server.server_port}/{suffix}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
