#!/usr/bin/env node

/**
 * CLI tool for downloading images/videos from Xiaohongshu posts
 *
 * Usage:
 *   npx xhs-fetch <url-or-share-text> [--output <dir>]
 */

import { extractImages } from './xhs-extract.js';
import { getRandomUserAgent } from './user-agent.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const HEADERS = {
  'User-Agent': getRandomUserAgent(),
  Referer: 'https://www.xiaohongshu.com/',
};

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80).trim() || 'xhs_download';
}

async function downloadFile(url: string, outPath: string): Promise<number> {
  const resp = await fetch(url, { headers: HEADERS });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeFile(outPath, buf);
  return buf.length;
}

function parseArgs(argv: string[]): { content: string; outputDir: string } {
  const args = argv.slice(2);
  let outputDir = '.';
  const contentParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--output' || args[i] === '-o') && args[i + 1]) {
      outputDir = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: xhs-fetch <url-or-share-text> [--output <dir>]

Examples:
  xhs-fetch "https://www.xiaohongshu.com/discovery/item/..."
  xhs-fetch "https://xhslink.com/abc123" -o ./photos
  xhs-fetch "分享文本内容..." --output ./downloads`);
      process.exit(0);
    } else {
      contentParts.push(args[i]);
    }
  }

  const content = contentParts.join(' ');
  if (!content) {
    console.error('Error: Please provide a Xiaohongshu URL or share text.');
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  return { content, outputDir };
}

async function main() {
  const { content, outputDir } = parseArgs(process.argv);

  console.log('Extracting post data...');
  const result = await extractImages(content);
  const folderName = sanitizeFilename(result.title);
  const downloadDir = join(outputDir, folderName);
  await mkdir(downloadDir, { recursive: true });

  console.log(`Title: ${result.title}`);
  console.log(`Output: ${downloadDir}`);

  if (result.isVideo) {
    if (!result.video) {
      console.error('Video post detected but no downloadable stream found.');
      process.exit(1);
    }
    const v = result.video;
    console.log(`Video: ${v.width}x${v.height}, ${v.duration}s, ${v.codec.toUpperCase()} ${v.quality}`);

    const filename = `video.${v.format}`;
    const outPath = join(downloadDir, filename);
    console.log(`Downloading video...`);
    const size = await downloadFile(v.url, outPath);
    console.log(`  ${filename} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    console.log(`Found ${result.images.length} image(s)`);
    for (let i = 0; i < result.images.length; i++) {
      const url = result.images[i];
      // Detect extension from response
      const resp = await fetch(url, { headers: HEADERS });
      if (!resp.ok) {
        console.error(`  Failed to download image ${i + 1}: HTTP ${resp.status}`);
        continue;
      }
      const contentType = resp.headers.get('content-type') || '';
      let ext = '.jpg';
      if (contentType.includes('png')) ext = '.png';
      else if (contentType.includes('webp')) ext = '.webp';

      const buf = Buffer.from(await resp.arrayBuffer());
      const filename = `image_${i + 1}${ext}`;
      await writeFile(join(downloadDir, filename), buf);
      console.log(`  ${filename} (${(buf.length / 1024).toFixed(1)} KB)`);
    }
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
