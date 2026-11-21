const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'media-downloader.user.js'), 'utf8');
const startup = source.indexOf('  try { watchPageResponses(');
assert.ok(startup > 0, 'userscript startup exists');

function load(hostname = 'x.com', downloadMode = 'browser', overrides = {}) {
  const downloads = [];
  const window = {};
  window.top = window;
  const context = vm.createContext({
    unsafeWindow: window, window, location: { hostname, pathname: '/', origin: 'https://' + hostname },
    TextEncoder, TextDecoder, URL, Blob, navigator: {},
    GM_getValue: () => ({}), GM_info: { downloadMode },
    GM_download: details => { downloads.push(details); details.onload(); },
    ...overrides,
  });
  vm.runInContext(source.slice(0, startup) +
    'globalThis.api = { contextFor, filePath, saveFile, defaults, options, enqueueDownload, idle: () => queue };\n})();', context);
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
