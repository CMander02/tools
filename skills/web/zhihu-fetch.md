---
name: zhihu-fetch
description: 抓取知乎专栏文章（zhuanlan.zhihu.com/p/...）的完整内容并导出为 Obsidian Markdown 文件。使用场景：(1) 用户提供知乎专栏链接要求保存或导出 (2) 用户说"抓取知乎"、"保存知乎文章"、"导出知乎到 Obsidian" (3) 需要获取文章元数据（作者UUID、发布时间、互动量、评论区）
allowed-tools:
  - Bash
  - Read
  - Write
---

# Zhihu Fetch Skill

抓取知乎专栏文章，输出带完整 YAML frontmatter 的 Obsidian Markdown 文件。

## 工具位置

```
<TOOLS_ROOT>/mcps/zhihu-fetch/
├── fetch.ts        # 主抓取脚本
├── auth.ts         # Session 管理
├── package.json    # npm 依赖（playwright, tsx, typescript）
└── zhihu_profile/  # 浏览器持久化 profile（登录后自动生成，不入 git）
```

`<TOOLS_ROOT>` 是本 repo 的克隆路径，例如 `~/Tools`。

## Setup (first time)

```bash
cd <TOOLS_ROOT>/mcps/zhihu-fetch
npm install
# 打开浏览器手动登录知乎，关闭窗口后自动保存 session
npx tsx auth.ts login
```

## 抓取文章

```bash
cd <TOOLS_ROOT>/mcps/zhihu-fetch

# 抓取并输出到 output.md（Windows 自动选择 gui 模式）
npx tsx fetch.ts https://zhuanlan.zhihu.com/p/<ID>

# 指定输出路径
npx tsx fetch.ts <url> --out ~/Notes/zhihu/article.md

# 同时导出 JSON（字段与 frontmatter 一致）
npx tsx fetch.ts <url> --out article.md --json article.json

# 服务器无头模式（需先登录）
npx tsx fetch.ts <url> --mode headless
```

## Session 管理（首次使用 / 定期维护）

```bash
cd <TOOLS_ROOT>/mcps/zhihu-fetch

# 首次：打开浏览器手动登录知乎，关闭窗口后自动保存 session
npx tsx auth.ts login

# 检查 session 是否还有效
npx tsx auth.ts check

# 定期刷新（建议每周一次，防止 session 过期）
npx tsx auth.ts refresh

# 导出当前 cookies 到 cookies.json（备用）
npx tsx auth.ts export
```

Session 存储在 `zhihu_profile/` 目录，每次 `fetch.ts` 运行时自动复用，cookies 随访问自动续期，无需重复登录。

## 输出格式

输出为 Obsidian Markdown，结构：

```
---                          ← YAML frontmatter（Obsidian Properties）
title: 文章标题
url: https://zhuanlan.zhihu.com/p/...
article_id: "371637064"
source: zhihu
author_name: 作者名
author_uuid: "6ec8f971..."  ← 知乎内部 hex UUID
author_uid: "968844..."     ← 数字 UID
author_url_token: "xxx"     ← URL 中可见的 token
author_profile: https://...
created_at: "2021-05-12 11:16:44"
updated_at: "2023-02-06 20:08:56"
ip_info: 美国
tags:
  - Python
  - 数据分析
voteup: 39
liked: 12
favorites: 56
comments_total: 26
shares: 0
comments_loaded: 7
---

# 文章标题              ← 正文直接开始，无冗余 callout

正文内容（Markdown）...

---

## 评论（共 26 条，已加载 7 条）

> [!quote] **评论者名** · 2021-05-27 · 👍1   ← 根评论为 callout
> `作者UUID`
>
> 评论内容
>
> > **回复者** · 时间 · 👍0                   ← 子评论嵌套 blockquote
> > 回复内容
```

## 技术说明

- **反爬策略**：使用 Playwright 持久化 profile（`launchPersistentContext`）复用真实 Chrome 指纹，注入 stealth JS 隐藏 `navigator.webdriver`，窗口开在屏幕外（`--window-position=9999,9999`）不干扰用户
- **数据来源**：从 `<script>` 标签内嵌的 `initialState` JSON 提取结构化数据（标题、作者、时间戳、互动量、正文 HTML），评论来自拦截的 `comment_v5` API 响应
- **无头服务器**：必须先 `npx tsx auth.ts login` 保存 profile；纯 HTTP 请求均被 403 拦截，无法绕过
- **评论限制**：页面加载仅触发首页评论（≤20 条根评论），子评论包含前几条，未展开的显示剩余数量提示
- **运行时**：Node.js 22+，`npx tsx` 直接运行 TypeScript，无需编译步骤
