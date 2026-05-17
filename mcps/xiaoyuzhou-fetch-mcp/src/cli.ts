#!/usr/bin/env node
/**
 * Xiaoyuzhou FM CLI
 * Usage:
 *   node dist/cli.js <url>              # print Obsidian markdown to stdout
 *   node dist/cli.js <url> --json       # print raw JSON to stdout
 *   node dist/cli.js <url> --output <dir>  # save .md file to directory
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fetchPodcast, fetchEpisode, parseUrl } from './xiaoyuzhou-extract.js';
import { podcastToMarkdown, episodeToMarkdown } from './markdown.js';

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`xiaoyuzhou-fetch <url> [--json] [--output <dir>]

  <url>           小宇宙 podcast or episode URL
  --json          Output raw JSON instead of Markdown
  --output <dir>  Save .md file to this directory (defaults to stdout)

Examples:
  node dist/cli.js https://www.xiaoyuzhoufm.com/podcast/670f3da40d2f24f28978736f
  node dist/cli.js https://www.xiaoyuzhoufm.com/episode/6a092b5b1b7bd50295493b6c --output ./notes
`);
    process.exit(0);
  }

  const url = args[0];
  const jsonMode = args.includes('--json');
  const outputIdx = args.indexOf('--output');
  const outputDir = outputIdx !== -1 ? args[outputIdx + 1] : null;

  const parsed = parseUrl(url);
  if (parsed.type === 'unknown') {
    console.error(`Error: Cannot parse Xiaoyuzhou URL: ${url}`);
    console.error('Expected format: https://www.xiaoyuzhoufm.com/podcast/<id> or /episode/<id>');
    process.exit(1);
  }

  try {
    let data: any;
    let markdown: string;
    let filename: string;

    if (parsed.type === 'podcast') {
      data = await fetchPodcast(parsed.id);
      markdown = podcastToMarkdown(data);
      filename = `${sanitizeFilename(data.title)}_podcast.md`;
    } else {
      data = await fetchEpisode(parsed.id);
      markdown = episodeToMarkdown(data);
      filename = `${sanitizeFilename(data.title)}_episode.md`;
    }

    if (jsonMode) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      const filepath = join(outputDir, filename);
      writeFileSync(filepath, markdown, 'utf-8');
      console.error(`Saved: ${filepath}`);
    } else {
      process.stdout.write(markdown);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
