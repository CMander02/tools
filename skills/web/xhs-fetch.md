---
name: xhs-fetch
description: |
  Download original images or videos from Xiaohongshu (小红书) posts.
  Trigger when: (1) User provides a Xiaohongshu link, short link, or share text and asks to download images/videos
  (2) User says "download xhs", "save xhs images", "fetch xiaohongshu", "xhs download"
  (3) User pastes a URL containing xiaohongshu.com or xhslink.com
  Prerequisite: xhs-fetch-mcp tool is built at <TOOLS_ROOT>/mcps/xhs-fetch-mcp/dist/cli.js
---

# Xiaohongshu Image/Video Downloader

Extract and download **uncompressed, watermark-free** original images or videos from Xiaohongshu (小红书) posts.

## Tool Location

```
<TOOLS_ROOT>/mcps/xhs-fetch-mcp/
├── src/
│   ├── cli.ts
│   ├── xhs-extract.ts
│   ├── user-agent.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

`<TOOLS_ROOT>` 是本 repo 的克隆路径，例如 `~/Tools`。

## Setup (first time)

```bash
cd <TOOLS_ROOT>/mcps/xhs-fetch-mcp
npm install && npm run build
```

## Supported Input Formats

1. **Full URL**: `https://www.xiaohongshu.com/discovery/item/...` or `/explore/...`
2. **Short link**: `https://xhslink.com/abc123`
3. **Share text**: Content copied from the Xiaohongshu app share button (the link is extracted automatically)

## CLI Usage

### Download an image post

```bash
node <TOOLS_ROOT>/mcps/xhs-fetch-mcp/dist/cli.js "<xhs link or share text>" --output <save directory>
```

### Download a video post

Same command — the tool auto-detects the post type and downloads the video:

```bash
node <TOOLS_ROOT>/mcps/xhs-fetch-mcp/dist/cli.js "<video post link>" --output <save directory>
```

## Workflow

### 1. Parse user input

Extract from the user's message:
- **Xiaohongshu link**: full URL, short link, or share text
- **Save location**: user-specified directory, defaults to current directory

### 2. Execute download

```bash
node <TOOLS_ROOT>/mcps/xhs-fetch-mcp/dist/cli.js "<link or share text from user>" --output <target directory>
```

### 3. Report results

Tell the user:
- Post title
- Number of images downloaded / video info (resolution, duration, size)
- File save location

## Output Format

### Image posts
- Filenames: `image_1.webp`, `image_2.webp`, ...
- Format: original format (typically webp, may be jpg/png)
- Quality: original — no compression, no watermark

### Video posts
- Filename: `video.mp4`
- Codec: H.264 (or H.265 if available)
- Quality: highest available server-side quality

## Notes

1. Requires network access to Xiaohongshu servers
2. Xiaohongshu may have anti-scraping measures — retry later if a request fails
3. `xsec_token` is time-limited; expired links may not work
4. The save directory automatically creates a subfolder named after the post title

## Examples

### User pastes share text

User: "Download this 12 【Post Title - Author | 小红书】 https://www.xiaohongshu.com/discovery/item/abc123def456?xsec_token=TOKEN..."

Execute:
```bash
node <TOOLS_ROOT>/mcps/xhs-fetch-mcp/dist/cli.js "12 【Post Title - Author | 小红书】 https://www.xiaohongshu.com/discovery/item/abc123def456?xsec_token=TOKEN..." --output ./downloads
```

### User provides a short link

User: "Download https://xhslink.com/a1B2cD"

Execute:
```bash
node <TOOLS_ROOT>/mcps/xhs-fetch-mcp/dist/cli.js "https://xhslink.com/a1B2cD" --output ./downloads
```
