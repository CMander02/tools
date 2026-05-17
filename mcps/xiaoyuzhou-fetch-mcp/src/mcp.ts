#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fetchPodcast, fetchEpisode, parseUrl } from './xiaoyuzhou-extract.js';
import { podcastToMarkdown, episodeToMarkdown } from './markdown.js';

const server = new McpServer({
  name: 'xiaoyuzhou-fetch-mcp',
  version: '1.0.0',
});

server.registerTool(
  'fetch_xiaoyuzhou_podcast',
  {
    description:
      '获取小宇宙播客频道的完整信息，包括频道简介、主持人、订阅数、联系方式、最近更新节目列表（含时长、媒体URL）。输入频道 URL（xiaoyuzhoufm.com/podcast/...）。返回 Obsidian 风格 Markdown 或原始 JSON。',
    inputSchema: {
      url: z.string().describe('小宇宙播客频道 URL，格式：https://www.xiaoyuzhoufm.com/podcast/<pid>'),
      format: z
        .enum(['markdown', 'json'])
        .default('markdown')
        .describe('输出格式：markdown（Obsidian 风格，默认）或 json（原始结构化数据）'),
    },
  },
  async ({ url, format }) => {
    try {
      const parsed = parseUrl(url);
      if (parsed.type !== 'podcast') {
        return {
          content: [{ type: 'text', text: `Error: 不是播客频道 URL。请使用 /podcast/<pid> 格式的链接。` }],
          isError: true,
        };
      }
      const data = await fetchPodcast(parsed.id);
      const text = format === 'json' ? JSON.stringify(data, null, 2) : podcastToMarkdown(data);
      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.registerTool(
  'fetch_xiaoyuzhou_episode',
  {
    description:
      '获取小宇宙单集节目的完整信息，包括标题、完整简介（含嘉宾介绍/时间戳等）、媒体文件直链、时长、文件大小、是否有转录。输入单集 URL（xiaoyuzhoufm.com/episode/...）。返回 Obsidian 风格 Markdown 或原始 JSON。',
    inputSchema: {
      url: z.string().describe('小宇宙节目 URL，格式：https://www.xiaoyuzhoufm.com/episode/<eid>'),
      format: z
        .enum(['markdown', 'json'])
        .default('markdown')
        .describe('输出格式：markdown（Obsidian 风格，默认）或 json（原始结构化数据）'),
    },
  },
  async ({ url, format }) => {
    try {
      const parsed = parseUrl(url);
      if (parsed.type !== 'episode') {
        return {
          content: [{ type: 'text', text: `Error: 不是节目 URL。请使用 /episode/<eid> 格式的链接。` }],
          isError: true,
        };
      }
      const data = await fetchEpisode(parsed.id);
      const text = format === 'json' ? JSON.stringify(data, null, 2) : episodeToMarkdown(data);
      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.registerTool(
  'fetch_xiaoyuzhou',
  {
    description:
      '自动识别小宇宙链接类型（播客频道或单集节目），抓取完整信息。输入任意小宇宙 URL（/podcast/ 或 /episode/）。',
    inputSchema: {
      url: z.string().describe('任意小宇宙 URL（播客频道或单集节目均可）'),
      format: z
        .enum(['markdown', 'json'])
        .default('markdown')
        .describe('输出格式：markdown 或 json'),
    },
  },
  async ({ url, format }) => {
    try {
      const parsed = parseUrl(url);
      if (parsed.type === 'unknown') {
        return {
          content: [{ type: 'text', text: `Error: 无法识别 URL：${url}\n支持格式：/podcast/<pid> 或 /episode/<eid>` }],
          isError: true,
        };
      }
      let text: string;
      if (parsed.type === 'podcast') {
        const data = await fetchPodcast(parsed.id);
        text = format === 'json' ? JSON.stringify(data, null, 2) : podcastToMarkdown(data);
      } else {
        const data = await fetchEpisode(parsed.id);
        text = format === 'json' ? JSON.stringify(data, null, 2) : episodeToMarkdown(data);
      }
      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('xiaoyuzhou-fetch-mcp running on stdio');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
