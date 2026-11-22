const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'media-downloader.user.js'), 'utf8');
const startup = source.indexOf("  try { if (site !== 'pixiv') watchPageResponses(");
assert.ok(startup > 0, 'userscript startup exists');

function load(hostname = 'x.com', downloadMode = 'browser', overrides = {}) {
  const downloads = [];
  const window = { showDirectoryPicker() { assert.fail('unexpected folder picker'); } };
  window.top = window;
  const context = vm.createContext({
    unsafeWindow: window, window, location: { hostname, pathname: '/', origin: 'https://' + hostname },
    TextEncoder, TextDecoder, URL, Blob, navigator: {},
    GM_getValue: () => ({}), GM_info: { downloadMode },
    GM_download: details => { downloads.push(details); details.onload(); },
    ...overrides,
  });
  vm.runInContext(source.slice(0, startup) +
    'globalThis.api = { contextFor, filePath, saveFile, defaults, options, enqueueDownload, takeBiliDownload, ' +
    'cleanLink, resolvePixiv, saveMedia, idle: () => queue };\n})();', context);
  return { ...context.api, downloads, window };
}

const values = { ext: 'jpg', sourceid: '123', outerid: '123', mediaindex: 1, handle: 'author' };
const settings = (api, extra) => ({ ...api.defaults, filename: 'example.%ext%', folder: 'Chrome/X', ...extra });

