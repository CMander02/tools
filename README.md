# Tools

Personal Claude Code skills and MCP servers — verified and ready to use.

## Structure

```
Tools/
├── skills/
│   ├── web/
│   │   ├── omni-fetch.md       # 统一抓取（微信/小宇宙/B站/小红书/知乎）
│   │   ├── omni-fetch/         # omni-fetch 工具脚本
│   │   ├── xhs-fetch.md        # 小红书图片/视频下载
│   │   ├── zhihu-fetch.md      # 知乎专栏抓取（Playwright）
│   │   ├── xiaoyuzhou-fetch.md # 小宇宙播客抓取
│   │   └── web-parse.md        # 通用网页解析（defuddle）
│   └── ai-tools/
│       ├── codex.md            # OpenAI Codex CLI
│       ├── gemini-cli.md       # Google Gemini CLI
│       └── roundtable.md       # 多 AI 圆桌（Claude + Codex + Gemini）
└── mcps/
    ├── xiaoyuzhou-fetch-mcp/   # 小宇宙 MCP server
    ├── xhs-fetch-mcp/          # 小红书 MCP server + CLI
    └── zhihu-fetch/            # 知乎抓取脚本（Playwright）
```

## Install

```bash
git clone https://github.com/<you>/Tools ~/Tools
TOOLS_ROOT=~/Tools
```

### Skills

Copy to `~/.claude/skills/` or a plugin's `skills/` directory:

```bash
# All skills
cp -r $TOOLS_ROOT/skills/* ~/.claude/skills/

# Single skill
cp $TOOLS_ROOT/skills/web/omni-fetch.md ~/.claude/skills/web/
```

> Skills that reference `<TOOLS_ROOT>` in their docs need the actual clone path.
> Replace `<TOOLS_ROOT>` with your clone path, e.g. `~/Tools`.

### MCPs

Each MCP is a standalone Node.js project:

```bash
# xiaoyuzhou-fetch-mcp
cd $TOOLS_ROOT/mcps/xiaoyuzhou-fetch-mcp
npm install && npm run build

# xhs-fetch-mcp
cd $TOOLS_ROOT/mcps/xhs-fetch-mcp
npm install && npm run build

# zhihu-fetch (script, no build needed)
cd $TOOLS_ROOT/mcps/zhihu-fetch
npm install
npx tsx auth.ts login   # first time: save login session
```

Register MCPs in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "xiaoyuzhou-fetch": {
      "command": "node",
      "args": ["~/Tools/mcps/xiaoyuzhou-fetch-mcp/dist/mcp.js"]
    }
  }
}
```

## Dependencies

| Tool | Install | Used by |
|------|---------|---------|
| `node` + `npx tsx` | Node.js 22+ | all MCPs, omni-fetch, zhihu-fetch |
| `ffmpeg` | system package | omni-fetch (B站 DASH merge, optional) |
| `defuddle` | `pnpm add -g defuddle` | web-parse skill |
| `codex` | OpenAI Codex CLI | codex skill |
| `gemini` | Google Gemini CLI | gemini-cli, roundtable skills |
| `playwright` | `npx playwright install chromium` | zhihu-fetch, omni-fetch zhihu mode |
