#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { extractImages } from './xhs-extract.js';

// Create the MCP server using the high-level McpServer API
const server = new McpServer({
  name: 'xhs-fetch-image-mcp',
  version: '1.0.0',
});

// Register the fetch_xhs_image tool
server.registerTool(
  'fetch_xhs_image',
  {
    description: 'Extract original-quality images or video from a Xiaohongshu (小红书) post. Accepts share button text, short links (xhslink.com), or full URLs. Returns original images without compression/watermark, or video download URL.',
    inputSchema: {
      content: z.string().describe('Xiaohongshu share text, short link (xhslink.com), or full post URL'),
    },
  },
  async ({ content }) => {
    try {
      const result = await extractImages(content);

      // Handle video posts
      if (result.isVideo) {
        if (result.video) {
          const v = result.video;
          const outputLines = [
            `Title: ${result.title}`,
            '',
            `Video (${v.codec.toUpperCase()}, ${v.quality}):`,
            `  Resolution: ${v.width}x${v.height}`,
            `  Duration: ${v.duration}s`,
            `  Size: ${(v.size / 1024 / 1024).toFixed(2)} MB`,
            '',
            `Download URL:`,
            v.url,
            ...(v.backupUrls.length > 0
              ? ['', 'Backup URLs:', ...v.backupUrls.map((u, i) => `${i + 1}. ${u}`)]
              : []),
          ];
          return {
            content: [{ type: 'text', text: outputLines.join('\n') }],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: 'This post is a video, but no downloadable stream was found.',
            },
          ],
        };
      }

      // Format the output
      const outputLines = [
        `Title: ${result.title}`,
        '',
        `Found ${result.images.length} image(s):`,
        ...result.images.map((url, i) => `${i + 1}. ${url}`),
      ];

      return {
        content: [
          {
            type: 'text',
            text: outputLines.join('\n'),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('XHS Fetch Image MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