function directoryDatabase() {
  const records = new Map();
  return {
    open() {
      const request = { result: {
        transaction() {
          const transaction = { objectStore: () => ({
            get: key => ({ result: records.get(key) }),
            put: (handle, key) => { records.set(key, handle); return { result: key }; },
          }) };
          queueMicrotask(() => transaction.oncomplete());
          return transaction;
        },
        close() {},
      } };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
}

test('Chrome/X remains a relative nested path in browser mode', async () => {
  const api = load();
  const config = settings(api);
  const filename = api.filePath(values, config);
  assert.equal(filename, 'Chrome/X/example.jpg');
  await api.saveFile(new Blob(['photo']), filename, config, null);
  assert.equal(api.downloads[0].name, 'Chrome/X/example.jpg');
});

test('an empty browser template saves directly to the browser download directory', () => {
  const api = load();
  assert.equal(api.filePath(values, settings(api, { folder: '' })), 'example.jpg');
});

test('template values cannot introduce extra directory levels', () => {
  const api = load();
  assert.equal(api.filePath({ ...values, handle: 'a/b\\c' }, settings(api, { folder: 'X/%handle%' })),
    'X/a_b_c/example.jpg');
});

test('manual destination ignores the old Chrome template and writes into the selected folder', async () => {
  const api = load();
  const writes = [];
  const handle = {
    name: 'X',
    getDirectoryHandle() { assert.fail('must not recreate Chrome/X under the selected folder'); },
    async getFileHandle(name, options) {
      if (!options?.create) throw Object.assign(new Error(), { name: 'NotFoundError' });
      return { async createWritable() { return {
        async write(blob) { writes.push({ name, text: await blob.text() }); },
        async close() {},
      }; } };
    },
  };
  const config = settings(api, { destination: 'directory', saveAs: true });
  const filename = api.filePath(values, config);
  assert.equal(filename, 'example.jpg');
  const result = await api.saveFile(new Blob(['photo']), filename, config, handle);
  await api.saveFile(new Blob(['metadata']), filename + '.json', config, handle);
  assert.equal(result.path, 'example.jpg');
  assert.deepEqual(writes.map(entry => entry.name), ['example.jpg', 'example.jpg.json']);
  assert.equal(writes[0].text, 'photo');
  assert.equal(api.downloads.length, 0);
});

test('all sites use the selected folder directly, including default nonempty templates', () => {
  for (const host of ['x.com', 'www.bilibili.com', 'www.xiaohongshu.com']) {
    const api = load(host);
    const config = settings(api, { destination: 'directory', folder: api.defaults.folder });
    assert.equal(api.filePath(values, config), 'example.jpg');
  }
});

test('switching back to browser mode preserves the Chrome template', () => {
  const api = load();
  const config = settings(api, { destination: 'directory' });
  assert.equal(api.filePath(values, config), 'example.jpg');
  assert.equal(api.filePath(values, { ...config, destination: 'browser' }), 'Chrome/X/example.jpg');
});

test('browser subfolders report unsupported Tampermonkey mode instead of flattening paths', async () => {
  const api = load('x.com', 'native');
  const config = settings(api);
  await assert.rejects(api.saveFile(new Blob(['photo']), api.filePath(values, config), config, null),
    /浏览器 API/);
});

test('browser download errors show the extension and the local folder option', async () => {
  const api = load('www.pixiv.net', 'browser', {
    GM_download: request => request.onerror({ error: 'not_whitelisted' }),
  });
  const config = { ...api.defaults, destination: 'browser' };
  await assert.rejects(api.saveFile(new Blob(['ebook']), 'Pixiv/novel.epub', config, null),
    /拦截了 \.epub 文件.*文件扩展名白名单.*添加 \.epub.*手动选择本地文件夹/);
});

test('Bilibili uses the X filename structure and updates the stored old default', () => {
  const oldTemplate = '%date%_%author%_%postid%_%postname%_%type%-%assetindex%.%ext%';
  const stored = { filename: oldTemplate };
  const api = load('space.bilibili.com', 'browser', { GM_getValue: () => stored });
  const item = { kind: 'photo' };
  const post = { platform: 'bili', id: '123', author: '1lch2', time: '2026-11-21T03:00:00.000Z',
    text: '动态正文', media: [item, { kind: 'photo' }] };
  const config = { ...api.options(), timezone: 'utc' };
  const context = api.contextFor(post, post, 0, item, { url: 'https://i0.hdslb.com/bfs/photo.png', ext: 'png' }, 0, config);
  assert.equal(api.filePath(context, config), 'Bilibili/2026-11-21_1lch2_123_photo-1of2.png');
  stored.filename = '%postid%_%authorid%.%ext%';
  assert.equal(api.options().filename, stored.filename);
  stored.filename = oldTemplate;
  stored.filenameTemplateVersion = 1;
  assert.equal(api.options().filename, oldTemplate);
});

test('download continues after folder selection and reuses the folder after reopening the page', async () => {
  const overrides = {
    indexedDB: directoryDatabase(),
    GM_xmlhttpRequest: details => details.onload({ status: 200, response: new Blob([Uint8Array.of(255, 216)]) }),
  };
  const api = load('space.bilibili.com', 'browser', overrides);
  const writes = [];
  let pickCount = 0;
  let permissionCount = 0;
  api.window.showDirectoryPicker = async () => {
    if (++pickCount === 1) throw Object.assign(new Error(), { name: 'AbortError' });
    return {
      queryPermission: async () => 'prompt',
      requestPermission: async () => { permissionCount++; return 'granted'; },
      getFileHandle: async name => ({ createWritable: async () => ({
        write: async () => { writes.push(name); }, close: async () => {},
      }) }),
    };
  };
  const config = settings(api, { destination: 'directory', conflict: 'overwrite', metadataMode: 'off', feedback: false });
  const post = { platform: 'bili', id: '123', text: '', media: [
    { kind: 'photo', source: { url: 'https://i0.hdslb.com/bfs/photo.jpg', ext: 'jpg' } },
  ] };
  const button = { setAttribute() {}, removeAttribute() {} };
  const download = instance => instance.enqueueDownload(post.id, button, config, () => ({ posts: [post], warnings: [] }));
  download(api);
  await api.idle();
  assert.deepEqual(writes, []);
  assert.equal(button.disabled, false);
  download(api);
  await api.idle();
  assert.equal(pickCount, 2);
  assert.deepEqual(writes, ['example.jpg']);
  assert.deepEqual(api.downloads, []);
  assert.equal(button.disabled, false);

  const reopened = load('space.bilibili.com', 'browser', overrides);
  download(reopened);
  await reopened.idle();
  assert.equal(permissionCount, 1);
  assert.deepEqual(writes, ['example.jpg', 'example.jpg']);
  assert.deepEqual(reopened.downloads, []);
  assert.equal(button.disabled, false);
});

test('a standalone Bilibili download only resumes once for the requested post', () => {
  const id = '1273055540937752600';
  const token = '82d35fa3-10b2-4d1b-8d97-c5307a047291';
  const key = 'bili-download-request:' + token;
  const records = new Map([[key, { id, expires: Date.now() + 60_000 }]]);
  const open = postId => load('www.bilibili.com', 'browser', {
    location: new URL('https://www.bilibili.com/opus/' + postId + '#xmd-download=' + token),
    history: { replaceState() {} },
    GM_getValue: (name, fallback) => records.get(name) ?? fallback,
    GM_deleteValue: name => records.delete(name),
  });

  assert.equal(open('1273055540937752601').takeBiliDownload(), '');
  assert.equal(open(id).takeBiliDownload(), id);
  assert.equal(open(id).takeBiliDownload(), '');
  records.set(key, { id, expires: Date.now() - 1000 });
  assert.equal(open(id).takeBiliDownload(), '');
});

test('Pixiv downloads all original pages with their own filenames and post tags', async () => {
  const png = new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' });
  const url = 'https://i.pximg.net/img-original/';
  const pages = [0, 1].map(index => ({ urls: { original: url + '123_p' + index + '.png' } }));
  const api = load('www.pixiv.net', 'browser', {
    DOMParser: class { parseFromString(text) { return { body: { textContent: text } }; } },
    GM_xmlhttpRequest: request => {
      assert.equal(request.headers.Referer, 'https://www.pixiv.net/');
      assert.ok(pages.some(page => page.urls.original === request.url));
      request.onload({ status: 200, response: png });
    },
  });
  api.window.fetch = async path => ({ ok: true, json: async () => ({
    body: path.endsWith('/pages') ? pages : { pageCount: 2, title: 'Artwork', userName: 'Author',
      createDate: '2026-11-22T08:29:00Z', tags: { tags: [{ tag: '投稿标签' }] } },
  }) });
  const config = { ...api.defaults, destination: 'browser', timezone: 'utc', metadataMode: 'json' };
  const { posts: [post] } = await api.resolvePixiv({ id: '123', type: 'illust' }, config);
  const paths = new Set();
  for (const [position, item] of post.media.entries()) {
    await api.saveMedia({ post, item, layer: 0, position }, post, config, undefined, paths);
  }
  assert.deepEqual(api.downloads.map(file => file.name), [0, 1].flatMap(index =>
    ['.png', '.png.json'].map(suffix => 'Pixiv/2026-11-22_Author_123_photo-' + (index + 1) + 'of2' + suffix)));
  const metadata = JSON.parse(await api.downloads[1].url.text());
  assert.equal(metadata.title, 'Artwork');
  assert.equal(metadata.source, 'https://www.pixiv.net/artworks/123');
  assert.equal(metadata.tags, '投稿标签');
  assert.equal(metadata.media_name, '123_p0');
  assert.equal(api.cleanLink('https://www.pixiv.net/en/artworks/123?utm_source=share').href, metadata.source);
  assert.equal(api.cleanLink('https://www.pixiv.net/novel/show.php?id=456&utm_source=share').search, '?id=456');
});

test('Pixiv defaults to the local folder and updates only the previous default filename', () => {
  const stored = {};
  const api = load('www.pixiv.net', 'browser', { GM_getValue: () => stored });
  assert.equal(api.options().destination, 'directory');
  assert.equal(load('www.pixiv.net', 'browser', { unsafeWindow: {} }).options().destination, 'browser');
  assert.equal(api.options().folder, 'Pixiv');
  stored.destination = 'browser';
  stored.folder = 'My downloads/Pixiv';
  stored.filename = '%medianame%_%postname%.%ext%';
  assert.equal(api.options().destination, 'browser');
  assert.equal(api.options().folder, stored.folder);
  assert.equal(api.options().filename, api.defaults.filename);
  stored.filename = '%postname%_%author%.%ext%';
  assert.equal(api.options().filename, stored.filename);
});

test('Pixiv EPUB embeds both inline image types and TXT points to adjacent files', async () => {
  const png = new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' });
  const imagePage = id => ({ urls: { original: 'https://i.pximg.net/' + id + '.png' } });
  const novel = { title: 'A & B', userName: 'Writer', createDate: '2026-11-22T08:29:00Z',
    content: '[chapter:Opening]\nText\n[uploadedimage:9]\n[pixivimage:17-2]',
    tags: { tags: [{ tag: 'Novel tag' }] }, language: 'en', textEmbeddedImages: { 9: imagePage('upload') } };
  const api = load('www.pixiv.net', 'browser', {
    DOMParser: class { parseFromString(text) { return { body: { textContent: text } }; } },
    GM_xmlhttpRequest: request => request.onload({ status: 200, response: png }),
  });
  api.window.fetch = async path => ({ ok: true, json: async () => ({
    body: path === '/ajax/illust/17/pages' ? [imagePage('first'), imagePage('second')] : novel,
  }) });
  const config = { ...api.defaults, timezone: 'utc', metadataMode: 'json' };
  const { posts: [post] } = await api.resolvePixiv({ id: '456', type: 'novel' }, config);
  const job = { post, item: post.media[0], layer: 0, position: 0 };
  const files = new Map();
  const folder = {
    async getFileHandle(name, options) {
      if (!options?.create) throw Object.assign(new Error(), { name: 'NotFoundError' });
      return { createWritable: async () => ({ write: async blob => files.set(name, blob), close: async () => {} }) };
    },
  };
  assert.equal(config.novelFormat, 'epub');
  assert.equal((await api.saveMedia(job, post, config, folder, new Set())).warning, '');
  const filename = '2026-11-22_Writer_456_novel-1of1';
  assert.ok(files.has(filename + '.epub'));
  assert.equal(api.downloads.length, 0);
  const zip = Buffer.from(await files.get(filename + '.epub').arrayBuffer());
  const entries = new Map();
  for (let offset = 0; zip.readUInt32LE(offset) === 0x04034b50;) {
    const size = zip.readUInt32LE(offset + 18);
    const length = zip.readUInt16LE(offset + 26);
    const start = offset + 30;
    const end = start + length + zip.readUInt16LE(offset + 28);
    entries.set(zip.toString('utf8', start, start + length), zip.subarray(end, end + size));
    offset = end + size;
  }
  assert.equal(zip.readUInt16LE(8), 0);
  assert.equal(entries.keys().next().value, 'mimetype');
  assert.equal(entries.get('mimetype').toString(), 'application/epub+zip');
  assert.match(entries.get('EPUB/book.opf').toString(), /<dc:title>A &amp; B<\/dc:title>/);
  assert.match(entries.get('EPUB/story.xhtml').toString(), /src="images\/1\.png"[\s\S]+src="images\/2\.png"/);
  assert.equal(JSON.parse(entries.get('META-INF/pixiv/2.png.json')).media_url, 'https://i.pximg.net/second.png');

  assert.equal((await api.saveMedia(job, post, { ...config, destination: 'browser', novelFormat: 'txt' },
    undefined, new Set())).warning, '');
  const book = api.downloads.at(-1);
  assert.equal(book.name, 'Pixiv/' + filename + '.txt');
  assert.match(await book.url.text(), /标签：Novel tag[\s\S]+2026-11-22_Writer_456_novel-1of1_illustration-2\.png/);
  const metadata = JSON.parse(await api.downloads.at(-2).url.text());
  assert.equal(metadata.image_role, 'illustration');
  assert.equal(metadata.source, 'https://www.pixiv.net/novel/show.php?id=456');
});
