import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import sharp from 'sharp';
import { images, navigation } from '../static/js/generated/assets.js';
import { localize } from '../static/js/core/content.js';
const root = new URL('../', import.meta.url);

test('generated image candidates exist, decode, and never upscale the source', async () => {
  for (const [source, image] of Object.entries(images)) {
    await stat(new URL(source, root));
    let previous = 0;
    for (const variant of image.variants) {
      const metadata = await sharp(await readFile(new URL(variant.src, root))).metadata();
      assert.equal(metadata.format, 'webp');
      assert.equal(metadata.width, variant.width);
      assert.ok(variant.width > previous && variant.width <= image.width, source);
      assert.ok(Math.abs(metadata.height / metadata.width - image.height / image.width) < 0.01, source);
      previous = variant.width;
    }
  }
});

test('large images use substantially smaller card previews', async () => {
  for (const source of ['media/projects/esp32-arduino-game-console.png',
    'blogs/posts/Notes-on-Variational-Inference/media/hero.png',
    'blogs/posts/launching-the-research-blog/media/hero.png',
    'blogs/posts/learning-the-japanese-kana/media/hero.png']) {
    const preview = images[source].variants.find(item => item.width === 640);
    const original = (await stat(new URL(source, root))).size;
    const optimized = (await stat(new URL(preview.src, root))).size;
    assert.ok(optimized < original * 0.2, `${source} preview budget exceeded`);
  }
});

test('navigation manifest preserves labels without fetching unrelated content', async () => {
  const meta = JSON.parse(await readFile(new URL('data/meta.json', root)));
  for (const section of meta.sections) {
    const source = section.dataSource || section.id;
    const document = JSON.parse(await readFile(new URL(`data/content/${source}.json`, root)));
    for (const language of meta.availableLanguages) {
      const copy = localize(document, language, meta.defaultLanguage);
      assert.equal(navigation[source][language], copy.nav_label || copy.title || section.id);
    }
  }
});
