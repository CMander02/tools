# Skills

个人 Codex skills 仓库。插件可按需安装，源码通过 Git 在设备间同步。

## 插件

| 插件 | Skills |
| --- | --- |
| [general](plugins/general) | `plain-rigorous-writing`（说人话） |
| [ai-tools](plugins/ai-tools) | `codex`、`gemini-cli`、`roundtable` |
| [web](plugins/web) | `omni-fetch`、`web-parse`、`xhs-fetch`、`xiaoyuzhou-fetch`、`zhihu-fetch` |

`general` 收录跨项目、跨领域使用的技能，例如日常表达与润色。

## 安装

先安装 Codex CLI，确认 `codex` 在 PATH 中，再克隆仓库。

```bash
git clone https://github.com/CMander02/skills.git
cd skills
```

任选一种命令。把 `general` 改成所需的插件名即可。

```text
python3 setup-service/install.py general
bash setup-service/install.sh general
pwsh -File setup-service/install.ps1 general
```

在 Windows 上可以用 `py -3 setup-service/install.py general` 启动 Python。脚本会把当前检出登记为 `cmander-skills` marketplace，并安装指定插件。安装完成后开启新的 Codex 会话。

## 更新

在已经克隆仓库的设备上，进入仓库目录并执行：

```bash
git pull --ff-only
```

如果此前通过安装脚本安装插件，更新源码后再运行原来的安装命令，以刷新 Codex 的插件副本。

如果只想用一个 skill，也可以在 `~/.agents/skills/` 下为对应目录创建软链接。例如，将仓库里的 `plugins/general/skills/plain-rigorous-writing/` 链接为 `~/.agents/skills/plain-rigorous-writing`。拉取后，软链接会直接指向更新后的文件。

## 目录

```text
skills/
├── .agents/plugins/marketplace.json
├── plugins/
│   ├── ai-tools/
│   ├── general/
│   └── web/
└── setup-service/
    ├── install.py
    ├── install.sh
    └── install.ps1
```

每个插件有自己的 `plugin.json`。每个 skill 的入口位于插件目录中的 `skills/<skill-name>/SKILL.md`。仓库维护说明见 [AGENTS.md](AGENTS.md)。

## 网页工具依赖

`web` 插件的 Node.js 项目在 [plugins/web/tools](plugins/web/tools)。通过 Codex 插件安装后，在 skill 指向的插件副本内按需安装网页工具依赖。直接从仓库运行工具时，在检出目录内安装依赖。

| 工具 | 设置 |
| --- | --- |
| `omni-fetch` | Node.js 22+，在工具目录中执行 `npm install`。哔哩哔哩音视频合并可选用 `ffmpeg`。 |
| `xhs-fetch-mcp`、`xiaoyuzhou-fetch-mcp` | 在对应工具目录中执行 `npm install` 和 `npm run build`。 |
| `zhihu-fetch` | 在工具目录中执行 `npm install`，首次登录用 `npx tsx auth.ts login`。 |
| `web-parse` | 安装 `defuddle` CLI。 |

小红书和小宇宙工具也可以作为独立的 MCP server 运行。构建后，Codex 可用以下命令注册小宇宙 MCP。将路径换成实际检出的绝对路径。

```bash
codex mcp add xiaoyuzhou-fetch -- node "/path/to/skills/plugins/web/tools/xiaoyuzhou-fetch-mcp/dist/mcp.js"
```
