import importlib.util
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

spec = importlib.util.spec_from_file_location('local_editor', Path(__file__).resolve().parents[1] / 'scripts/dev_server.py')
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)


class LocalEditorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'data/content').mkdir(parents=True)
        self.path = self.root / 'data/content/projects.json'
        self.original = {'translations': {'zh': {'title': '项目'}}, 'items': [
            {'id': str(i), 'featuredOrder': i + 1, 'translations': {'zh': {'title': f'项目{i}'}}} if i < 3 else {'id': str(i), 'image': 'original.png'} for i in range(5)]}
        self.path.write_text(json.dumps(self.original, ensure_ascii=False))
        (self.root / 'index.html').write_text('preview')
        self.server = server_module.EditorServer(('127.0.0.1', 0), root=self.root, edit=True)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host = f'127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(); self.temp.cleanup()

    def request(self, method, path, data=None, headers=None):
        connection = HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        base = {'Host': self.host, 'Origin': f'http://{self.host}', 'Content-Type': 'application/json', 'X-Editor-Token': self.server.token}
        base.update(headers or {})
        connection.request(method, path, body=json.dumps(data) if data is not None else None, headers=base)
        response = connection.getresponse(); raw = response.read(); result = (response.status, raw, dict(response.getheaders())); connection.close(); return result

    def state(self):
        status, raw, _ = self.request('GET', '/__editor/featured?source=projects'); self.assertEqual(status, 200); return json.loads(raw)

    def test_save_changes_only_pins_and_detects_stale_writes(self):
        state = self.state()
        status, raw, _ = self.request('POST', '/__editor/featured', dict(state, ids=['4', '0']))
        self.assertEqual(status, 200)
        saved = json.loads(self.path.read_text()); expected = json.loads(json.dumps(self.original))
        for item in expected['items']: item.pop('featuredOrder', None)
        expected['items'][4]['featuredOrder'] = 1; expected['items'][0]['featuredOrder'] = 2
        self.assertEqual(saved, expected)
        self.assertEqual(self.request('POST', '/__editor/featured', dict(state, ids=['1']))[0], 409)
        self.assertEqual(json.loads(self.path.read_text()), expected)
        self.assertEqual(self.request('POST', '/__editor/featured', dict(json.loads(raw), ids=[]))[0], 200)
        self.assertEqual(self.state()['ids'], [])
        all_ids = ['4', '3', '2', '1', '0']
        self.assertEqual(self.request('POST', '/__editor/featured', dict(self.state(), ids=all_ids))[0], 200)
        self.assertEqual(self.state()['ids'], all_ids)

    def test_blog_pins_save_without_changing_article_content(self):
        path = self.root / 'data/content/blogs.json'
        original = {'items': [{'id': str(i), 'slug': f'post-{i}', 'translations': {'zh': {'title': f'文章{i}'}}} for i in range(5)]}
        path.write_text(json.dumps(original))
        status, raw, _ = self.request('GET', '/__editor/featured?source=blogs')
        self.assertEqual(status, 200)
        state = json.loads(raw)
        self.assertEqual(state['ids'], [])
        ids = ['4', '2', '1', '0']
        status, raw, _ = self.request('POST', '/__editor/featured', dict(state, ids=ids))
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)['ids'], ids)
        saved = json.loads(path.read_text())
        for item in saved['items']: item.pop('featuredOrder', None)
        self.assertEqual(saved, original)

    def test_news_pins_save_without_changing_news_content(self):
        path = self.root / 'data/content/news.json'
        original = {'items': [{'id': str(i), 'date': '2026.11.13', 'translations': {'zh': {'content': f'<a href="https://example.com/{i}">新闻{i}</a>'}}} for i in range(5)]}
        path.write_text(json.dumps(original))
        status, raw, _ = self.request('GET', '/__editor/featured?source=news')
        self.assertEqual(status, 200)
        state = json.loads(raw)
        self.assertEqual(state['ids'], [])
        ids = ['4', '2', '1', '0']
        status, raw, _ = self.request('POST', '/__editor/featured', dict(state, ids=ids))
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)['ids'], ids)
        saved = json.loads(path.read_text())
        for item in saved['items']: item.pop('featuredOrder', None)
        self.assertEqual(saved, original)

    def test_cross_origin_rebinding_and_missing_token_cannot_write(self):
        state = self.state(); before = self.path.read_bytes()
        for headers in [{'Origin': 'https://attacker.example'}, {'Host': f'attacker.example:{self.server.server_port}'}, {'Sec-Fetch-Site': 'cross-site'}, {'X-Editor-Token': ''}, {'Origin': 'null'}]:
            self.assertEqual(self.request('POST', '/__editor/featured', state, headers)[0], 403)
        self.assertEqual(self.request('GET', '/__editor/session', headers={'Origin': 'https://attacker.example'})[0], 403)
        self.assertEqual(self.path.read_bytes(), before)

    def test_invalid_ids_and_sources_leave_file_untouched(self):
        state = self.state(); before = self.path.read_bytes()
        for patch in [{'ids': ['0', '0']}, {'ids': ['unknown']}, {'source': '../meta'}, {'ids': [True]}, {'ids': '0'}]:
            self.assertEqual(self.request('POST', '/__editor/featured', dict(state, **patch))[0], 400)
        self.assertEqual(self.path.read_bytes(), before)

    def test_preview_is_uncached_and_edit_api_is_opt_in(self):
        status, raw, headers = self.request('GET', '/index.html')
        self.assertEqual((status, raw), (200, b'preview')); self.assertEqual(headers['Cache-Control'], 'no-store')
        self.server.edit = False
        self.assertEqual(self.request('GET', '/__editor/session')[0], 404)
        self.assertEqual(self.request('POST', '/__editor/featured', {})[0], 404)


if __name__ == '__main__': unittest.main()
