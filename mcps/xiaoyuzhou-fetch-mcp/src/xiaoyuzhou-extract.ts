/**
 * Xiaoyuzhou FM (小宇宙) Data Extraction Module
 * Extracts podcast and episode data via __NEXT_DATA__ embedded in SSR HTML.
 * No browser/Playwright required — the Next.js page pre-renders all data.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImageAsset {
  picUrl: string;
  thumbnailUrl: string;
  smallPicUrl: string;
  middlePicUrl: string;
  largePicUrl: string;
  width: number;
  height: number;
  format: string;
}

export interface Podcaster {
  uid: string;
  nickname: string;
  bio: string;
  gender: string;
  ipLoc: string;
  avatar: string; // resolved picture URL
  profileUrl: string;
}

export interface Contact {
  type: string;
  name: string;
  url?: string;
  note?: string;
}

export interface MediaInfo {
  url: string;
  size: number;
  mimeType: string;
}

export interface EpisodeSummary {
  eid: string;
  pid: string;
  title: string;
  pubDate: string;
  duration: number; // seconds
  mediaUrl: string;
  mediaSize: number;
  mediaMimeType: string;
  playCount: number;
  commentCount: number;
  favoriteCount: number;
  episodeUrl: string;
}

export interface EpisodeDetail extends EpisodeSummary {
  description: string;
  shownotes: string | null;
  riskWarning: string | null;
  hasTranscript: boolean;
}

export interface PodcastInfo {
  pid: string;
  title: string;
  author: string;
  brief: string;
  description: string;
  subscriptionCount: number;
  episodeCount: number;
  coverUrl: string;
  latestEpisodePubDate: string;
  syncMode: string;
  payType: string;
  podcasters: Podcaster[];
  contacts: Contact[];
  podcastUrl: string;
  recentEpisodes: EpisodeSummary[];
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
];

function randomUA(): string {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': randomUA(),
      Referer: 'https://www.xiaoyuzhoufm.com/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function extractNextData(html: string): any {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NEXT_DATA__ not found in page');
  return JSON.parse(m[1]);
}

// ─── URL parsing ──────────────────────────────────────────────────────────────

export type XYZUrlType = 'podcast' | 'episode' | 'unknown';

export interface ParsedXYZUrl {
  type: XYZUrlType;
  id: string;
}

export function parseUrl(input: string): ParsedXYZUrl {
  const url = input.trim();
  const podcastMatch = url.match(/xiaoyuzhoufm\.com\/podcast\/([a-f0-9]{24})/i);
  if (podcastMatch) return { type: 'podcast', id: podcastMatch[1] };

  const episodeMatch = url.match(/xiaoyuzhoufm\.com\/episode\/([a-f0-9]{24})/i);
  if (episodeMatch) return { type: 'episode', id: episodeMatch[1] };

  return { type: 'unknown', id: '' };
}

// ─── Data mappers ─────────────────────────────────────────────────────────────

function mapPodcaster(raw: any): Podcaster {
  return {
    uid: raw.uid ?? '',
    nickname: raw.nickname ?? '',
    bio: raw.bio ?? '',
    gender: raw.gender ?? '',
    ipLoc: raw.ipLoc ?? '',
    avatar: raw.avatar?.picture?.picUrl ?? '',
    profileUrl: `https://www.xiaoyuzhoufm.com/user/${raw.uid}`,
  };
}

function mapEpisodeSummary(raw: any): EpisodeSummary {
  return {
    eid: raw.eid,
    pid: raw.pid,
    title: raw.title ?? '',
    pubDate: raw.pubDate ?? '',
    duration: raw.duration ?? 0,
    mediaUrl: raw.enclosure?.url ?? raw.media?.source?.url ?? '',
    mediaSize: raw.media?.size ?? 0,
    mediaMimeType: raw.media?.mimeType ?? '',
    playCount: raw.playCount ?? 0,
    commentCount: raw.commentCount ?? 0,
    favoriteCount: raw.favoriteCount ?? 0,
    episodeUrl: `https://www.xiaoyuzhoufm.com/episode/${raw.eid}`,
  };
}

function mapEpisodeDetail(raw: any): EpisodeDetail {
  return {
    ...mapEpisodeSummary(raw),
    description: raw.description ?? '',
    shownotes: raw.shownotes ?? null,
    riskWarning: raw.riskWarning ?? null,
    hasTranscript: !!(raw.transcript?.mediaId || raw.transcriptMediaId),
  };
}

function mapPodcastInfo(raw: any): PodcastInfo {
  return {
    pid: raw.pid,
    title: raw.title ?? '',
    author: raw.author ?? '',
    brief: raw.brief ?? '',
    description: raw.description ?? '',
    subscriptionCount: raw.subscriptionCount ?? 0,
    episodeCount: raw.episodeCount ?? 0,
    coverUrl: raw.image?.picUrl ?? '',
    latestEpisodePubDate: raw.latestEpisodePubDate ?? '',
    syncMode: raw.syncMode ?? '',
    payType: raw.payType ?? '',
    podcasters: (raw.podcasters ?? []).map(mapPodcaster),
    contacts: (raw.contacts ?? []).map((c: any): Contact => ({
      type: c.type ?? '',
      name: c.name ?? '',
      url: c.url,
      note: c.note,
    })),
    podcastUrl: `https://www.xiaoyuzhoufm.com/podcast/${raw.pid}`,
    recentEpisodes: (raw.episodes ?? []).map(mapEpisodeSummary),
  };
}

// ─── Main fetch functions ─────────────────────────────────────────────────────

export async function fetchPodcast(pid: string): Promise<PodcastInfo> {
  const url = `https://www.xiaoyuzhoufm.com/podcast/${pid}`;
  const html = await fetchPage(url);
  const data = extractNextData(html);
  const raw = data?.props?.pageProps?.podcast;
  if (!raw) throw new Error('Podcast data not found in page');
  return mapPodcastInfo(raw);
}

export async function fetchEpisode(eid: string): Promise<EpisodeDetail> {
  const url = `https://www.xiaoyuzhoufm.com/episode/${eid}`;
  const html = await fetchPage(url);
  const data = extractNextData(html);
  const raw = data?.props?.pageProps?.episode;
  if (!raw) throw new Error('Episode data not found in page');
  return mapEpisodeDetail(raw);
}

export async function fetchFromUrl(input: string): Promise<PodcastInfo | EpisodeDetail> {
  const parsed = parseUrl(input);
  if (parsed.type === 'podcast') return fetchPodcast(parsed.id);
  if (parsed.type === 'episode') return fetchEpisode(parsed.id);
  throw new Error(`Cannot parse Xiaoyuzhou URL: ${input}`);
}
