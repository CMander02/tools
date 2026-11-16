/**
 * Converts Xiaoyuzhou data structures to Obsidian-flavored Markdown.
 */

import type { PodcastInfo, EpisodeDetail, EpisodeSummary } from './xiaoyuzhou-extract.js';

function fmtDuration(seconds: number): string {
  if (!seconds) return '未知';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtSize(bytes: number): string {
  if (!bytes) return '未知';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

function fmtDate(iso: string): string {
  if (!iso) return '未知';
  return iso.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function buildFrontmatter(fields: Record<string, string | number | string[]>): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - "${item}"`);
    } else if (typeof v === 'string' && v.includes('\n')) {
      lines.push(`${k}: |`);
      for (const line of v.split('\n')) lines.push(`  ${line}`);
    } else {
      const escaped = String(v).replace(/"/g, '\\"');
      lines.push(`${k}: "${escaped}"`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

// ─── Podcast page ─────────────────────────────────────────────────────────────

export function podcastToMarkdown(p: PodcastInfo): string {
  const parts: string[] = [];

  // Frontmatter
  parts.push(buildFrontmatter({
    title: p.title,
    type: 'podcast',
    pid: p.pid,
    source: p.podcastUrl,
    author: p.author,
    subscribers: p.subscriptionCount,
    episodes: p.episodeCount,
    payType: p.payType,
    syncMode: p.syncMode,
    latestEpisode: fmtDate(p.latestEpisodePubDate),
    tags: ['小宇宙', 'podcast'],
  }));

  parts.push(`\n# ${p.title}\n`);

  // Cover image
  if (p.coverUrl) {
    parts.push(`![封面](${p.coverUrl})\n`);
  }

  // Basic info
  parts.push('## 频道信息\n');
  parts.push(`| 字段 | 值 |`);
  parts.push(`|---|---|`);
  parts.push(`| **标题** | ${p.title} |`);
  parts.push(`| **作者** | ${p.author} |`);
  parts.push(`| **简介** | ${p.brief} |`);
  parts.push(`| **订阅数** | ${p.subscriptionCount.toLocaleString()} |`);
  parts.push(`| **节目总数** | ${p.episodeCount} |`);
  parts.push(`| **付费类型** | ${p.payType} |`);
  parts.push(`| **同步模式** | ${p.syncMode} |`);
  parts.push(`| **最新更新** | ${fmtDate(p.latestEpisodePubDate)} |`);
  parts.push(`| **链接** | [小宇宙](${p.podcastUrl}) |\n`);

  // Description
  if (p.description) {
    parts.push('## 频道描述\n');
    parts.push(p.description + '\n');
  }

  // Podcasters
  if (p.podcasters.length > 0) {
    parts.push('## 主持人 / 创作者\n');
    for (const host of p.podcasters) {
      parts.push(`### ${host.nickname}\n`);
      if (host.avatar) parts.push(`![头像](${host.avatar})\n`);
      parts.push(`| 字段 | 值 |`);
      parts.push(`|---|---|`);
      parts.push(`| **UID** | ${host.uid} |`);
      parts.push(`| **昵称** | ${host.nickname} |`);
      if (host.bio) parts.push(`| **简介** | ${host.bio} |`);
      parts.push(`| **性别** | ${host.gender} |`);
      if (host.ipLoc) parts.push(`| **IP归属** | ${host.ipLoc} |`);
      parts.push(`| **主页** | [个人主页](${host.profileUrl}) |\n`);
    }
  }

  // Contacts
  if (p.contacts.length > 0) {
    parts.push('## 联系方式\n');
    parts.push(`| 平台 | 名称 | 链接/备注 |`);
    parts.push(`|---|---|---|`);
    for (const c of p.contacts) {
      const linkOrNote = c.url ? `[${c.url}](${c.url})` : (c.note ?? '');
      parts.push(`| ${c.type} | ${c.name} | ${linkOrNote} |`);
    }
    parts.push('');
  }

  // Recent episodes table
  if (p.recentEpisodes.length > 0) {
    parts.push('## 最近更新的节目\n');
    parts.push(`| # | 标题 | 发布时间 | 时长 | 播放数 | 评论数 |`);
    parts.push(`|---|---|---|---|---|---|`);
    for (let i = 0; i < p.recentEpisodes.length; i++) {
      const ep = p.recentEpisodes[i];
      const title = `[${ep.title}](${ep.episodeUrl})`;
      parts.push(`| ${i + 1} | ${title} | ${fmtDate(ep.pubDate)} | ${fmtDuration(ep.duration)} | ${ep.playCount} | ${ep.commentCount} |`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

// ─── Episode page ─────────────────────────────────────────────────────────────

export function episodeToMarkdown(ep: EpisodeDetail): string {
  const parts: string[] = [];

  parts.push(buildFrontmatter({
    title: ep.title,
    type: 'episode',
    eid: ep.eid,
    pid: ep.pid,
    source: ep.episodeUrl,
    pubDate: fmtDate(ep.pubDate),
    duration: fmtDuration(ep.duration),
    mediaUrl: ep.mediaUrl,
    mediaMimeType: ep.mediaMimeType,
    mediaSize: fmtSize(ep.mediaSize),
    playCount: ep.playCount,
    favoriteCount: ep.favoriteCount,
    commentCount: ep.commentCount,
    tags: ['小宇宙', 'episode'],
  }));

  parts.push(`\n# ${ep.title}\n`);

  // Episode metadata
  parts.push('## 节目信息\n');
  parts.push(`| 字段 | 值 |`);
  parts.push(`|---|---|`);
  parts.push(`| **标题** | ${ep.title} |`);
  parts.push(`| **发布时间** | ${fmtDate(ep.pubDate)} |`);
  parts.push(`| **时长** | ${fmtDuration(ep.duration)} |`);
  parts.push(`| **播放数** | ${ep.playCount.toLocaleString()} |`);
  parts.push(`| **收藏数** | ${ep.favoriteCount} |`);
  parts.push(`| **评论数** | ${ep.commentCount} |`);
  if (ep.riskWarning) parts.push(`| **风险提示** | ${ep.riskWarning} |`);
  parts.push(`| **有转录** | ${ep.hasTranscript ? '是' : '否'} |`);
  parts.push(`| **链接** | [小宇宙](${ep.episodeUrl}) |\n`);

  // Media
  parts.push('## 媒体文件\n');
  parts.push(`| 字段 | 值 |`);
  parts.push(`|---|---|`);
  parts.push(`| **URL** | [点击下载](${ep.mediaUrl}) |`);
  parts.push(`| **类型** | ${ep.mediaMimeType || '未知'} |`);
  parts.push(`| **大小** | ${fmtSize(ep.mediaSize)} |`);
  parts.push(`| **时长** | ${fmtDuration(ep.duration)} |\n`);

  // Description
  if (ep.description) {
    parts.push('## 节目简介\n');
    parts.push(ep.description + '\n');
  }

  // Shownotes
  if (ep.shownotes) {
    parts.push('## Shownotes\n');
    parts.push(ep.shownotes + '\n');
  }

  return parts.join('\n');
}
