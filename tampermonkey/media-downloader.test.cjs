const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'media-downloader.user.js'), 'utf8');
const startup = source.indexOf('  try { watchPageResponses(');
assert.ok(startup > 0, 'userscript startup exists');

function load(hostname = 'x.com', downloadMode = 'browser') {
  const downloads = [];
  const window = {};
  window.top = window;
  const context = vm.createContext({
    unsafeWindow: window, window, location: { hostname, pathname: '/', origin: 'https://' + hostname },
    TextEncoder, TextDecoder, URL, Blob, navigator: {},
    GM_getValue: () => ({}), GM_info: { downloadMode },
    GM_download: details => { downloads.push(details); details.onload(); },
  });
  vm.runInContext(source.slice(0, startup) +
    'globalThis.api = { filePath, saveFile, defaults };\n})();', context);
  return { ...context.api, downloads };
}

const values = { ext: 'jpg', sourceid: '123', outerid: '123', mediaindex: 1, handle: 'author' };
const settings = (api, extra) => ({ ...api.defaults, filename: 'example.%ext%', folder: 'Chrome/X', ...extra });

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
