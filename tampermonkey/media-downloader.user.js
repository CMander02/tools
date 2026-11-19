// ==UserScript==
// @name         聚合媒体下载
// @namespace    https://github.com/CMander02/tools
// @version      1.2.0
// @description  在 X、B 站动态和小红书笔记中下载媒体，支持各站目录、命名模板和图片元数据。
// @homepageURL  https://github.com/CMander02/tools/tree/main/tampermonkey
// @downloadURL  https://raw.githubusercontent.com/CMander02/tools/main/tampermonkey/media-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/CMander02/tools/main/tampermonkey/media-downloader.user.js
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://www.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://t.bilibili.com/*
// @match        https://www.xiaohongshu.com/*
// @run-at       document-start
// @sandbox      raw
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_info
// @connect      pbs.twimg.com
// @connect      video.twimg.com
// @connect      cdn.syndication.twimg.com
// @connect      hdslb.com
// @connect      bilibili.com
// @connect      b23.tv
// @connect      xhscdn.com
// @connect      xiaohongshu.com
// @connect      xhslink.com
// @connect      t.co
// @connect      x.com
// @connect      twitter.com
// ==/UserScript==

(() => {
  'use strict';

  const page = unsafeWindow;
  const site = location.hostname.endsWith('.bilibili.com') ? 'bili'
    : location.hostname.endsWith('.xiaohongshu.com') ? 'xhs' : 'x';
  if (window.top !== window && !(site === 'bili' &&
    (location.hostname === 't.bilibili.com' || /^\/(?:opus|dynamic)\//.test(location.pathname)))) return;
  const siteNames = { x: 'X', bili: 'B 站', xhs: '小红书' };
  const ARTICLE = 'article[data-testid="tweet"],article[role="article"]';
  const VIEWER = '[role="dialog"],[aria-modal="true"]';
  const MEDIA_ROUTE = /\/status\/\d+\/(?:photo|video)\/(\d+)\/?$/;
  const NAME = '[data-testid="User-Name"]';
  const BODY = '[data-testid="tweetText"]';
  const SHARE = 'M12 2.59l5.7';
  const QUOTE = '[data-testid="quoteTweet"],[role="link"][tabindex],a[href*="/status/"]';
  const BUTTON = 'xmd-download';
  const SETTINGS = site === 'x' ? 'settings-v1' : 'settings-v1:' + site;
  const MAX_CACHE = 1200;
  const cache = new Map();
  const active = new Set();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const defaultMetadata = {
    platform: '%platform%',
    paired_photo: '%pairedphoto%',
    title: '%postname% (%index%/%total%)',
    creator: '%author%',
    description: '%posttext%',
    source: '%sourceurl%',
    identifier: '%postid%',
    created: '%published%',
    media_name: '%medianame%',
    filename: '%filename%',
    media_type: '%type%',
    index: '%index%',
    total: '%total%',
    photo_index: '%photoindex%',
    photo_total: '%photototal%',
    media_index: '%mediaindex%',
    media_total: '%mediatotal%',
    author_handle: '%at%',
    author_id: '%authorid%',
    source_author: '%sourceauthor%',
    source_handle: '%sourceat%',
    source_author_id: '%sourceauthorid%',
    source_post_id: '%sourceid%',
    source_published: '%sourcepublished%',
    source_text: '%sourcetext%',
    source_layer: '%layer%',
    outer_post: '%outerurl%',
    outer_author: '%outerat%',
    outer_author_id: '%outerauthorid%',
    outer_text: '%outertext%',
    reposted_by: '%repostedby%',
    media_url: '%mediaurl%',
    alt_text: '%alt%',
    fields_missing: '%missing%',
  };

  const defaults = {
    destination: 'browser', folder: { x: '', bili: 'Bilibili', xhs: '小红书' }[site], saveAs: false, conflict: 'uniquify',
    photo: true, video: true, gif: true, live: true, videoJson: false, original: true, quality: 'best',
    quoteDepth: 3, attribution: 'source', lookup: true, button: 'media',
    filename: site === 'x' ? '%date%_%handle%_%postid%_%type%-%index%of%total%.%ext%'
      : '%date%_%author%_%postid%_%postname%_%type%-%assetindex%.%ext%',
    timezone: 'local', titleLength: 70, missing: '',
    metadataMode: 'auto', metadata: defaultMetadata, feedback: true,
  };

  const options = () => ({ ...defaults, ...GM_getValue(SETTINGS, {}) });
  let directory;
  let queue = Promise.resolve();
  let settingsDialog;

  function asUrl(value) {
    try { return new URL(value, location.origin); }
    catch { return null; }
  }

  function status(value) {
    const url = asUrl(value);
    if (!url || !['x.com', 'twitter.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(i\/web|i|[\w]{1,15})\/status\/(\d+)(?:\/|$)/);
    return match ? { id: match[2], handle: match[1].includes('/') || match[1] === 'i' ? '' : match[1] } : null;
  }

  function numeric(...values) {
    for (const value of values) {
      if ((typeof value === 'string' || Number.isSafeInteger(value)) && /^\d+$/.test(value)) return String(value);
    }
    return '';
  }

  function published(...values) {
    for (const value of values) {
      const date = value ? new Date(value) : null;
      if (date && Number.isFinite(date.valueOf())) return date.toISOString();
    }
    return '';
  }

  function snowflakeTime(id) {
    return id && id.length >= 16 ? published(Number((BigInt(id) >> 22n) + 1288834974657n)) : '';
  }

  function photoUrl(value) {
    const url = asUrl(value);
    return url?.protocol === 'https:' && url.hostname === 'pbs.twimg.com' &&
      /^\/media\/[\w-]+(?:\.(?:jpe?g|png|webp|gif|avif))?$/i.test(url.pathname) ? url : null;
  }

  function videoUrl(value) {
    const url = asUrl(value);
    return url?.protocol === 'https:' && url.hostname === 'video.twimg.com' &&
      /\.mp4$/i.test(url.pathname) ? url.href : '';
  }

  function variants(items) {
    return [...new Map((items || []).map(item => {
      const url = videoUrl(item?.url || item?.src || item);
      const dimension = url.match(/\/(\d+)x(\d+)\//);
      return [url, { url, bitrate: Number(item?.bitrate || item?.bit_rate) || 0,
        pixels: dimension ? Number(dimension[1]) * Number(dimension[2]) : 0 }];
    }).filter(([url]) => url)).values()];
  }

  function mediaFrom(item) {
    const raw = item?.media_info || item;
    if (!raw) return null;
    const type = raw.type || item.type;
    const preview = raw.media_url_https || raw.media_url || raw.preview_image_url || raw.poster || raw.url;
    const candidates = raw.video_info?.variants || raw.variants;
    const urls = variants([...(Array.isArray(candidates) ? candidates : []), raw.mp4]);
    const photo = photoUrl(preview);
    if (!type && !urls.length && !photo) return null;
    const kind = ['animated_gif', 'gif'].includes(type) ? 'gif' : type === 'video' || urls.length ? 'video' : 'photo';
    if (kind === 'photo' && !photo) return null;
    return {
      kind, photo: photo?.href || '', preview: String(preview || ''),
      id: numeric(raw.id_str, item.id_str, raw.id) || raw.media_key || item.media_key || '',
      alt: raw.ext_alt_text || raw.alt_text || raw.alt || '', variants: urls,
    };
  }

  function mediaKeys(item) {
    if (item.kind === 'photo') return ['p:' + photoUrl(item.photo).pathname.replace(/\.[^.]+$/, '')];
    const keys = [];
    if (item.id) keys.push('v:' + item.id);
    const preview = asUrl(item.preview);
    if (preview?.hostname === 'pbs.twimg.com') {
      keys.push('t:' + preview.pathname);
      const id = preview.pathname.match(/(?:ext_tw_video_thumb|amplify_video_thumb)\/(\d+)/)?.[1];
      if (id) keys.push('m:' + id);
    }
    for (const itemVariant of item.variants) {
      const url = new URL(itemVariant.url);
      keys.push('u:' + url.pathname);
      const id = url.pathname.match(/(?:ext_tw_video|amplify_video)\/(\d+)/)?.[1];
      if (id) keys.push('m:' + id);
    }
    return keys;
  }

  function mergeMedia(primary = [], secondary = []) {
    const merged = [];
    for (const item of [...primary, ...secondary]) {
      if (!item) continue;
      const keys = mediaKeys(item);
      const index = merged.findIndex(other => mediaKeys(other).some(key => keys.includes(key)));
      if (index < 0) {
        merged.push(item);
        continue;
      }
      const other = merged[index];
      const byUrl = new Map(other.variants.map(variant => [variant.url, variant]));
      for (const variant of item.variants) {
        if (!byUrl.has(variant.url) || variant.bitrate > byUrl.get(variant.url).bitrate) byUrl.set(variant.url, variant);
      }
      merged[index] = { ...other, id: other.id || item.id, alt: other.alt || item.alt,
        preview: other.preview || item.preview, variants: [...byUrl.values()] };
    }
    return merged;
  }

  function mergePost(primary, fallback) {
    if (!primary) return fallback;
    if (!fallback) return primary;
    // DOM video placeholders sometimes expose neither a poster nor an MP4.
    // When the structured list already covers every video, keep its identities and ordering.
    const structuredVideos = primary.media.filter(item => item.kind !== 'photo').length;
    const fallbackVideos = fallback.media.filter(item => item.kind !== 'photo').length;
    const fallbackMedia = structuredVideos && structuredVideos >= fallbackVideos
      ? fallback.media.filter(item => item.kind === 'photo' || item.variants.length || mediaKeys(item).length)
      : fallback.media;
    return {
      id: primary.id, handle: primary.handle || fallback.handle, author: primary.author || fallback.author,
      authorId: primary.authorId || fallback.authorId, time: primary.time || fallback.time,
      text: primary.textComplete ? primary.text : fallback.textComplete ? fallback.text : primary.text || fallback.text,
      textComplete: Boolean(primary.textComplete || fallback.textComplete),
      quoteId: primary.quoteId || fallback.quoteId, repostedBy: primary.repostedBy || fallback.repostedBy || '',
      media: mergeMedia(primary.media, fallbackMedia),
    };
  }

  function remember(post) {
    const current = mergePost(post, cache.get(post.id));
    cache.delete(post.id);
    cache.set(post.id, current);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return current;
  }

  function captureTweet(node) {
    const legacy = node.legacy || {};
    const id = numeric(node.rest_id, legacy.id_str);
    if (!id || !(node.__typename === 'Tweet' || node.core?.user_results)) return;
    const user = node.core?.user_results?.result || {};
    const note = node.note_tweet?.note_tweet_results?.result;
    const quote = node.quoted_status_result?.result;
    const quoted = quote?.tweet || quote;
    const media = legacy.extended_entities?.media || legacy.entities?.media ||
      node.mediaDetails || node.media_details || [];
    remember({
      id, handle: user.core?.screen_name || user.legacy?.screen_name || '',
      author: user.core?.name || user.legacy?.name || '',
      authorId: numeric(user.rest_id, user.legacy?.id_str, legacy.user_id_str),
      time: published(legacy.created_at),
      text: note?.text ?? legacy.full_text ?? legacy.text ?? '',
      textComplete: typeof note?.text === 'string' ||
        (typeof legacy.full_text === 'string' && !node.note_tweet && !legacy.truncated),
      quoteId: numeric(quoted?.rest_id, quoted?.legacy?.id_str, legacy.quoted_status_id_str),
      media: Array.isArray(media) ? media.map(mediaFrom).filter(Boolean) : [],
    });
  }

  function captureJson(json) {
    if (!json || typeof json !== 'object') return;
    const todo = [json];
    while (todo.length) {
      const entry = todo.pop();
      if (!entry || typeof entry !== 'object') continue;
      if (!Array.isArray(entry)) captureTweet(entry);
      for (const value of Object.values(entry)) {
        if (value && typeof value === 'object') todo.push(value);
      }
    }
    scheduleScan();
  }

  function xApi(value) {
    const url = asUrl(value?.url || value);
    return url && ['x.com', 'twitter.com', 'api.x.com', 'api.twitter.com'].includes(url.hostname) &&
      /^\/(?:i\/api\/)?(?:graphql|2)\//.test(url.pathname);
  }

  function watchPageResponses(matches, capture) {
    const originalFetch = page.fetch;
    if (typeof originalFetch === 'function') {
      page.fetch = function (...args) {
        const request = Reflect.apply(originalFetch, this, args);
        if (matches(args[0])) request.then(response => {
          if (response.ok && response.headers.get('content-type')?.includes('json')) {
            return response.clone().json().then(capture);
          }
        }).catch(() => {});
        return request;
      };
    }
    const xhr = page.XMLHttpRequest?.prototype;
    if (!xhr) return;
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    const tracked = new WeakSet();
    xhr.open = function (...args) {
      tracked.delete(this);
      if (matches(args[1])) tracked.add(this);
      return Reflect.apply(originalOpen, this, args);
    };
    xhr.send = function (...args) {
      if (tracked.has(this)) {
        const read = () => {
          try {
            if (this.status < 200 || this.status >= 300) return;
            if (this.responseType === 'json') capture(this.response);
            else if (!this.responseType || this.responseType === 'text') capture(JSON.parse(this.responseText));
          } catch {}
        };
        this.addEventListener('loadend', read, { once: true });
      }
      return Reflect.apply(originalSend, this, args);
    };
  }

  function request(url, responseType, timeout = 20000) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url, responseType, timeout, anonymous: true,
        onload: result => result.status >= 200 && result.status < 300
          ? resolve(result.response) : reject(new Error('HTTP ' + result.status)),
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('网络请求超时')),
        onabort: () => reject(new Error('网络请求取消')),
      });
    });
  }

  function embeddedPost(json) {
    const id = numeric(json?.id_str);
    if (!id) return null;
    const quoted = embeddedPost(json.quoted_tweet);
    if (quoted) remember(quoted);
    const photos = (json.photos || []).map(item => mediaFrom({ ...item, type: 'photo' }));
    const details = (json.mediaDetails || []).map(mediaFrom).filter(Boolean);
    if (json.video && !details.some(item => item.kind !== 'photo')) {
      details.push(mediaFrom({ ...json.video, type: 'video' }));
    }
    return {
      id, handle: json.user?.screen_name || '', author: json.user?.name || '',
      authorId: numeric(json.user?.id_str, json.user?.id), time: published(json.created_at),
      text: json.note_tweet?.text ?? json.full_text ?? json.text ?? '',
      textComplete: !json.truncated && typeof (json.note_tweet?.text ?? json.full_text ?? json.text) === 'string',
      quoteId: quoted?.id || numeric(json.quoted_status_id_str, json.quoted_tweet?.id_str),
      media: mergeMedia(details, photos),
    };
  }

  async function lookup(id) {
    // The public embed request format is also used by Vercel's react-tweet.
    const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/[0.]/g, '');
    const url = new URL('https://cdn.syndication.twimg.com/tweet-result');
    url.search = new URLSearchParams({ id, lang: 'en', token });
    try {
      const post = embeddedPost(await request(url.href, 'json', 8000));
      if (post?.id === id) return remember(mergePost(cache.get(id), post));
    } catch {}
    return cache.get(id);
  }

  function domStatus(root, exclude = () => false) {
    for (const time of root.querySelectorAll('time')) {
      if (exclude(time)) continue;
      const match = status(time.closest('a[href]')?.href);
      if (match) return match;
    }
    for (const link of root.querySelectorAll('a[href*="/status/"]')) {
      if (exclude(link) || !/\/status\/\d+(?:\/photo\/\d+|\/video\/\d+)?\/?$/.test(link.pathname)) continue;
      const match = status(link.href);
      if (match && !link.closest(BODY)) return match;
    }
    for (const link of root.querySelectorAll('a[href*="/status/"][href$="/analytics"]')) {
      const match = !exclude(link) && status(link.href);
      if (match) return match;
    }
    return null;
  }

  function quoteContainer(article) {
    const explicit = article.querySelector('[data-testid="quoteTweet"],article[data-testid="tweet"]');
    if (explicit) return explicit;
    return [...article.querySelectorAll(QUOTE)].find(node => {
      if (node.closest(BODY) || node.closest('[data-testid="tweetPhoto"],[data-testid="videoPlayer"]')) return false;
      if (node.tagName === 'A' && /\/(?:photo|video)\//.test(node.pathname)) return false;
      return node.querySelector(NAME) && (node.querySelector(BODY + ',time,[data-testid="tweetPhoto"]') || status(node.href));
    }) || null;
  }

  function domMedia(root, exclude) {
    const media = [];
    const playerSelector = '[data-testid="videoPlayer"],[data-testid="videoComponent"],video';
    const seenPlayers = new Set();
    for (const element of root.querySelectorAll('img,' + playerSelector)) {
      if (exclude(element)) continue;
      const player = element.closest(playerSelector);
      if (player) {
        const owner = player.closest('[data-testid="videoPlayer"]') || player.closest('[data-testid="videoComponent"]') || player;
        if (seenPlayers.has(owner)) continue;
        seenPlayers.add(owner);
        const video = owner.matches('video') ? owner : owner.querySelector('video');
        const sources = [...(video?.querySelectorAll('source[src]') || [])].map(node => node.src);
        const preview = video?.poster || owner.querySelector('img')?.src || '';
        media.push({ kind: 'video', photo: '', preview, id: '', alt: '',
          variants: variants([video?.currentSrc, video?.src, ...sources]) });
      } else if (element.matches('img')) {
        const photo = photoUrl(element.currentSrc || element.src);
        if (!photo || element.closest('[data-testid="card.wrapper"]')) continue;
        const alt = element.getAttribute('alt') || '';
        media.push({ kind: 'photo', photo: photo.href, preview: photo.href, id: '',
          alt: /^(image|photo|图片|图像|圖片|照片)$/i.test(alt) ? '' : alt, variants: [] });
      }
    }
    return mergeMedia(media);
  }

  function domPost(root, match, quote, media, repostedBy = '') {
    const skip = node => quote?.contains(node);
    const first = selector => [...root.querySelectorAll(selector)].find(node => !skip(node));
    const name = first(NAME);
    const text = first(BODY);
    const profile = [...(name?.querySelectorAll('a[href]') || [])]
      .map(link => link.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/?$/)?.[1]).find(Boolean);
    const handle = match.handle || profile || name?.textContent.match(/@([A-Za-z0-9_]{1,15})\b/)?.[1] || '';
    const authorLink = [...(name?.querySelectorAll('a[href]') || [])].find(link =>
      link.pathname.toLowerCase() === '/' + handle.toLowerCase() && !link.textContent.trim().startsWith('@'));
    const nameText = [...(name?.querySelectorAll('[dir]') || [])]
      .map(node => node.innerText?.trim()).find(value => value && !value.startsWith('@'));
    return {
      id: match.id, handle, author: authorLink?.innerText.trim() || nameText || '',
      authorId: numeric(name?.dataset.userId),
      time: published(first('time')?.dateTime) || snowflakeTime(match.id),
      text: text?.innerText || text?.textContent || '', textComplete: false,
      quoteId: '', media, repostedBy,
    };
  }

  function inspect(root) {
    const modal = root.closest(VIEWER);
    const pageStatus = status(location.href);
    const slide = modal && pageStatus && location.pathname.match(MEDIA_ROUTE);
    const articleStatus = article => {
      const quote = quoteContainer(article);
      return domStatus(article, node => quote?.contains(node));
    };
    let article = root.matches(ARTICLE) ? root : null;
    if (!article && slide) {
      const articles = [...modal.querySelectorAll(ARTICLE)].filter(node => node.closest(VIEWER) === modal);
      article = articles.find(node => articleStatus(node)?.id === pageStatus.id) ||
        (articles.length && !articleStatus(articles[0]) ? articles[0] : null);
    }
    const quote = article && quoteContainer(article);
    const permalink = article && domStatus(article, node => quote?.contains(node));
    const gallery = Boolean(slide && (!article || permalink?.id === pageStatus.id ||
      (!permalink && modal.querySelector(ARTICLE) === article)));
    const primaryColumn = article?.closest('[data-testid="primaryColumn"]');
    const mainPost = primaryColumn?.querySelector(ARTICLE) === article;
    const match = (gallery && pageStatus) || permalink || (mainPost ? pageStatus : null);
    if (!match) return null;
    const quoteStatus = quote && (domStatus(quote) || status(quote.href) ||
      status(quote.querySelector('a[href*="/status/"]')?.href));
    const context = article?.querySelector('[data-testid="socialContext"]');
    const reposter = context?.closest('a[href]')?.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1] ||
      context?.querySelector('a[href]')?.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
    const outer = article
      ? domPost(article, match, quote, domMedia(article, node => quote?.contains(node)), reposter ? '@' + reposter : '')
      : { ...match, author: '', authorId: '', time: snowflakeTime(match.id), text: '', textComplete: false, media: [] };
    if (gallery) {
      outer.media = mergeMedia(outer.media, domMedia(modal, node => node.closest(ARTICLE) || node.closest(VIEWER) !== modal));
    }
    const quoted = quote && quoteStatus?.id !== outer.id
      ? domPost(quote, quoteStatus || { id: '', handle: '' }, null, domMedia(quote, () => false)) : null;
    outer.quoteId = quoted?.id || '';
    return { outer, quoted, hasQuote: Boolean(quote), gallery, slideNumber: gallery ? Number(slide[1]) : 0 };
  }

  function needsDetails(post, gallery) {
    return !post?.authorId || !post.textComplete || !post.handle || !post.author ||
      !post.time || (gallery && !post.media.length) ||
      post.media.some(item => item.kind !== 'photo' && !item.variants.length);
  }

  async function resolvePosts(snapshot, settings, gallery) {
    const { outer, quoted, hasQuote } = snapshot;
    const useLookup = settings.lookup;
    const warnings = [];
    let current = mergePost(cache.get(outer.id), outer);
    const album = cache.get(outer.id)?.media;
    const incompleteAlbum = gallery && (!album?.length || snapshot.slideNumber > album.length);
    if (useLookup && (needsDetails(current, gallery) || incompleteAlbum || (hasQuote && !current.quoteId && settings.quoteDepth))) {
      current = mergePost(await lookup(outer.id), current);
    }
    const posts = [current];
    const visited = new Set([current.id]);
    for (let depth = 1; depth <= settings.quoteDepth; depth++) {
      const id = current.quoteId;
      if (!id || visited.has(id)) {
        if (!id && depth === 1 && hasQuote) {
          if (quoted?.media.length) posts.push(quoted);
          warnings.push(quoted?.media.length
            ? '引用帖链接未能识别，已处理引用卡片中显示的媒体'
            : '引用帖链接未能识别');
        }
        break;
      }
      visited.add(id);
      const visible = depth === 1 && quoted && (!quoted.id || quoted.id === id) ? { ...quoted, id } : null;
      let post = mergePost(cache.get(id), visible);
      if (useLookup && (!post || needsDetails(post, false) || (!post.media.length && visible))) {
        post = mergePost(await lookup(id), post);
      }
      if (!post) {
        warnings.push('未能读取引用帖 ' + id);
        break;
      }
      if (!post.media.length && visible && !cache.has(id)) warnings.push('引用帖仅取得页面中可见的信息');
      posts.push(post);
      current = post;
    }
    if (gallery && !cache.get(outer.id)?.media.length && posts[0].media.length) {
      warnings.push('未取得相册列表，已处理查看器中加载的媒体');
    }
    return { posts, warnings };
  }

  const fields = {
    ext: '扩展名（不带点）', filename: '保存的文件名（仅供元数据模板使用）', medianame: '平台提供的媒体文件名（不带扩展名）',
    platform: '平台名称', pairedphoto: '实况视频对应的静态图片序号',
    assetindex: '图片或实况的图片序号，其他视频使用同类型序号',
    mediaid: '媒体 ID', type: '媒体类型（photo、video、gif 或 live）',
    index: '同类型序号', total: '同类型总数', index2: '补零后的同类型序号',
    photoindex: '图片序号（视频为空）', photototal: '图片总数',
    mediaindex: '所有媒体中的序号', mediatotal: '所有媒体总数',
    author: '命名所用作者的显示名', handle: '命名所用作者的用户名（不含 @）', at: '命名所用作者的 @用户名',
    authorid: '命名所用作者的数字 ID', postid: '命名所用帖子的 ID',
    date: '命名所用帖子的发布日期', time: '命名所用帖子的发布时间（时分秒）',
    published: '命名所用帖子的发布时间（ISO 8601 UTC）', postname: '命名所用帖子的正文首行（限长）',
    posttext: '命名所用帖子的正文', posturl: '命名所用帖子的链接',
    sourceid: '媒体所属帖子的 ID', sourceurl: '媒体所属帖子的链接',
    sourceauthor: '媒体所属帖子的作者', sourcehandle: '媒体所属帖子的用户名（不含 @）',
    sourceat: '媒体所属帖子的 @用户名', sourceauthorid: '媒体所属帖子的作者数字 ID',
    sourcepublished: '媒体所属帖子的发布时间（ISO 8601 UTC）', sourcetext: '媒体所属帖子的正文',
    outerid: '外层帖子数字 ID', outerurl: '外层帖链接', outerauthor: '外层作者显示名',
    outerat: '外层作者的 @用户名', outerauthorid: '外层作者的数字 ID', outertext: '外层帖正文',
    outerpublished: '外层帖发布时间（ISO 8601 UTC）', layer: '引用深度（0 为外层）',
    repostedby: '界面显示的转发账号（如有）', mediaurl: '媒体文件地址', alt: '图片替代文字',
    missing: '缺失或未确认的元数据字段',
  };

  const string = value => value == null ? '' : String(value);
  const truncate = (value, count) => [...value].slice(0, count).join('');
  const at = handle => handle ? '@' + handle : '';
  const postUrl = post => post.platform ? post.url || ''
    : post.id ? 'https://x.com/' + (post.handle || 'i') + '/status/' + post.id : '';

  function dateParts(iso, timezone) {
    if (!iso) return { date: '', time: '' };
    const date = new Date(iso);
    if (timezone === 'utc') return { date: iso.slice(0, 10), time: iso.slice(11, 19).replaceAll(':', '') };
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23', ...(timezone === 'china' ? { timeZone: 'Asia/Shanghai' } : {}),
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { date: values.year + '-' + values.month + '-' + values.day,
      time: values.hour + values.minute + values.second };
  }

  function photoSource(value, original) {
    const url = photoUrl(value);
    const extension = url.pathname.match(/\.([a-z]+)$/i)?.[1];
    const requested = (url.searchParams.get('format') || extension || 'jpg').toLowerCase();
    const format = /^(jpe?g|png|webp|gif|avif)$/.test(requested) ? requested : 'jpg';
    if (original) {
      url.pathname = url.pathname.replace(/\.[^.]+$/, '');
      url.search = new URLSearchParams({ format, name: 'orig' });
    }
    return { url: url.href, ext: format === 'jpeg' ? 'jpg' : format };
  }

  function videoSource(item, quality) {
    const order = (a, b) => b.bitrate - a.bitrate || b.pixels - a.pixels;
    const available = [...item.variants].sort(order);
    let variant = available[0];
    if (quality === 'small') {
      const ranked = available.filter(entry => entry.bitrate || entry.pixels);
      variant = ranked.at(-1) || variant;
    }
    if (quality === '720') {
      const ranked = available.filter(entry => entry.pixels);
      variant = ranked.find(entry => entry.pixels <= 1280 * 720) || ranked.at(-1) || variant;
    }
    return variant && { url: variant.url, ext: variant.ext || 'mp4' };
  }

  function contextFor(post, outer, layer, item, source, position, settings) {
    const owner = settings.attribution === 'outer' ? outer : post;
    const { date, time } = dateParts(owner.time, settings.timezone);
    const photoCount = post.media.filter(entry => entry.kind === 'photo').length;
    const siblings = post.media.filter(entry => entry.kind === item.kind);
    const index = siblings.indexOf(item) + 1;
    const missing = [];
    if (!post.id) missing.push('source_post_id');
    if (!post.authorId) missing.push('source_author_id');
    if (!post.handle && !post.platform) missing.push('source_handle');
    if (!post.author) missing.push('source_author');
    if (!post.time) missing.push('source_published');
    if (!post.textComplete) missing.push('source_text_completeness');
    if (owner !== post) {
      if (!owner.authorId) missing.push('author_id');
      if (!owner.textComplete) missing.push('post_text_completeness');
    }
    return {
      ext: source.ext, medianame: (post.platform && item.id) || new URL(source.url).pathname.split('/').at(-1).replace(/\.[^.]+$/, ''),
      platform: siteNames[post.platform || 'x'], pairedphoto: item.pairedPhoto || '',
      assetindex: item.pairedPhoto || item.photoNumber || index,
      mediaid: item.id, type: item.kind, index, total: siblings.length, index2: String(index).padStart(2, '0'),
      photoindex: item.kind === 'photo' ? item.photoNumber || index : '', photototal: photoCount,
      mediaindex: position + 1, mediatotal: post.media.length,
      author: owner.author, handle: owner.handle, at: at(owner.handle), authorid: owner.authorId,
      postid: owner.id, date, time, published: owner.time,
      postname: truncate(owner.title || owner.text.split(/\r?\n/).map(line => line.trim()).find(Boolean) || '', settings.titleLength),
      posttext: owner.text, posturl: postUrl(owner),
      sourceid: post.id, sourceurl: postUrl(post), sourceauthor: post.author, sourcehandle: post.handle,
      sourceat: at(post.handle), sourceauthorid: post.authorId, sourcepublished: post.time, sourcetext: post.text,
      outerid: outer.id, outerurl: postUrl(outer), outerauthor: outer.author, outerat: at(outer.handle),
      outerauthorid: outer.authorId, outertext: outer.text, outerpublished: outer.time, layer,
      repostedby: outer.repostedBy, mediaurl: source.url, alt: item.alt, missing: missing.join(', '),
    };
  }

  function render(template, values, missing, forPath = false) {
    return template.replace(/%%|%([a-z][a-z0-9_]*)%/gi, (token, key) => {
      if (!key) return '%';
      if (!Object.hasOwn(fields, key.toLowerCase())) return token;
      const value = string(values[key.toLowerCase()]) || missing;
      return forPath ? value.replace(/[\\/]/g, '_') : value;
    });
  }

  function safePart(value, maxBytes = 200) {
    let clean = value.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
      .replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
    if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(clean)) clean = '_' + clean;
    if (encoder.encode(clean).length <= maxBytes) return clean;
    let bytes = 0;
    let end = 0;
    for (const char of clean) {
      const code = char.codePointAt(0);
      bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
      if (bytes > maxBytes) break;
      end += char.length;
    }
    return clean.slice(0, end).replace(/[. ]+$/g, '');
  }

  function filePath(values, settings) {
    const template = settings.destination === 'directory' ? '' : settings.folder;
    const folder = template.split('/').filter(Boolean).map(part => safePart(render(part, values, settings.missing, true), 100))
      .filter(Boolean).join('/');
    const output = render(settings.filename, values, settings.missing, true);
    const suffix = '.' + values.ext;
    const stem = output.toLowerCase().endsWith(suffix) ? output.slice(0, -suffix.length) : output;
    const name = (safePart(stem, 175) || (values.sourceid || values.outerid) + '_' + values.mediaindex) + suffix;
    return folder ? folder + '/' + name : name;
  }

  function uniquePath(path, exists) {
    if (!exists(path)) return path;
    const dot = path.lastIndexOf('.');
    let index = 2;
    while (exists(path.slice(0, dot) + ' (' + index + ')' + path.slice(dot))) index++;
    return path.slice(0, dot) + ' (' + index + ')' + path.slice(dot);
  }

  const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  const dc = 'http://purl.org/dc/elements/1.1/';
  const xmp = 'http://ns.adobe.com/xap/1.0/';
  const custom = 'urn:local:x-media-downloader:1.0';
  const jpegXmp = 'http://ns.adobe.com/xap/1.0/\0';
  const jpegExtendedXmp = 'http://ns.adobe.com/xmp/extension/\0';
  const pngXmp = 'XML:com.adobe.xmp';
  const xmlSafe = value => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udfff]/gu, '\ufffd');
  const ascii = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));

  function xmpPacket(metadata, previous = '') {
    const doc = new DOMParser().parseFromString(previous ||
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="' + rdf + '"/></x:xmpmeta>', 'application/xml');
    const container = doc.getElementsByTagNameNS(rdf, 'RDF')[0];
    if (!container || doc.querySelector('parsererror')) throw new Error('无法读取图片已有的 XMP');
    const descriptions = [...container.children].filter(node => node.namespaceURI === rdf &&
      node.localName === 'Description' && !node.getAttributeNS(rdf, 'about'));
    const record = doc.createElementNS(rdf, 'rdf:Description');
    record.setAttributeNS(rdf, 'rdf:about', '');
    container.append(record);

    function add(namespace, prefix, key, value, collection) {
      for (const description of descriptions) {
        description.removeAttributeNS(namespace, key);
        for (const property of [...description.children]) {
          if (property.namespaceURI === namespace && property.localName === key) property.remove();
        }
      }
      const property = doc.createElementNS(namespace, prefix + ':' + key);
      record.append(property);
      if (!collection) {
        property.textContent = xmlSafe(value);
        return;
      }
      const list = doc.createElementNS(rdf, 'rdf:' + collection);
      const entry = doc.createElementNS(rdf, 'rdf:li');
      if (collection === 'Alt') entry.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', 'x-default');
      entry.textContent = xmlSafe(value);
      list.append(entry);
      property.append(list);
    }

    const standard = {
      title: [dc, 'dc', 'title', 'Alt'], creator: [dc, 'dc', 'creator', 'Seq'],
      description: [dc, 'dc', 'description', 'Alt'], source: [dc, 'dc', 'source'],
      identifier: [dc, 'dc', 'identifier'], created: [xmp, 'xmp', 'CreateDate'],
    };
    for (const [key, value] of Object.entries(metadata)) {
      if (!value) continue;
      const mapping = Object.hasOwn(standard, key) ? standard[key] : null;
      if (mapping && (key !== 'created' || /^\d{4}-\d{2}-\d{2}T/.test(value))) {
        const [namespace, prefix, property, collection] = mapping;
        add(namespace, prefix, property, value, collection);
      }
      add(custom, 'xmd', key, value);
    }
    return encoder.encode(new XMLSerializer().serializeToString(doc));
  }

  function jpegWithXmp(bytes, metadata) {
    const view = new DataView(bytes.buffer);
    let offset = 2;
    let insert = 2;
    let replace = null;
    let previous = '';
    while (offset + 3 < bytes.length && bytes[offset] === 255) {
      const start = offset++;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (offset + 2 > bytes.length) throw new Error('JPEG 段长度无效');
      const size = view.getUint16(offset);
      const end = offset + size;
      if (size < 2 || end > bytes.length) throw new Error('JPEG 段长度无效');
      if (marker === 0xe0 && start === insert) insert = end;
      if (marker === 0xe1 && ascii(bytes, offset + 2, jpegExtendedXmp.length) === jpegExtendedXmp) {
        throw new Error('图片已有扩展 XMP');
      }
      if (marker === 0xe1 && ascii(bytes, offset + 2, jpegXmp.length) === jpegXmp) {
        if (replace) throw new Error('图片含多个 XMP 段');
        replace = [start, end];
        previous = decoder.decode(bytes.subarray(offset + 2 + jpegXmp.length, end));
      }
      offset = end;
    }
    const payload = xmpPacket(metadata, previous);
    const header = encoder.encode(jpegXmp);
    const size = 2 + header.length + payload.length;
    if (size > 65535) throw new Error('XMP 超过 JPEG APP1 容量');
    const marker = new Uint8Array([255, 225, size >> 8, size & 255]);
    const [start, end] = replace || [insert, insert];
    return new Blob([bytes.subarray(0, start), marker, header, payload, bytes.subarray(end)], { type: 'image/jpeg' });
  }

  const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
    let crc = byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    return crc;
  });

  function pngChunk(type, data) {
    const chunk = new Uint8Array(data.length + 12);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    chunk.set(encoder.encode(type), 4);
    chunk.set(data, 8);
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, chunk.length - 4)) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    view.setUint32(chunk.length - 4, crc ^ 0xffffffff);
    return chunk;
  }

  async function readPngXmp(data) {
    let position = pngXmp.length + 1;
    const flag = data[position++];
    const method = data[position++];
    for (let index = 0; index < 2; index++) {
      const end = data.indexOf(0, position);
      if (end === -1) throw new Error('PNG XMP 文本头无效');
      position = end + 1;
    }
    const content = data.subarray(position);
    if (flag === 0) return decoder.decode(content);
    if (flag !== 1 || method !== 0) throw new Error('PNG XMP 压缩方式不受支持');
    const stream = new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Response(stream).text();
  }

  async function pngWithXmp(bytes, metadata) {
    const view = new DataView(bytes.buffer);
    let offset = 8;
    let previous = '';
    let replace = null;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset);
      const type = ascii(bytes, offset + 4, 4);
      const end = offset + size + 12;
      if (end > bytes.length) break;
      if (type === 'IEND') {
        const header = encoder.encode(pngXmp + '\0\0\0\0\0');
        const xml = xmpPacket(metadata, previous);
        const content = new Uint8Array(header.length + xml.length);
        content.set(header, 0);
        content.set(xml, header.length);
        const chunk = pngChunk('iTXt', content);
        const [start, finish] = replace || [offset, offset];
        return new Blob([bytes.subarray(0, start), chunk, bytes.subarray(finish)], { type: 'image/png' });
      }
      if (type === 'iTXt' && size > pngXmp.length + 4 && ascii(bytes, offset + 8, pngXmp.length + 1) === pngXmp + '\0') {
        if (replace) throw new Error('图片含多个 XMP 段');
        replace = [offset, end];
        previous = await readPngXmp(bytes.subarray(offset + 8, end - 4));
      }
      offset = end;
    }
    throw new Error('PNG 缺少 IEND 数据段');
  }

  function webpChunk(type, data) {
    const chunk = new Uint8Array(8 + data.length + (data.length % 2));
    chunk.set(encoder.encode(type));
    new DataView(chunk.buffer).setUint32(4, data.length, true);
    chunk.set(data, 8);
    return chunk;
  }

  function webpWithXmp(bytes, metadata) {
    const view = new DataView(bytes.buffer);
    const limit = view.getUint32(4, true) + 8;
    if (limit !== bytes.length) throw new Error('WebP RIFF 长度无效');
    const chunks = [];
    let extended;
    let dimensions;
    let previous = '';
    let hasXmp = false;
    let offset = 12;
    for (; offset + 8 <= limit;) {
      const type = ascii(bytes, offset, 4);
      const length = view.getUint32(offset + 4, true);
      const start = offset + 8;
      const end = start + length + (length % 2);
      if (end > limit) throw new Error('WebP 数据段长度无效');
      if (type === 'VP8X') {
        if (length !== 10 || extended) throw new Error('WebP 扩展头无效');
        extended = bytes.slice(start, start + length);
      } else if (type === 'XMP ') {
        if (hasXmp) throw new Error('图片含多个 XMP 段');
        hasXmp = true;
        previous = decoder.decode(bytes.subarray(start, start + length));
      } else {
        chunks.push(bytes.subarray(offset, end));
        if (type === 'VP8 ' && length >= 10 && bytes[start + 3] === 157 &&
            bytes[start + 4] === 1 && bytes[start + 5] === 42) {
          dimensions = [view.getUint16(start + 6, true) & 16383, view.getUint16(start + 8, true) & 16383, false];
        }
        if (type === 'VP8L' && length >= 5 && bytes[start] === 47) {
          const packed = view.getUint32(start + 1, true);
          dimensions = [(packed & 16383) + 1, ((packed >>> 14) & 16383) + 1, Boolean(packed & (1 << 28))];
        }
      }
      offset = end;
    }
    if (offset !== limit) throw new Error('WebP 数据段不完整');
    if (!extended) {
      if (!dimensions?.[0] || !dimensions[1]) throw new Error('无法读取 WebP 尺寸');
      extended = new Uint8Array(10);
      const [width, height, alpha] = dimensions;
      const size = new DataView(extended.buffer);
      size.setUint32(3, width - 1, true);
      size.setUint16(6, height - 1, true);
      if (alpha) extended[0] |= 0x10;
    }
    extended[0] |= 0x04;
    const parts = [webpChunk('VP8X', extended), ...chunks, webpChunk('XMP ', xmpPacket(metadata, previous))];
    const header = bytes.slice(0, 12);
    new DataView(header.buffer).setUint32(4, 4 + parts.reduce((total, part) => total + part.length, 0), true);
    return new Blob([header, ...parts], { type: 'image/webp' });
  }

  function imageFormat(bytes) {
    return bytes[0] === 255 && bytes[1] === 216 ? 'jpg'
      : bytes[0] === 137 && ascii(bytes, 1, 7) === 'PNG\r\n\x1a\n' ? 'png'
        : ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP' ? 'webp'
          : /^GIF8[79]a$/.test(ascii(bytes, 0, 6)) ? 'gif'
            : ascii(bytes, 4, 4) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 4)) ? 'avif' : '';
  }

  async function preparePhoto(item, source) {
    const urls = new Set([source.url, item.renderedPhoto, item.alternative, item.photo].filter(Boolean));
    let failure;
    for (const url of urls) {
      try {
        const blob = await request(url, 'blob', 60000);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const format = imageFormat(bytes);
        if (!format) throw new Error('媒体服务器未返回可识别的图片');
        const mime = format === 'jpg' ? 'image/jpeg' : 'image/' + format;
        return { source: { url, ext: format }, bytes, blob: blob.slice(0, blob.size, mime) };
      } catch (error) {
        failure = error;
      }
    }
    throw failure || new Error('没有可用的图片地址');
  }

  async function embedPhoto(photo, metadata) {
    switch (photo.source.ext) {
      case 'jpg': return jpegWithXmp(photo.bytes, metadata);
      case 'png': return pngWithXmp(photo.bytes, metadata);
      case 'webp': return webpWithXmp(photo.bytes, metadata);
      default: throw new Error('此图片格式使用 JSON 元数据');
    }
  }

  const downloadErrors = {
    not_enabled: '请在 Tampermonkey 中启用浏览器 API 下载模式',
    not_whitelisted: '请在 Tampermonkey 的下载设置中允许此文件扩展名',
    not_permitted: 'Tampermonkey 缺少 Chrome 下载权限',
    not_supported: '当前 Tampermonkey 不支持此下载方式',
    not_succeeded: '下载失败或已取消',
  };

  function gmDownload(payload, path, settings) {
    return new Promise((resolve, reject) => {
      GM_download({
        url: payload, name: path, saveAs: settings.saveAs, conflictAction: settings.conflict,
        onload: () => resolve('saved'),
        onerror: error => reject(new Error(downloadErrors[error.error] || error.error || '下载失败')),
        ontimeout: () => reject(new Error('下载超时')),
      });
    });
  }

  function anchorDownload(blob, filename) {
    const anchor = document.createElement('a');
    const url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'requested';
  }

  async function writeFile(handle, payload, path, conflict) {
    const [filename, ...subfolders] = path.split('/').reverse();
    for (const name of subfolders.reverse()) handle = await handle.getDirectoryHandle(name, { create: true });
    const blob = typeof payload === 'string' ? await request(payload, 'blob', 300000) : payload;
    const write = async () => {
      let name = filename;
      if (conflict !== 'overwrite') {
        const dot = filename.lastIndexOf('.');
        let index = 2;
        while (true) {
          try {
            await handle.getFileHandle(name);
          } catch (error) {
            if (error.name === 'NotFoundError') break;
            if (error.name !== 'TypeMismatchError') throw error;
          }
          name = filename.slice(0, dot) + ' (' + index++ + ')' + filename.slice(dot);
        }
      }
      const file = await handle.getFileHandle(name, { create: true });
      const stream = await file.createWritable();
      try {
        await stream.write(blob);
        await stream.close();
      } catch (error) {
        await stream.abort().catch(() => {});
        throw error;
      }
      return { state: 'saved', path: [...subfolders, name].join('/') };
    };
    return navigator.locks ? navigator.locks.request('media-downloader:directory', write) : write();
  }

  async function saveFile(payload, path, settings, handle) {
    if (handle) return writeFile(handle, payload, path, settings.conflict);
    if (GM_info.downloadMode === 'browser') {
      return { state: await gmDownload(payload, path, settings), path };
    }
    if (path.includes('/') || settings.saveAs || settings.conflict !== 'uniquify') {
      throw new Error(downloadErrors.not_enabled);
    }
    const blob = typeof payload === 'string' ? await request(payload, 'blob', 300000) : payload;
    return { state: anchorDownload(blob, path), path };
  }

  const filenameOf = path => path.split('/').at(-1);

  function renderMetadata(values, settings) {
    return Object.fromEntries(Object.entries(settings.metadata).map(([key, value]) =>
      [key, render(value, values, settings.missing)]));
  }

  async function saveMedia(job, outer, settings, handle, paths) {
    const { post, layer, item, position } = job;
    let source = item.kind === 'photo'
      ? item.source ? settings.original ? item.source : { ...item.source, url: item.photo }
        : photoSource(item.photo, settings.original)
      : videoSource(item, settings.quality);
    if (!source) throw new Error('未取得可下载的视频文件地址');
    const photo = item.kind === 'photo' ? await preparePhoto(item, source) : null;
    if (photo) source = photo.source;
    const values = contextFor(post, outer, layer, item, source, position, settings);
    const path = uniquePath(filePath(values, settings), candidate => paths.has(candidate.toLowerCase()));
    paths.add(path.toLowerCase());
    values.filename = filenameOf(path);
    let payload = photo?.blob || source.url;
    let sidecar = photo ? ['json', 'both'].includes(settings.metadataMode) : settings.videoJson;
    let metadataNotice = '';
    if (photo && ['auto', 'both'].includes(settings.metadataMode)) {
      try {
        payload = await embedPhoto(photo, renderMetadata(values, settings));
      } catch (error) {
        sidecar = true;
        if (!['gif', 'avif'].includes(source.ext)) metadataNotice = values.filename + ' 的 XMP 已改存 JSON（' + error.message + '）';
      }
    }
    const media = await saveFile(payload, path, settings, handle);
    if (sidecar) {
      values.filename = filenameOf(media.path);
      const json = new Blob([JSON.stringify(renderMetadata(values, settings), null, 2) + '\n'],
        { type: 'application/json' });
      try {
        await saveFile(json, media.path + '.json', settings, handle);
      } catch (error) {
        metadataNotice = values.filename + ' 的 JSON 元数据保存失败（' + error.message + '）';
      }
    }
    return { state: media.state, warning: metadataNotice };
  }

  let style;
  function ensureStyles() {
    if (style?.isConnected) return;
    style = document.createElement('style');
    style.textContent = [
      '.xmd-download{display:inline-flex;flex:0 0 auto;align-self:center;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:50%;padding:4px;margin:0;margin-inline-start:10px;color:var(--xmd-color,#536471);background:transparent;cursor:pointer}',
      '.xmd-share-actions{display:inline-flex!important;flex-direction:row!important;align-items:center}',
      '.xmd-download.xmd-floating-download{width:var(--xmd-native-action-size,28px);height:var(--xmd-native-action-size,28px);padding:0;margin-inline-start:clamp(10px,4vw,22px)}',
      '.xmd-download svg{width:1.18em;height:1.18em;flex:none;fill:currentColor}',
      '.xmd-download:hover,.xmd-download:focus-visible{color:#1d9bf0;background:rgba(29,155,240,.12)}',
      '.xmd-download:disabled{cursor:progress;opacity:.55}',
      '.xmd-dialog,.xmd-toast{box-sizing:border-box;font:14px/1.45 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#0f1419;background:#fff;border:1px solid #cfd9de;border-radius:16px}',
      '.xmd-dark{background:#15202b;color:#f7f9f9;border-color:#536471;color-scheme:dark}',
      '.xmd-dialog{width:min(680px,calc(100vw - 28px));max-height:calc(100vh - 40px);padding:0;overscroll-behavior:contain}',
      '.xmd-dialog::backdrop{background:rgba(0,0,0,.56)}',
      '.xmd-dialog form{margin:0;padding:20px 22px}',
      '.xmd-dialog h2{font-size:21px;margin:0 0 14px}',
      '.xmd-dialog header{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 22px;background:#fff;border-bottom:1px solid #cfd9de}',
      '.xmd-dark header{background:#15202b;border-color:#536471}',
      '.xmd-dialog header h2{font-size:18px;margin:0}',
      '.xmd-dialog header button{flex:none}',
      '.xmd-dialog .xmd-formats{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}',
      '.xmd-formats code{font-size:12px;font-weight:700;padding:2px 7px;border:1px solid #8899a6;border-radius:5px}',
      '.xmd-dialog fieldset{border:1px solid #cfd9de;border-radius:10px;padding:10px 12px;margin:0 0 14px;min-width:0}',
      '.xmd-dark fieldset{border-color:#536471}',
      '.xmd-dialog legend{padding:0 5px;font-weight:700}',
      '.xmd-dialog label{display:block;margin:7px 0}',
      '.xmd-dialog input:not([type=checkbox]),.xmd-dialog select,.xmd-dialog textarea{display:block;box-sizing:border-box;width:100%;font:inherit;color:inherit;background:transparent;border:1px solid #8899a6;border-radius:7px;padding:6px 8px;margin-top:3px}',
      '.xmd-dialog textarea,.xmd-dialog code{font-family:ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}',
      '.xmd-dialog output{display:block;overflow-wrap:anywhere;margin:6px 0}',
      '.xmd-dialog small{display:block;margin:5px 0;opacity:.83}',
      '.xmd-dialog button,.xmd-toast button{font:inherit;color:inherit;border:1px solid #8899a6;border-radius:18px;padding:5px 11px;background:transparent;cursor:pointer}',
      '.xmd-dialog button[type=submit]{background:#0866a9;color:white;border-color:transparent;font-weight:700}',
      '.xmd-dialog footer{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}',
      '.xmd-dialog [hidden]{display:none!important}',
      '.xmd-dialog dl{display:grid;grid-template-columns:max-content 1fr;gap:3px 9px}',
      '.xmd-dialog dd{margin:0}.xmd-dialog summary,.xmd-toast summary{cursor:pointer}',
      '.xmd-toast{position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:min(430px,calc(100vw - 32px));max-height:46vh;overflow:auto;padding:12px 14px;box-shadow:0 3px 16px #0003;overflow-wrap:anywhere}',
      '.xmd-toast button{margin:0 0 4px 8px;float:right}.xmd-toast details{margin-top:4px}.xmd-toast ul{padding-left:21px}',
      '@media(max-width:480px){.xmd-download:not(.xmd-floating-download){width:23px;height:26px;padding:3px;margin-inline-start:8px}.xmd-dialog form{padding:12px}}',
    ].join('\n') + (site === 'x' ? '' : '\n' + nativeButtonStyles);
    document.documentElement.append(style);
  }

  function element(tag, text = '') {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function darkMode() {
    if (!document.body) return false;
    const channels = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.map(Number);
    return Boolean(channels && channels.slice(0, 3).every(value => value < 90) && channels[3] !== 0);
  }

  let previousToast;
  function notify(message, notes = [], persistent = false) {
    previousToast?.remove();
    ensureStyles();
    const toast = element('aside');
    toast.className = 'xmd-toast' + (darkMode() ? ' xmd-dark' : '');
    const dismiss = element('button', '关闭');
    dismiss.type = 'button';
    dismiss.addEventListener('click', () => toast.remove());
    const status = element('div', message);
    status.setAttribute('role', 'status');
    toast.append(dismiss, status);
    if (notes.length) {
      const details = element('details');
      const list = element('ul');
      for (const note of notes) list.append(element('li', note));
      details.append(element('summary', '查看详情（' + notes.length + ' 项）'), list);
      toast.append(details);
    }
    document.body.append(toast);
    previousToast = toast;
    if (!persistent && !notes.length) setTimeout(() => toast.remove(), 5000);
  }

  const viewerArrow = 'M12 16l5.7-5.7-1.41-1.42L13 12.18V2.59h-2v9.59l-3.3-3.3-1.41 1.42L12 16z';
  const postArrow = 'M12 17.25l5.7-5.7-1.41-1.42L13 13.43V2.59h-2v10.84l-3.3-3.3-1.41 1.42L12 17.25z';
  const tray = 'M21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z';
  const menu = '聚合媒体下载设置（' + siteNames[site] + '）';

  function syncButtonAppearance(button, share, floating) {
    const svg = share.querySelector('svg');
    const path = svg?.querySelector('path');
    if (!share.matches(':hover') || !button.style.getPropertyValue('--xmd-color')) {
      const fill = path && getComputedStyle(path).fill;
      const color = [fill, svg && getComputedStyle(svg).color]
        .find(value => value?.startsWith('rgb') && value !== 'rgb(29, 155, 240)') ||
        (floating ? '#fff' : darkMode() ? '#71767a' : '#536471');
      // X uses 123 for the blue channel on some dark-theme controls.
      const matched = color === 'rgb(113, 118, 123)' ? 'rgb(113, 118, 122)' : color;
      if (button.style.getPropertyValue('--xmd-color') !== matched) button.style.setProperty('--xmd-color', matched);
    }
    const width = svg?.getBoundingClientRect().width;
    const size = (width || 18) / 1.18 + 'px';
    if (button.style.fontSize !== size) button.style.fontSize = size;
    if (floating && width) button.style.setProperty('--xmd-native-action-size', width + 'px');
  }

  function makeButton(root) {
    const button = element('button');
    button.className = BUTTON;
    button.type = 'button';
    button.title = '下载此帖媒体（右键打开设置）';
    button.setAttribute('aria-label', '下载此帖媒体');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const arrowPath = document.createElementNS(svg.namespaceURI, 'path');
    const inViewer = root.closest(VIEWER) && MEDIA_ROUTE.test(location.pathname);
    arrowPath.setAttribute('d', inViewer ? viewerArrow : postArrow);
    arrowPath.setAttribute('transform', 'translate(0 -1.6)');
    const trayPath = document.createElementNS(svg.namespaceURI, 'path');
    trayPath.setAttribute('d', tray);
    svg.append(arrowPath, trayPath);
    button.append(svg);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      startDownload(root, button);
    });
    button.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openSettings();
    });
    return button;
  }

  async function selectedDirectory(settings) {
    if (settings.destination !== 'directory') return null;
    if (!directory) throw new Error('请在设置中选择本地文件夹');
    if (await directory.requestPermission({ mode: 'readwrite' }) !== 'granted') {
      throw new Error('Chrome 未授予所选文件夹的写入权限');
    }
    return directory;
  }

  function startDownload(root, button) {
    const settings = options();
    const snapshot = inspect(root);
    if (!snapshot) {
      notify('未能识别当前帖子的链接');
      return;
    }
    enqueueDownload(snapshot.outer.id, button, settings, () => resolvePosts(snapshot, settings, snapshot.gallery));
  }

  function enqueueDownload(id, button, settings, resolve) {
    if (active.has(id)) {
      notify('此帖已在下载队列中');
      return;
    }
    if (settings.destination === 'directory' && !directory) {
      openSettings();
      notify('请在设置中选择本地文件夹');
      return;
    }
    const directoryPromise = selectedDirectory(settings).then(handle => ({ handle }), error => ({ error }));
    if (settings.destination === 'browser' && settings.folder && GM_info.downloadMode !== 'browser') {
      notify('子文件夹需要 Tampermonkey 的浏览器 API 下载模式',
        ['管理面板 → 设置 → 高级 → 下载 BETA → 浏览器 API → 保存。也可在本脚本中选择本地文件夹。']);
      return;
    }
    active.add(id);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    queue = queue.then(async () => {
      const { handle, error } = await directoryPromise;
      if (error) throw error;
      if (settings.feedback) notify('正在读取帖子媒体…', [], true);
      const { posts, warnings } = await resolve();
      const jobs = posts.flatMap((post, layer) => post.media.map((item, position) =>
        ({ post, layer, item, position })).filter(({ item }) => settings[item.kind]));
      if (!jobs.length) {
        notify('未找到符合设置的图片或视频', warnings);
        return;
      }
      let saved = 0;
      let requested = 0;
      let failures = 0;
      const paths = new Set();
      for (const [index, job] of jobs.entries()) {
        if (settings.feedback) notify('正在处理 ' + (index + 1) + '/' + jobs.length + ' 项媒体…', [], true);
        try {
          const result = await saveMedia(job, posts[0], settings, handle, paths);
          if (result.state === 'saved') saved++;
          else requested++;
          if (result.warning) warnings.push(result.warning);
        } catch (error) {
          failures++;
          warnings.push(at(job.post.handle) + ' / ' + (job.post.id || '引用帖') + ' / 媒体 ' + (job.position + 1) + '：' + error.message);
        }
      }
      const parts = [];
      if (saved) parts.push('已保存 ' + saved + ' 项媒体');
      if (requested) parts.push('已提交 ' + requested + ' 项，请查看 Chrome 下载记录');
      if (failures) parts.push(failures + ' 项失败');
      if (settings.feedback || warnings.length) notify(parts.join('，'), warnings);
    }).catch(error => notify('下载未开始', [error.message])).finally(() => {
      active.delete(id);
      button.disabled = false;
      button.removeAttribute('aria-busy');
    });
  }

  function shareButton(group) {
    const candidates = [...group.querySelectorAll('button,[role="button"]')]
      .filter(button => button.closest('[role="group"]') === group);
    return candidates.find(button => button.dataset.testid === 'share' ||
      button.querySelector('[data-testid="share"]') ||
      /^(share(?: this (?:post|tweet))?|分享(?:此帖|帖子|推文)?|分享貼文|共有(?:する)?|compartir|partager)$/i.test(button.getAttribute('aria-label') || '') ||
      [...button.querySelectorAll('svg path')].some(path => path.getAttribute('d')?.startsWith(SHARE)));
  }

  function cachedMedia(id, depth) {
    const post = cache.get(id);
    return Boolean(post?.media.length || (depth > 0 && post?.quoteId && cachedMedia(post.quoteId, depth - 1)));
  }

  function attach(group, root, settings) {
    const share = shareButton(group);
    const existing = [...group.querySelectorAll('.' + BUTTON)].find(button => button.closest('[role="group"]') === group);
    const removeButton = () => {
      existing?.parentElement.classList.remove('xmd-share-actions');
      existing?.remove();
    };
    if (!share) {
      removeButton();
      return;
    }
    const snapshot = inspect(root);
    const show = snapshot && (settings.button === 'all' ||
      snapshot.outer.media.length || (snapshot.hasQuote && settings.quoteDepth > 0) ||
      cachedMedia(snapshot.outer.id, settings.quoteDepth) ||
      snapshot.gallery);
    if (!show) {
      removeButton();
      return;
    }
    const button = existing || makeButton(root);
    const floating = snapshot.gallery && root.matches(VIEWER);
    syncButtonAppearance(button, share, floating);
    if (floating) {
      let slot = share;
      while (slot.parentElement !== group) slot = slot.parentElement;
      button.classList.add('xmd-floating-download');
      if (slot.nextElementSibling !== button) slot.after(button);
      return;
    }
    const row = share.parentElement;
    if (row !== group && row.childElementCount === 1) row.classList.add('xmd-share-actions');
    if (share.nextElementSibling !== button) share.after(button);
  }

  let scanFrame = 0;
  function scheduleScan() {
    if (scanFrame || !document.body) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      const settings = options();
      if (site !== 'x') {
        scanOtherSite();
        return;
      }
      for (const article of document.querySelectorAll(ARTICLE)) {
        for (const group of article.querySelectorAll('[role="group"]')) {
          if (group.closest(ARTICLE) === article) attach(group, article, settings);
        }
      }
      if (MEDIA_ROUTE.test(location.pathname)) {
        for (const dialog of document.querySelectorAll(VIEWER)) {
          for (const group of dialog.querySelectorAll('[role="group"]')) {
            if (!group.closest(ARTICLE) && group.closest(VIEWER) === dialog) attach(group, dialog, settings);
          }
        }
      }
    });
  }

  function optionGroup(parent, title) {
    const group = element('fieldset');
    group.append(element('legend', title));
    parent.append(group);
    return group;
  }

  function openSettings() {
    if (settingsDialog?.open) return;
    ensureStyles();
    const settings = options();
    let selectedFolder = directory;
    const dialog = element('dialog');
    dialog.className = 'xmd-dialog' + (darkMode() ? ' xmd-dark' : '');
    dialog.setAttribute('aria-labelledby', 'xmd-settings-title');
    const form = element('form');
    const heading = element('h2', menu);
    heading.id = 'xmd-settings-title';
    const header = element('header');
    const close = element('button', '关闭 ✕');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭设置，不保存修改');
    close.addEventListener('click', () => dialog.close());
    header.append(heading, close);
    const controls = {};

    function field(parent, key, labelText, type = 'text', choices) {
      const label = element('label');
      const labelTitle = element('span', labelText);
      const input = element(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input');
      if (type === 'select') {
        for (const [value, name] of choices) {
          const option = element('option', name);
          option.value = value;
          input.append(option);
        }
      } else if (type === 'textarea') {
        input.rows = 9;
        input.spellcheck = false;
      } else {
        input.type = type;
      }
      if (type === 'checkbox') {
        input.checked = settings[key];
        label.append(input, ' ', labelTitle);
      } else {
        input.value = type === 'textarea' ? JSON.stringify(settings[key], null, 2) : settings[key];
        label.append(labelTitle, input);
      }
      parent.append(label);
      controls[key] = { input, label, type };
      return input;
    }

    const locationGroup = optionGroup(form, '保存位置');
    const destination = field(locationGroup, 'destination', '下载方式', 'select', [
      ['browser', 'Chrome 下载目录'], ['directory', '手动选择本地文件夹'],
    ]);
    const folder = field(locationGroup, 'folder', 'Chrome 子文件夹模板（相对于 Chrome 下载目录）');
    folder.placeholder = site === 'x' ? 'X/%handle%' : defaults.folder + '/%author%';
    folder.maxLength = 320;
    field(locationGroup, 'saveAs', '每个文件下载时询问保存位置', 'checkbox');
    const conflict = field(locationGroup, 'conflict', '文件名重复时', 'select', [
      ['uniquify', '自动追加序号'], ['overwrite', '覆盖已有文件'], ['prompt', '由 Chrome 询问'],
    ]);
    const locationHelp = element('small');
    const downloadMode = element('small');
    const browserApi = GM_info.downloadMode === 'browser';
    downloadMode.textContent = browserApi ? 'Tampermonkey 下载模式：浏览器 API。'
      : 'Tampermonkey 尚未启用浏览器 API。子文件夹、询问保存位置和重名处理需要此模式。请在 Tampermonkey 管理面板 → 设置 → 下载 BETA 中选择浏览器 API 并保存。';
    locationGroup.append(locationHelp);
    const pick = element('button', '选择本地文件夹…');
    pick.type = 'button';
    const chosen = element('small');
    const updateDirectory = () => {
      const custom = destination.value === 'directory';
      folder.disabled = custom;
      controls.folder.label.hidden = custom;
      controls.saveAs.label.hidden = custom;
      downloadMode.hidden = custom;
      pick.hidden = chosen.hidden = !custom;
      conflict.querySelector('option[value="prompt"]').disabled = custom;
      if (custom && conflict.value === 'prompt') conflict.value = 'uniquify';
      chosen.textContent = selectedFolder ? '当前已选：' + selectedFolder.name + '（最终保存目录）'
        : '尚未选择文件夹。刷新页面后需重新选择。';
      locationHelp.textContent = custom
        ? '文件直接保存到所选文件夹。Chrome 子文件夹模板在此方式下不生效。例如选择 Downloads/Chrome/X，文件就保存在该文件夹中。'
        : '子文件夹路径用 / 分隔。Chrome/X 表示「Chrome 下载目录/Chrome/X」。请在 chrome://settings/downloads 核对 Chrome 下载目录，避免重复填写已有的目录层级。留空则直接使用 Chrome 下载目录。';
    };
    destination.addEventListener('change', () => { updateDirectory(); refreshPreview(); });
    pick.addEventListener('click', async () => {
      try {
        if (typeof page.showDirectoryPicker !== 'function') throw new Error('当前浏览器不支持本地文件夹选择');
        selectedFolder = await page.showDirectoryPicker({ id: 'media-downloader', mode: 'readwrite', startIn: 'downloads' });
        updateDirectory();
        refreshPreview();
      } catch (error) {
        if (error.name !== 'AbortError') chosen.textContent = '无法选择文件夹：' + error.message;
      }
    });
    locationGroup.append(downloadMode, pick, chosen);
    updateDirectory();

    const media = optionGroup(form, '下载范围');
    media.append(element('small', '格式由平台提供的媒体决定，脚本保留实际格式，不转换文件。'));
    function mediaGroup(title, key, label, formats) {
      const group = optionGroup(media, title);
      field(group, key, label, 'checkbox');
      const badges = element('div');
      badges.className = 'xmd-formats';
      badges.setAttribute('aria-label', title + '常见格式');
      badges.append(...formats.map(format => element('code', format)));
      group.append(badges);
      return group;
    }
    const photos = mediaGroup('图片', 'photo', '下载图片', ['JPG / JPEG', 'PNG', 'WebP', 'AVIF', 'GIF']);
    field(photos, 'original', '优先下载平台提供的原尺寸图片', 'checkbox');
    const mode = field(photos, 'metadataMode', '图片元数据', 'select', [
      ['auto', '图片写入 XMP，无法内嵌时保存 JSON'],
      ['both', '图片写入 XMP，同时保存图片 JSON'],
      ['json', '仅保存图片 JSON'], ['off', '关闭图片元数据'],
    ]);
    if (site !== 'bili') {
      const videos = mediaGroup('视频', 'video', '下载视频', ['MP4']);
      if (site === 'x') {
        const gifs = mediaGroup('动图', 'gif', '下载 X 动图', ['MP4']);
        gifs.append(element('small', 'X 动图保存为平台提供的 MP4 文件。图片中的 GIF 按图片设置下载。'));
      }
      if (site === 'xhs') {
        const live = mediaGroup('实况照片', 'live', '下载实况照片的动态部分', ['MP4']);
        live.append(element('small', '静态照片由「图片」设置控制。动态部分单独保存为 MP4。'));
      }
      field(videos, 'quality', site === 'x' ? '画质（视频和动图共用）' : '画质（视频和实况片段共用）', 'select', [
        ['best', '优先最高码率'], ['720', '优先约 720p 或更低'], ['small', '优先较小的版本'],
      ]);
      field(videos, 'videoJson', site === 'x' ? '为视频和动图另存 JSON' : '为视频和实况片段另存 JSON', 'checkbox');
    } else {
      media.append(element('small', 'B 站当前支持动态和图文中的图片。视频稿件下载不在当前支持范围内。'));
    }
    if (site === 'x') {
      const quotes = optionGroup(form, 'X 引用帖');
      field(quotes, 'quoteDepth', '引用深度（0 仅下载当前帖）', 'number').min = 0;
      controls.quoteDepth.input.max = 5;
      controls.quoteDepth.input.required = true;
      field(quotes, 'attribution', '引用媒体的命名及通用元数据', 'select', [
        ['source', '使用媒体所属帖的信息'], ['outer', '使用外层帖的信息，同时保留来源字段'],
      ]);
      field(quotes, 'lookup', '页面数据不完整时查询 X 的公开嵌入服务', 'checkbox');
    }
    const naming = optionGroup(form, '文件名');
    const template = field(naming, 'filename', '文件名模板');
    template.required = true;
    template.maxLength = 420;
    field(naming, 'timezone', '%date% 和 %time% 使用的时区', 'select', [
      ['local', '浏览器本地时区'], ['china', '北京时间'], ['utc', 'UTC'],
    ]);
    field(naming, 'titleLength', '%postname% 最大字符数', 'number').min = 1;
    controls.titleLength.input.max = 250;
    controls.titleLength.input.required = true;
    field(naming, 'missing', '缺失字段的替代文字（可留空）').maxLength = 80;
    const preview = element('output');
    locationGroup.append(preview);

    const metadata = optionGroup(form, '元数据字段与模板');
    const textarea = field(metadata, 'metadata', '字段模板（JSON）', 'textarea');
    metadata.append(element('small', '每行设置字段名与模板，例如 "description": "%posttext%"。可删除或新增字段。title、creator、description、source、identifier、created 同时映射到标准 XMP 字段。'));
    const reference = element('details');
    const legend = element('dl');
    for (const [key, description] of Object.entries(fields)) {
      const term = element('dt');
      term.append(element('code', '%' + key + '%'));
      legend.append(term, element('dd', description));
    }
    reference.append(element('summary', '查看全部模板字段'), legend, element('small', '用 %% 输出一个百分号。'));
    metadata.append(reference);

    const ui = optionGroup(form, siteNames[site] + ' 的按钮与提示');
    ui.append(element('small', {
      x: '时间线和图片查看器：下载按钮位于分享按钮旁。右键下载按钮可打开设置。',
      bili: '动态列表：下载按钮位于操作栏。图文详情：下载按钮位于侧边工具栏。右键下载按钮可打开设置。',
      xhs: '笔记详情：下载按钮位于分享按钮旁。图片预览：带 all 标记的按钮下载整篇笔记。右键下载按钮可打开设置。',
    }[site]));
    ui.append(element('small', '本页设置仅对 ' + siteNames[site] + ' 生效。其他平台的设置单独保存。'));
    if (site === 'x') field(ui, 'button', '显示下载按钮', 'select', [
      ['media', '媒体帖、引用帖和图片查看器'], ['all', '所有可识别的帖子'],
    ]);
    field(ui, 'feedback', '显示下载进度和成功提示', 'checkbox');

    function read() {
      return Object.fromEntries(Object.entries(controls).map(([key, { input, type }]) => [
        key, type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value) : input.value,
      ]));
    }
    function refreshPreview() {
      const current = read();
      controls.metadata.label.hidden = mode.value === 'off' && !controls.videoJson?.input.checked;
      const demo = { ...Object.fromEntries(Object.keys(fields).map(key => [key, ''])),
        date: '2026-11-10', time: '164000', handle: 'labrin', at: '@labrin', author: 'Labrin',
        postid: '1987654321000000000', sourceid: '1987654321000000000', medianame: 'ExampleImage',
        postname: '示例帖子正文首行', type: 'photo', index: 2, index2: '02', total: 4,
        photoindex: 2, photototal: 4, mediaindex: 2, mediatotal: 4, layer: 0, ext: 'jpg', platform: siteNames[site], assetindex: 2 };
      const base = current.destination === 'directory' ? (selectedFolder?.name || '尚未选择的文件夹') : 'Chrome 下载目录';
      preview.textContent = '示例保存位置：' + base + '/' + filePath(demo, current);
      if (current.destination === 'browser' && (current.saveAs || current.conflict === 'prompt')) {
        preview.textContent += '（保存对话框中可更改最终位置）';
      }
    }
    form.addEventListener('input', refreshPreview);
    refreshPreview();

    const message = element('output');
    message.setAttribute('role', 'status');
    const footer = element('footer');
    const reset = element('button', '恢复默认值');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      for (const [key, { input, type }] of Object.entries(controls)) {
        if (type === 'checkbox') input.checked = defaults[key];
        else input.value = type === 'textarea' ? JSON.stringify(defaultMetadata, null, 2) : defaults[key];
      }
      updateDirectory();
      refreshPreview();
      message.textContent = '已填入默认值，点击保存设置后生效。';
    });
    const cancel = element('button', '取消');
    cancel.type = 'button';
    cancel.addEventListener('click', () => dialog.close());
    const save = element('button', '保存设置');
    save.type = 'submit';
    footer.append(reset, cancel, save);
    form.append(message, footer);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const value = read();
      if (value.destination === 'browser' && (/^[~/\\]|^[A-Za-z]:|\\/.test(value.folder) || value.folder.split('/').some(part => /^\.\.?$/.test(part.trim())))) {
        message.textContent = '子文件夹模板请使用相对路径。绝对位置请使用文件夹选择器。';
        return;
      }
      try {
        value.metadata = controls.metadata.label.hidden ? settings.metadata : JSON.parse(textarea.value);
        if (!value.metadata || Array.isArray(value.metadata) || typeof value.metadata !== 'object' ||
            Object.entries(value.metadata).some(([key, text]) => !/^[a-z][a-z0-9_]{0,63}$/i.test(key) ||
              typeof text !== 'string' || ['constructor', 'prototype'].includes(key))) {
          throw new Error('元数据模板须为 JSON 对象。字段名以英文字母开头，值使用字符串。');
        }
      } catch (error) {
        message.textContent = '元数据模板有误：' + error.message;
        return;
      }
      GM_setValue(SETTINGS, { ...settings, ...value });
      directory = selectedFolder;
      dialog.close();
      scheduleScan();
      if (value.destination === 'directory' && !directory) notify('设置已保存，请选择本地文件夹后再下载');
      else notify('设置已保存');
    });

    dialog.append(header, form);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    settingsDialog = dialog;
    dialog.showModal();
  }

  const biliCards = '.bili-dyn-item,.moment-card,.moment-card-shell';
  const biliPictures = [
    '.bili-album__preview img',
    '.opus-para-pic .bili-album img',
    '.moment-card__gallery img',
    '.moment-card__forward-gallery img',
    '.bili-dyn-gallery__track .bili-dyn-gallery__image img',
    '.opus-module-top__album .horizontal-scroll-album__indicator__thumbnail img',
    '.opus-module-top__album .horizontal-scroll-album:not(:has(.horizontal-scroll-album__indicator__thumbnail img)) .horizontal-scroll-album__pic__img img',
  ].join(',');
  const xhsNotes = '#noteContainer,.note-container';
  const otherPosts = new Map();
  const postsByPhoto = new Map();
  let initialState;
  let lastXhsNote;
  const observedShadows = new WeakSet();

  const inDomain = (host, domain) => host === domain || host.endsWith('.' + domain);
  const noteId = path => path?.match(/\/(?:explore|discovery\/item|user\/profile\/[a-f0-9]{24})\/([a-f0-9]{24})(?:\/|$)/i)?.[1] || '';
  const biliId = url => {
    const parsed = asUrl(url);
    if (!parsed || !inDomain(parsed.hostname, 'bilibili.com')) return '';
    const match = parsed.pathname.match(/^\/(?:opus|dynamic)\/(\d{10,24})(?:\/|$)/);
    return match?.[1] || (parsed.hostname === 't.bilibili.com' ? parsed.pathname.match(/^\/(\d{10,24})\/?$/)?.[1] : '') || '';
  };

  function cleanLink(value, forNavigation = false) {
    const url = asUrl(value);
    if (url?.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (inDomain(url.hostname, 'xiaohongshu.com')) {
      const id = noteId(url.pathname);
      if (!id && !/^\/(?:explore|search_result|user\/profile\/[a-f0-9]{24})\/?$/i.test(url.pathname)) return null;
      const keep = id ? forNavigation ? ['xsec_token', 'xsec_source'] : [] : ['keyword', 'type'];
      const result = new URL(id ? '/explore/' + id : url.pathname, 'https://www.xiaohongshu.com');
      for (const key of keep) {
        const value = url.searchParams.get(key);
        if (value) result.searchParams.set(key, value);
      }
      return result;
    }
    if (inDomain(url.hostname, 'bilibili.com')) {
      const id = biliId(url.href);
      if (id) return new URL('https://www.bilibili.com/opus/' + id);
      if (url.hostname === 'space.bilibili.com' && /^\/\d+(?:\/dynamic)?\/?$/.test(url.pathname)) {
        return new URL(url.pathname, url.origin);
      }
      if (url.hostname === 't.bilibili.com' && url.pathname === '/') return new URL(url.origin);
      if (url.hostname === 'www.bilibili.com' && url.pathname === '/' && url.searchParams.get('page') === 'Moments') {
        return new URL('https://www.bilibili.com/?page=Moments');
      }
      if (url.hostname === 'www.bilibili.com' && /^\/video\/(?:BV[\w]+|av\d+)\/?$/.test(url.pathname)) {
        const result = new URL(url.pathname, url.origin);
        if (/^\d+$/.test(url.searchParams.get('p') || '')) result.searchParams.set('p', url.searchParams.get('p'));
        return result;
      }
    }
    const x = status(url.href);
    return x && new URL('https://x.com/' + (x.handle || 'i') + '/status/' + x.id);
  }

  function shareUrl(text) {
    text = text.replace(/\\([:/\.])/g, '$1');
    for (const candidate of text.match(/https?:\/\/[^\s<>"“”【】]+/gi) || []) {
      const url = asUrl(candidate.replace(/[。！？），、]+$/, ''));
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) continue;
      url.protocol = 'https:';
      if (['b23.tv', 'xhslink.com', 'www.xhslink.com', 't.co'].includes(url.hostname) || cleanLink(url.href, true)) return url;
    }
    return null;
  }

  function followShare(url) {
    if (!['b23.tv', 'xhslink.com', 'www.xhslink.com', 't.co'].includes(url.hostname)) return Promise.resolve(url);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url: url.href, anonymous: true, timeout: 12000,
        onload: result => {
          const target = asUrl(result.finalUrl);
          if (target && cleanLink(target.href, true)) resolve(target);
          else reject(new Error('短链接没有跳转到支持的帖子。'));
        },
        onerror: () => reject(new Error('无法解析这个短链接。')),
        ontimeout: () => reject(new Error('短链接请求超时。')),
        onabort: () => reject(new Error('短链接请求已取消。')),
      });
    });
  }

  function openLinkTools() {
    if (document.querySelector('.xmd-link-tools')) return;
    ensureStyles();
    const dialog = element('dialog');
    dialog.className = 'xmd-dialog xmd-link-tools' + (darkMode() ? ' xmd-dark' : '');
    const form = element('form');
    form.append(element('h2', '清理或打开分享链接'));
    const label = element('label', '帖子链接或整段分享文案');
    const input = element('textarea');
    input.rows = 3;
    input.value = cleanLink(location.href, true)?.href || '';
    label.append(input);
    const output = element('output');
    output.setAttribute('role', 'status');
    const result = element('input');
    result.readOnly = true;
    result.hidden = true;
    result.setAttribute('aria-label', '清理后的链接');
    const footer = element('footer');
    const cancel = element('button', '关闭');
    cancel.type = 'button';
    cancel.addEventListener('click', () => dialog.close());
    const open = element('a', '打开链接');
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.hidden = true;
    const submit = element('button', '清理链接');
    submit.type = 'submit';
    footer.append(cancel, open, submit);
    form.append(label, output, result, footer);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      result.hidden = open.hidden = true;
      try {
        const pasted = shareUrl(input.value);
        if (!pasted) throw new Error('没有找到可识别的分享链接。');
        submit.disabled = true;
        const url = await followShare(pasted);
        const cleaned = cleanLink(url.href, true);
        if (!cleaned) throw new Error('未找到可打开的帖子链接。');
        result.value = cleaned.href;
        open.href = cleaned.href;
        result.hidden = open.hidden = false;
        output.textContent = '已去除统计参数。';
        result.select();
      } catch (error) {
        output.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    dialog.append(form);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }

  function allowedAsset(value, domain) {
    const url = asUrl(value);
    if (typeof value !== 'string' || !value || !url || !['http:', 'https:'].includes(url.protocol) ||
        url.username || url.password || url.port || !inDomain(url.hostname, domain)) return null;
    url.protocol = 'https:';
    url.hash = '';
    return url;
  }

  function biliImage(value) {
    const url = allowedAsset(value, 'hdslb.com');
    if (!url || !url.pathname.startsWith('/bfs/')) return null;
    const preview = url.href;
    url.pathname = url.pathname.split('@')[0];
    url.search = '';
    const id = url.pathname.split('/').at(-1).replace(/\.[^.]+$/, '');
    return { kind: 'photo', id, photo: preview, source: { url: url.href, ext: 'jpg' } };
  }

  function xhsImage(value, original = value, fileId = '') {
    const url = allowedAsset(value, 'xhscdn.com');
    const originalKey = typeof fileId === 'string' && /^[a-z0-9_/-]+$/i.test(fileId) && fileId;
    const full = originalKey ? new URL('https://sns-img-bd.xhscdn.com/' + originalKey.replace(/^\/+/, ''))
      : allowedAsset(original, 'xhscdn.com') || url;
    if (!full || /avatar|emoji|icon/.test(full.hostname) || /\/(?:avatar|emoji)\//.test(full.pathname)) return null;
    const id = full.pathname.split('/').at(-1).split('!')[0].replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, '');
    return { kind: 'photo', id, photo: (url || full).href, source: { url: full.href, ext: 'jpg' },
      alternative: allowedAsset(original, 'xhscdn.com')?.href };
  }

  function uniqueAssets(items) {
    const seen = new Set();
    return items.filter(item => {
      if (!item) return false;
      const key = item.kind + ':' + (item.photoNumber || item.pairedPhoto || item.id || item.source?.url || item.variants?.[0]?.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mediaTime(value) {
    const parsed = Number(value);
    return parsed > 0 ? published(parsed < 1e12 ? parsed * 1000 : parsed) : '';
  }

  function domTime(element) {
    const raw = element?.getAttribute('datetime') || element?.getAttribute('title') || element?.textContent?.trim() || '';
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return published(raw);
    const match = raw.match(/^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!match) return '';
    const [, year, month, day, hour, minute, second] = match;
    if (!hour) return '';
    return published(year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') +
      'T' + hour.padStart(2, '0') + ':' + minute + ':' + (second || '00') + '+08:00');
  }

  function biliPost(data) {
    const id = numeric(data?.id_str, data?.id);
    const modules = Array.isArray(data?.modules)
      ? Object.assign({}, ...data.modules.map(module => Object.fromEntries(Object.entries(module).filter(([, v]) => v != null))))
      : data?.modules;
    const dynamic = modules?.module_dynamic;
    const author = modules?.module_author;
    const paragraphs = modules?.module_content?.paragraphs;
    if (!id || !author || (!dynamic && !Array.isArray(paragraphs))) return null;
    const opus = dynamic?.major?.opus;
    const pics = opus?.pics || dynamic?.major?.draw?.items ||
      (paragraphs || []).flatMap(paragraph => paragraph.pic?.pics || []);
    const topPics = modules?.module_top?.display?.album?.pics || [];
    const paragraphText = (paragraphs || []).flatMap(paragraph => paragraph.text?.nodes
      ?.map(node => node.word?.words || node.rich?.text || node.user?.name || '') || []).join('\n');
    const text = string(opus?.summary?.text ?? dynamic?.desc?.text ?? paragraphText);
    return {
      platform: 'bili', id, url: 'https://www.bilibili.com/opus/' + id,
      author: author.name || '', authorId: numeric(author.mid), time: mediaTime(author.pub_ts),
      title: opus?.title || modules?.module_title?.text || '', text,
      textComplete: Boolean(opus?.summary || dynamic?.desc || paragraphs),
      media: uniqueAssets([...topPics, ...pics].map(pic => biliImage(pic.url || pic.src))),
      original: biliPost(data.orig),
    };
  }

  function xhsVariants(stream, direct) {
    const fromList = entries => (Array.isArray(entries) ? entries : []).flatMap(entry => {
      if (!entry || typeof entry !== 'object') return [];
      const backups = entry.backupUrls || entry.backup_urls;
      const urls = [entry.masterUrl || entry.master_url, ...(Array.isArray(backups) ? backups : [])];
      return urls.map(value => ({
        value, bitrate: Number(entry.avgBitrate || entry.videoBitrate || entry.video_bitrate) || 0,
        pixels: (Number(entry.width) * Number(entry.height)) || 0,
      }));
    });
    const playable = candidates => [...new Map(candidates.flatMap(item => {
      const url = allowedAsset(item.value, 'xhscdn.com');
      const ext = url?.pathname.match(/\.(mp4|mov|m4v)$/i)?.[1]?.toLowerCase();
      return ext ? [[url.href, { url: url.href, ext, bitrate: item.bitrate || 0, pixels: item.pixels || 0 }]] : [];
    })).values()];
    const preferred = playable([...fromList(stream?.h264), ...fromList(stream?.EF4)]);
    const other = preferred.length ? preferred : playable(
      ['h265', 'av1', 'EF5', 'EF6', 'EF7'].flatMap(codec => fromList(stream?.[codec])));
    return other.length ? other : playable([{ value: direct }]);
  }

  function xhsVideo(data) {
    let extra = data?.mediaV2 || data?.media_v2;
    if (typeof extra === 'string') {
      try { extra = JSON.parse(extra); } catch { extra = null; }
    }
    const key = data?.consumer?.originVideoKey || extra?.consumer?.originVideoKey;
    const direct = data?.url || data?.masterUrl || (typeof key === 'string' &&
      /^[a-z0-9_/-]+\.(mp4|mov|m4v)$/i.test(key) ? 'https://sns-video-bd.xhscdn.com/' + key.replace(/^\/+/, '') : '');
    return xhsVariants(data?.media?.stream || data?.stream || extra?.media?.stream || extra?.stream, direct);
  }

  function xhsPost(data, idHint = '') {
    const id = String(data?.noteId || data?.note_id || idHint);
    const pics = data?.imageList || data?.image_list;
    if (!/^[a-f0-9]{24}$/i.test(id) || (!Array.isArray(pics) && !data?.video)) return null;
    const user = data.user || {};
    const videoNote = ['video', 'video_note'].includes(data.type) || Boolean(data.video && !data.type);
    const media = [];
    if (videoNote) media.push({ kind: 'video', id, variants: xhsVideo(data.video) });
    else for (const [index, item] of (pics || []).entries()) {
      const known = item.infoList || item.info_list || [];
      const defaultUrl = known.find(entry => /^(?:WB_DFT|ORIGIN)$/.test(entry.imageScene || entry.image_scene))?.url;
      const still = xhsImage(item.urlPre || item.url_pre || item.url || item.urlDefault || item.url_default || defaultUrl,
        item.urlDefault || item.url_default || defaultUrl || item.url, item.fileId || item.file_id);
      if (still) media.push({ ...still, photoNumber: index + 1 });
      const stream = item.stream || item.livePhoto?.stream || item.live_photo?.stream;
      if (item.livePhoto || item.live_photo || stream) {
        const clip = xhsVariants(stream, item.videoUrl || item.video_url);
        if (clip.length) media.push({ kind: 'live', id: still?.id || id + '-' + index, pairedPhoto: index + 1, variants: clip });
      }
    }
    return {
      platform: 'xhs', id, url: 'https://www.xiaohongshu.com/explore/' + id,
      author: user.nickname || user.nickName || user.nick_name || '',
      authorId: user.userId || user.user_id || '', time: mediaTime(data.time || data.createTime || data.create_time),
      title: string(data.title), text: string(data.desc), textComplete: typeof data.desc === 'string',
      media: uniqueAssets(media),
    };
  }

  function rememberOther(post) {
    if (!post) return;
    if (post.original) rememberOther(post.original);
    const previous = otherPosts.get(post.id);
    // An unloaded note card can contain just one cover. Keep the fuller detail response.
    if (previous && previous.media.length > post.media.length) return;
    otherPosts.delete(post.id);
    otherPosts.set(post.id, post);
    for (const item of post.media) {
      if (item.kind !== 'photo') continue;
      const ids = postsByPhoto.get(item.id) || new Set();
      ids.add(post.id);
      postsByPhoto.set(item.id, ids);
    }
    if (otherPosts.size <= 450) return;
    const first = otherPosts.keys().next().value;
    const removed = otherPosts.get(first);
    otherPosts.delete(first);
    for (const item of removed.media) {
      const ids = postsByPhoto.get(item.id);
      ids?.delete(first);
      if (ids && !ids.size) postsByPhoto.delete(item.id);
    }
  }

  function otherApi(value) {
    const url = asUrl(value?.url || value);
    if (!url || !/^https:$/.test(url.protocol)) return false;
    return site === 'bili' ? url.hostname === 'api.bilibili.com' &&
      /^\/x\/polymer\/web-dynamic\//.test(url.pathname)
      : inDomain(url.hostname, 'xiaohongshu.com') &&
      /\/api\/sns\/web\/v\d+\/(?:feed|note\/detail)(?:\/|$)/.test(url.pathname);
  }

  function captureOther(response) {
    if (site === 'bili') {
      const data = response?.data || response;
      for (const item of Array.isArray(data?.items) ? data.items : [data?.item, data?.dynamic, data]) {
        rememberOther(biliPost(item));
      }
    } else {
      const data = response?.data || response;
      for (const item of Array.isArray(data?.items) ? data.items : [data]) {
        rememberOther(xhsPost(item?.note_card || item?.noteCard || item, item?.id));
      }
    }
    scheduleScan();
  }

  function readInitialState() {
    const state = page.__INITIAL_STATE__ || page.__INITIAL_DATA__;
    if (!state || initialState === state) return;
    initialState = state;
    if (site === 'bili') {
      for (const candidate of [state, state.detail, state.dynamic, state.opus, state.opusDetail]) captureOther(candidate);
    } else {
      for (const [id, entry] of Object.entries(state.note?.noteDetailMap || {})) {
        rememberOther(xhsPost(entry?.note || entry, id));
      }
      rememberOther(xhsPost(state.note?.note || state.noteDetail?.note, noteId(location.pathname)));
    }
  }

  function cachedForPhotos(media, authorId, platform) {
    for (const item of media) {
      const ids = postsByPhoto.get(item.id);
      if (!ids) continue;
      const matches = [...ids].map(id => otherPosts.get(id)).filter(post => post?.platform === platform &&
        (!authorId || post.authorId === authorId));
      if (matches.length === 1) return matches[0];
    }
    return null;
  }

  function textAt(root, selector) {
    const node = root.querySelector(selector);
    return (node?.innerText || node?.textContent || '').trim();
  }

  function imageAt(node) {
    return node.currentSrc || node.getAttribute('src') || node.getAttribute('data-src') || '';
  }

  function biliDomPost(root) {
    const detail = root.matches('.opus-detail');
    const content = detail ? root.querySelector('.bili-opus-view') || root : root;
    const media = uniqueAssets([...content.querySelectorAll(biliPictures)].map(node => biliImage(imageAt(node))));
    const authorLink = content.querySelector('[biliscope-userid],.moment-card__author[href],a[href*="space.bilibili.com/"]');
    const authorId = numeric(authorLink?.getAttribute('biliscope-userid'),
      authorLink && asUrl(authorLink.href)?.pathname.match(/^\/(\d+)/)?.[1],
      location.hostname === 'space.bilibili.com' ? location.pathname.split('/')[1] : '');
    let id = numeric(root.dataset.dynId, root.dataset.dynamicId, root.dataset.momentId);
    if (!id && detail) id = biliId(location.href);
    if (!id) {
      id = [...root.querySelectorAll('a[href]')].map(link => biliId(link.href)).find(Boolean) || '';
    }
    const stored = otherPosts.get(id) || cachedForPhotos(media, authorId, 'bili');
    const fallback = {
      platform: 'bili', id, url: id ? 'https://www.bilibili.com/opus/' + id : '',
      author: textAt(content, '.opus-module-author__name,.bili-dyn-title__text,.moment-card__author-name,.moment-card__author'),
      authorId, time: domTime(content.querySelector('time,.opus-module-author__pub__text,.bili-dyn-time,.moment-card__time')),
      title: textAt(content, '.opus-module-title__text,.dyn-card-opus__title,.moment-card__title'),
      text: textAt(content, '.opus-module-content,.dyn-card-opus__summary,.bili-rich-text,.moment-card__desc'),
      textComplete: detail, media,
    };
    if (!stored) return [fallback];
    const primary = {
      ...fallback, ...stored, author: stored.author || fallback.author, text: stored.text || fallback.text,
      media: stored.media.length ? stored.media : stored.original?.media.length ? [] : media,
    };
    return stored.original?.media.length ? [primary, stored.original] : [primary];
  }

  function xhsDomPost(root) {
    const current = noteId(location.pathname);
    const link = root.querySelector('a[href*="/user/profile/"]');
    const authorId = link?.getAttribute('href')?.match(/\/user\/profile\/([a-f0-9]{24})/i)?.[1] || '';
    const area = root.querySelector('.media-container') || root;
    const slides = [...area.querySelectorAll('.note-slider-img img')].sort((a, b) => {
      const index = node => Number(node.closest('[data-swiper-slide-index]')?.getAttribute('data-swiper-slide-index') || 0);
      return index(a) - index(b);
    });
    const domPhotos = uniqueAssets((slides.length ? slides : [...area.querySelectorAll('.swiper-slide img')])
      .map(node => xhsImage(imageAt(node))));
    const visibleId = /^[a-f0-9]{24}$/i.test(root.dataset.noteId || '') ? root.dataset.noteId : '';
    const meta = cleanLink(document.querySelector('meta[property="og:url"]')?.content);
    const byPhoto = cachedForPhotos(domPhotos, authorId, 'xhs');
    const id = visibleId || byPhoto?.id || current || (!domPhotos.length ? noteId(meta?.pathname) : '') || '';
    const video = area.querySelector('video');
    const direct = [video?.currentSrc, video?.src, ...[...(video?.querySelectorAll('source') || [])].map(node => node.src)]
      .find(url => allowedAsset(url, 'xhscdn.com'));
    const player = video && !domPhotos.length ? [{ kind: 'video', id, variants: xhsVariants(null, direct) }] : [];
    const initialNote = page.__INITIAL_STATE__?.note?.noteDetailMap?.[id]?.note;
    const stored = xhsPost(initialNote, id) || otherPosts.get(id);
    const fallback = {
      platform: 'xhs', id, url: id ? 'https://www.xiaohongshu.com/explore/' + id : '',
      author: textAt(root, '.author .name,.author-container .name'), authorId,
      time: domTime(root.querySelector('#detail-desc ~ .date,.note-content .date,.bottom-container .date')),
      title: textAt(root, '#detail-title,.note-content .title'),
      text: textAt(root, '#detail-desc,.note-content .desc'), textComplete: true,
      media: [...domPhotos, ...player],
    };
    if (!stored) return fallback;
    const media = stored.media.map(item => {
      if (item.kind === 'photo') {
        const rendered = domPhotos.find(photo => photo.id === item.id);
        return rendered ? { ...item, renderedPhoto: rendered.photo } : item;
      }
      if (item.kind === 'video' && !item.variants.length && player[0]?.variants.length) {
        return { ...item, variants: player[0].variants };
      }
      return item;
    });
    return {
      ...fallback, ...stored, author: stored.author || fallback.author, text: stored.text || fallback.text,
      media: media.length ? media : fallback.media,
    };
  }

  const nativeButtonStyles = [
    '.xmd-native{border:0;background:transparent;cursor:pointer;color:var(--xmd-native-color,inherit);display:inline-flex;align-items:center;justify-content:center;flex:none;gap:3px;padding:0;box-sizing:border-box;min-width:24px;min-height:24px;border-radius:6px;position:relative}',
    '.xmd-native svg{display:block;width:var(--xmd-native-size,20px);height:var(--xmd-native-size,20px);flex:none;fill:currentColor}',
    '.xmd-native:hover,.xmd-native:focus-visible{background:color-mix(in srgb,currentColor 10%,transparent)}',
    '.xmd-native:disabled{opacity:.55;cursor:progress}',
    '.xmd-bili-slot{flex:0 1 auto;display:flex;align-items:center;min-width:24px;inline-size:104px}',
    '.xmd-bili-slot .xmd-native{width:100%;justify-content:flex-start}',
    '.side-toolbar__box .xmd-native{width:100%;min-height:42px;margin-block-start:16px;flex-direction:column;gap:4px;font:inherit;font-size:12px;line-height:14px}',
    '.moment-card__footer .xmd-native{padding:3px 6px}',
    '.xmd-xhs-note{margin-inline-start:6px;width:28px;height:30px}',
    '.xmd-xhs-all{margin-inline-start:6px;width:32px;height:32px}',
    '.xmd-xhs-all svg{transform:translateX(-1.5px)}',
    '.xmd-xhs-all span{position:absolute;bottom:0;right:0;font:600 7px/1 system-ui;letter-spacing:.05em}',
  ].join('\n');
  const xhsDownloadPath = 'M11.43 13.78a.9.9 0 0 0 1.17 0l3.49-3a.9.9 0 0 0-1.18-1.37l-2.01 1.73V3.9a.9.9 0 0 0-1.8 0v7.24L9.08 9.41a.9.9 0 0 0-1.16 1.37l3.51 3zM4.42 11.6a.91.91 0 0 0-1.82 0v4.5A4.93 4.93 0 0 0 7.55 21h9.1a4.93 4.93 0 0 0 4.95-4.9v-4.5a.91.91 0 0 0-1.82 0v4.5a3.12 3.12 0 0 1-3.13 3.1h-9.1a3.12 3.12 0 0 1-3.13-3.1z';

  function attachNative(anchor, container, variant, resolve) {
    let button = container.querySelector('.xmd-native');
    if (!button) {
      button = element('button');
      button.type = 'button';
      button.className = 'xmd-native ' + variant;
      const label = site === 'bili' ? '下载动态图片' : '下载整篇笔记媒体';
      button.title = label + '（右键打开设置）';
      button.setAttribute('aria-label', label);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svg.namespaceURI, 'path');
      const viewerIcon = variant === 'xmd-xhs-all' && anchor.querySelector('svg path')?.getAttribute('d');
      path.setAttribute('d', site === 'xhs' ? viewerIcon || xhsDownloadPath : viewerArrow + tray);
      svg.append(path);
      button.append(svg);
      if (variant === 'xmd-xhs-all') {
        const badge = element('span', 'all');
        badge.setAttribute('aria-hidden', 'true');
        button.append(badge);
      }
      if (variant === 'xmd-bili-detail') button.append(element('span', '下载'));
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        readInitialState();
        const posts = resolve();
        if (!posts?.[0]) {
          notify('未找到当前作品的媒体');
          return;
        }
        const key = posts[0].id || posts[0].media[0]?.id || 'current';
        const warnings = [];
        if (posts.some(post => !post.id)) warnings.push('作品编号未从页面取得，已按当前页面可用的媒体下载。');
        enqueueDownload(site + ':' + key, button, options(), () => ({ posts, warnings }));
      });
      button.addEventListener('contextmenu', event => {
        event.preventDefault();
        event.stopPropagation();
        openSettings();
      });
      if (variant === 'xmd-bili-feed') {
        const slot = element('div');
        slot.className = 'bili-dyn-item__action xmd-bili-slot';
        if (anchor.offsetWidth) slot.style.inlineSize = anchor.offsetWidth + 'px';
        slot.append(button);
        anchor.after(slot);
      } else anchor.after(button);
    }
    const nativeSvg = (variant === 'xmd-xhs-note' ? anchor.querySelector('.share-icon') : anchor.querySelector('svg'));
    const paint = nativeSvg?.querySelector('path,use') || nativeSvg;
    if (!paint) return;
    const style = getComputedStyle(paint);
    const color = paint.localName !== 'path' || style.fill === 'none' ? style.color : style.fill;
    const width = nativeSvg.getBoundingClientRect().width;
    if (color && button.style.getPropertyValue('--xmd-native-color') !== color) button.style.setProperty('--xmd-native-color', color);
    if (width && button.style.getPropertyValue('--xmd-native-size') !== width + 'px') button.style.setProperty('--xmd-native-size', width + 'px');
  }

  function scanBili(root) {
    for (const footer of root.querySelectorAll('.bili-dyn-item__footer,.moment-card__footer')) {
      const card = footer.closest(biliCards) || footer.parentElement;
      if (!card.querySelector(biliPictures)) {
        const button = footer.querySelector('.xmd-native');
        (button?.closest('.xmd-bili-slot') || button)?.remove();
        continue;
      }
      const anchor = footer.querySelector('.bili-dyn-action.like')?.closest('.bili-dyn-item__action') ||
        footer.querySelector('[aria-label*="点赞"],[aria-label*="喜欢"],[aria-label*="Like" i]') ||
        [...footer.children].findLast(node => !node.matches('.xmd-bili-slot,.xmd-native'));
      if (anchor) attachNative(anchor, footer, footer.matches('.bili-dyn-item__footer') ? 'xmd-bili-feed' : 'xmd-bewly',
        () => biliDomPost(card));
    }
    for (const detail of root.querySelectorAll('.opus-detail')) {
      const bar = detail.querySelector('.side-toolbar__box');
      const anchor = bar?.querySelector('.side-toolbar__action.comment') ||
        (bar && [...bar.children].findLast(node => !node.matches('.xmd-native')));
      const post = otherPosts.get(biliId(location.href));
      if (anchor && (detail.querySelector('.bili-opus-view')?.querySelector(biliPictures) ||
        post?.media.length || post?.original?.media.length)) {
        attachNative(anchor, bar, 'xmd-bili-detail', () => biliDomPost(detail));
      }
    }
  }

  function scanOtherSite() {
    readInitialState();
    if (site === 'bili') {
      scanBili(document);
      const shadow = document.querySelector('#bewly')?.shadowRoot;
      if (!shadow) return;
      if (!observedShadows.has(shadow)) {
        observedShadows.add(shadow);
        const styles = element('style', nativeButtonStyles);
        shadow.append(styles);
        new MutationObserver(scheduleScan).observe(shadow, { subtree: true, childList: true, attributes: true,
          attributeFilter: ['href', 'src', 'srcset', 'class'] });
      }
      scanBili(shadow);
      return;
    }
    const notes = [...new Set(document.querySelectorAll(xhsNotes))].filter(node => node.querySelector('.engage-bar .share-wrapper'));
    for (const note of notes) {
      const share = note.querySelector('.engage-bar .share-wrapper');
      if (!share.getBoundingClientRect().width) continue;
      lastXhsNote = note;
      attachNative(share, share.parentElement, 'xmd-xhs-note', () => [xhsDomPost(note)]);
    }
    for (const toolbar of document.querySelectorAll('.preview-modal .preview-toolbar')) {
      const download = [...toolbar.querySelectorAll('.preview-toolbar-btn')].find(node =>
        /下载|download/i.test(node.getAttribute('title') || node.getAttribute('aria-label') || node.parentElement?.textContent || '')) ||
        toolbar.querySelector('.preview-toolbar-btn.size20');
      if (!download || !lastXhsNote?.isConnected) continue;
      const anchor = download.parentElement.matches('.popover-container') ? download.parentElement : download;
      attachNative(anchor, anchor.parentElement, 'xmd-xhs-all', () => [xhsDomPost(lastXhsNote)]);
    }
  }

  try { watchPageResponses(site === 'x' ? xApi : otherApi, site === 'x' ? captureJson : captureOther); }
  catch (error) { console.debug('[聚合媒体下载]', error); }
  GM_registerMenuCommand(menu, openSettings);
  GM_registerMenuCommand('清理或打开分享链接', openLinkTools);
  function start() {
    ensureStyles();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['href', 'src', 'srcset', 'poster', 'data-testid'] });
    const theme = new MutationObserver(scheduleScan);
    for (const root of [document.documentElement, document.body]) {
      theme.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    }
    window.addEventListener('popstate', scheduleScan);
    scheduleScan();
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
