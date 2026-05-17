---
name: xiaoyuzhou-fetch
description: |
  Fetch podcast channel info and episode details from 小宇宙 (Xiaoyuzhou FM).
  Trigger when:
  (1) User provides a xiaoyuzhoufm.com URL (podcast or episode) and asks to fetch/save/export it
  (2) User says "抓取小宇宙", "获取小宇宙播客信息", "保存小宇宙节目", "fetch xiaoyuzhou"
  (3) User pastes a URL containing xiaoyuzhoufm.com/podcast/ or xiaoyuzhoufm.com/episode/
  Output: Obsidian-flavored Markdown with frontmatter, all channel/episode fields, host info, episode list, and media URLs.
  Prerequisite: Tool built at C:/zychen/AIGC/Agent/MCPs/xiaoyuzhou-fetch-mcp/dist/cli.js
allowed-tools:
  - Bash
  - Write
---

# 小宇宙 (Xiaoyuzhou FM) Fetcher

Fetch complete podcast channel or episode data from 小宇宙 and export as Obsidian Markdown.

## Tool Location

```
C:/zychen/AIGC/Agent/MCPs/xiaoyuzhou-fetch-mcp/dist/cli.js
```

## Supported URL Formats

1. **Podcast channel**: `https://www.xiaoyuzhoufm.com/podcast/<pid>`
2. **Single episode**: `https://www.xiaoyuzhoufm.com/episode/<eid>`

## Usage

### Print Markdown to stdout

```bash
node C:/zychen/AIGC/Agent/MCPs/xiaoyuzhou-fetch-mcp/dist/cli.js "<url>"
```

### Save to a directory

```bash
node C:/zychen/AIGC/Agent/MCPs/xiaoyuzhou-fetch-mcp/dist/cli.js "<url>" --output <save-dir>
```

### Get raw JSON

```bash
node C:/zychen/AIGC/Agent/MCPs/xiaoyuzhou-fetch-mcp/dist/cli.js "<url>" --json
```

## Data Extracted

### Podcast (`/podcast/<pid>`)

- **频道信息**: 标题, 作者, 简介, 描述, 订阅数, 节目总数, 付费类型, 同步模式
- **封面图**: 高清封面 URL
- **主持人 / 创作者**: UID, 昵称, 简介, 头像, IP归属, 主页链接
- **联系方式**: 即刻/微信/其他平台账号
- **最近节目列表**: 标题, 发布时间, 时长, 播放数, 评论数（最近15期）

### Episode (`/episode/<eid>`)

- **节目信息**: 标题, 发布时间, 时长, 播放数, 收藏数, 评论数
- **媒体文件**: 直链 URL, 类型 (audio/mp4), 大小, 时长
- **完整简介**: 节目 description (含嘉宾介绍、时间戳、精彩内容等)
- **Shownotes**: 若有则单独输出
- **风险提示**: 如 AI生成声明
- **转录状态**: 是否有 transcript

## Workflow

### 1. Parse user input

Extract from the user's message:
- **小宇宙 URL**: podcast or episode link
- **Save location** (optional): user-specified directory

### 2. Execute fetch

```bash
node C:/zychen/AIGC/Agent/MCPs/xiaoyuzhou-fetch-mcp/dist/cli.js "<url>" --output <dir>
```

If no output dir is specified, capture stdout and show in chat.

### 3. Report results

For **podcast**: show channel title, subscriber count, episode count, host names, and list of recent episodes.

For **episode**: show title, duration, media URL, and first ~300 chars of description.

If saved to file, tell the user the file path.

## Notes

- No authentication required — data comes from Next.js SSR `__NEXT_DATA__` embedded in the public page.
- The podcast page includes only the most recent ~15 episodes. For a full episode list, individual episode pages must be fetched.
- Media files are direct `.m4a` links at `media.xyzcdn.net` — they can be downloaded with any HTTP client.

## Examples

### Fetch a podcast channel

User: "抓取这个小宇宙播客 https://www.xiaoyuzhoufm.com/podcast/670f3da40d2f24f28978736f"

```bash
node C:/zychen/AIGC/Agent/MCPs/xiaoyuzhou-fetch-mcp/dist/cli.js "https://www.xiaoyuzhoufm.com/podcast/670f3da40d2f24f28978736f" --output ./notes
```

### Fetch a single episode

User: "获取这期节目的信息 https://www.xiaoyuzhoufm.com/episode/6a092b5b1b7bd50295493b6c"

```bash
node C:/zychen/AIGC/Agent/MCPs/xiaoyuzhou-fetch-mcp/dist/cli.js "https://www.xiaoyuzhoufm.com/episode/6a092b5b1b7bd50295493b6c"
```
