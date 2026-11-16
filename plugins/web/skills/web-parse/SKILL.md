---
name: web-parse
description: 使用 defuddle CLI 解析网页/推文/文章内容，提取正文、标题、作者等元数据，输出 Markdown 或 JSON。也支持获取网站的 llms.txt 以理解网站整体定位。使用场景：(1) 用户提供 URL 要求获取内容 (2) 用户要求抓取推文/文章 (3) WebFetch 失败时作为 fallback (4) 用户要求了解某网站的 LLM 友好描述
---

# Web Parse Skill

使用全局安装的 `defuddle` CLI 解析任意网页内容，提取结构化正文和元数据。

## 前置条件

- `defuddle` 已全局安装（`pnpm add -g defuddle`，当前 v0.9.0）
- 验证：`defuddle --version`

## Step 1：判断解析策略

根据用户提供的 URL 判断最佳解析方式：

| URL 类型 | 策略 |
|----------|------|
| 普通网页/博客/文章 | `defuddle parse --markdown --json <URL>` |
| 推文（x.com / twitter.com） | 同上，defuddle 可直接解析推文 |
| 需要了解网站整体 | 先尝试获取 `llms.txt`（Step 3），再解析具体页面 |
| GitHub 仓库 | 优先使用 deepwiki MCP，defuddle 作为 fallback |

## Step 2：使用 defuddle 解析

### 2a：Markdown + JSON 输出（推荐）

```bash
defuddle parse --markdown --json "<URL>"
```

返回 JSON 对象，包含：
- `content`：正文 Markdown
- `title`：页面标题
- `author`：作者
- `published`：发布时间
- `description`：页面描述
- `domain`：域名
- `site`：站点名称
- `wordCount`：字数
- `image`：主图 URL
- `favicon`：站点图标
- `schemaOrgData`：结构化数据
- `parseTime`：解析耗时(ms)

### 2b：纯 Markdown 输出

```bash
defuddle parse --markdown "<URL>"
```

直接输出正文 Markdown，适合管道处理。

### 2c：提取特定属性

```bash
defuddle parse -p title "<URL>"
defuddle parse -p author "<URL>"
defuddle parse -p description "<URL>"
```

### 2d：Debug 模式

```bash
defuddle parse --markdown --json --debug "<URL>"
```

保留 HTML 属性，输出详细日志，用于排查解析问题。

### 2e：输出到文件

```bash
defuddle parse --markdown --json -o output.json "<URL>"
```

## Step 3：获取 llms.txt

许多网站提供 `/llms.txt` 或 `/llms-full.txt`，这是面向 LLM 的网站描述文件（类似 robots.txt 之于爬虫）。

```bash
# 尝试获取 llms.txt
curl -sL "https://example.com/llms.txt" 2>/dev/null | head -100

# 如果存在完整版
curl -sL "https://example.com/llms-full.txt" 2>/dev/null | head -200
```

常见提供 llms.txt 的网站：
- Anthropic: `https://docs.anthropic.com/llms.txt`
- Vercel: `https://vercel.com/llms.txt`
- Cloudflare: `https://developers.cloudflare.com/llms.txt`
- Stripe: `https://docs.stripe.com/llms.txt`

**使用场景**：当需要理解一个网站的整体定位、产品结构、文档组织时，先获取 llms.txt 可以快速获得全局认知，再用 defuddle 解析具体页面获取详细内容。

## Step 4：处理解析结果

解析成功后，根据调用上下文决定后续动作：

1. **信息获取**：直接向用户展示提取的内容摘要
2. **笔记创建**：将解析结果传递给 `info` 或 `note-manager` skill 创建笔记
3. **事件记录**：提取标题和摘要用于事件条目描述
4. **内容补充**：将解析内容补充到已有笔记中

## 异常处理

| 情况 | 处理 |
|------|------|
| defuddle 未安装 | 提示：`pnpm add -g defuddle` |
| URL 无法访问（403/404） | 尝试添加 User-Agent：通过 curl 下载 HTML 后用 `defuddle parse local.html` |
| 内容为空或 JS 渲染 | 提示用户该页面需要浏览器渲染，建议使用 agent-browser |
| 超时 | 设置 timeout 30s，超时后 fallback 到 WebFetch |

### 对于需要认证或 JS 渲染的页面

```bash
# 先用 curl 保存 HTML，再用 defuddle 解析本地文件
curl -sL -A "Mozilla/5.0" "<URL>" -o /tmp/page.html
defuddle parse --markdown --json /tmp/page.html
```

## 与其他工具的关系

| 工具 | 定位 | 何时使用 |
|------|------|----------|
| **defuddle**（本 skill） | 网页正文提取 + Markdown 转换 | 获取文章/推文/博客的结构化内容 |
| **WebFetch** | 内置网页获取 + AI 摘要 | 简单页面快速摘要，不需要精确正文 |
| **deepwiki MCP** | GitHub 仓库 AI 文档 | GitHub 仓库深度理解 |
| **agent-browser** | 无头浏览器 | JS 渲染页面、需要登录的页面 |
| **llms.txt** | 网站自描述 | 了解网站整体结构和定位 |
