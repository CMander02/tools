/**
 * Fetch a Zhihu zhuanlan article with full metadata, engagement stats, and comments.
 * Outputs an Obsidian Markdown file with YAML frontmatter.
 *
 * Session management (first-time setup):
 *   npx tsx auth.ts login    - log in via browser, save session to ./zhihu_profile/
 *   npx tsx auth.ts check    - verify session is still valid
 *   npx tsx auth.ts refresh  - refresh cookie expiry (run weekly)
 *
 * Usage:
 *   npx tsx fetch.ts <url> [--mode gui|headless] [--out output.md] [--json output.json]
 */
import { chromium, type BrowserContext, type Response } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, "zhihu_profile");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const STEALTH_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
Object.defineProperty(navigator, 'languages', {get: () => ['zh-CN','zh','en']});
window.chrome = {runtime: {}};
`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChildComment {
  id: string;
  author_name: string;
  author_id: string;
  author_url_token: string;
  content: string;
  created_time: number | null;
  like_count: number;
  is_author: boolean;
}

interface Comment extends ChildComment {
  child_comment_count: number;
  child_comments: ChildComment[];
}

interface ArticleData {
  url: string;
  article_id: string;
  title: string;
  author: {
    name: string;
    uuid: string;
    uid: string;
    url_token: string;
    profile_url: string;
  };
  created_at: string;
  updated_at: string;
  ip_info: string;
  topics: string[];
  engagement: {
    voteup: number;
    liked: number;
    favorites: number;
    comments: number;
    shares: number;
  };
  body_markdown: string;
  comments: Comment[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function articleIdFromUrl(url: string): string {
  return url.match(/\/p\/(\d+)/)?.[1] ?? "";
}

function fmtTs(ts: number | null | undefined): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace("T", " ");
}

/** Minimal HTML → Markdown converter (no external deps needed for this scope) */
function htmlToMd(html: string): string {
  return html
    // code blocks (must come before inline)
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_m, code) =>
      "```\n" + code.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") + "\n```"
    )
    // headings
    .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_m, n, t) => "#".repeat(+n) + " " + stripTags(t))
    // bold / italic
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    // inline code
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    // blockquote
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, c) =>
      stripTags(c).split("\n").map(l => "> " + l.trim()).filter(Boolean).join("\n")
    )
    // links — strip zhida search links, keep others
    .replace(/<a[^>]+href="([^"]*zhida\.zhihu[^"]*)"[^>]*>(.*?)<\/a>/gi, "$2")
    .replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    // images
    .replace(/<img[^>]+src="([^"]*)"[^>]*(?:data-caption="([^"]*)")?[^>]*\/?>/gi,
      (_m, src, alt) => `![${alt ?? ""}](${src})`
    )
    // lists
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, c) =>
      c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m2: string, item: string) => "- " + stripTags(item).trim()).trimEnd() + "\n"
    )
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, c) => {
      let i = 0;
      return c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m2: string, item: string) => `${++i}. ` + stripTags(item).trim()).trimEnd() + "\n";
    })
    // line breaks and paragraphs
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, c) => "\n" + stripTags(c).trim() + "\n")
    // hr
    .replace(/<hr[^>]*\/?>/gi, "\n---\n")
    // strip remaining tags
    .replace(/<[^>]+>/g, "")
    // decode entities
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n))
    // collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}

// ── Fetch page ────────────────────────────────────────────────────────────────

interface Captured {
  html: string;
  commentsApi: unknown[];
}

async function fetchPage(url: string, mode: string): Promise<Captured> {
  const articleId = articleIdFromUrl(url);
  const captured: Captured = { html: "", commentsApi: [] };

  const ctxOptions = {
    userAgent: USER_AGENT,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    viewport: { width: 1280, height: 900 },
  };
  const commonArgs = [
    "--disable-blink-features=AutomationControlled",
    "--window-position=9999,9999",
  ];

  let ctx: BrowserContext;

  if (fs.existsSync(PROFILE_DIR)) {
    console.error("Using saved profile from zhihu_profile/");
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: mode === "headless",
      channel: mode === "gui" ? "chrome" : undefined,
      args: [
        ...commonArgs,
        ...(mode === "headless" ? ["--disable-dev-shm-usage", "--no-sandbox"] : []),
      ],
      ...ctxOptions,
    });
  } else {
    if (mode === "headless") {
      console.error("WARNING: no zhihu_profile. Run `npx tsx auth.ts login` first.");
    }
    const browser = await chromium.launch({ headless: false, channel: "chrome", args: commonArgs });
    ctx = await browser.newContext(ctxOptions);
  }

  await ctx.addInitScript(STEALTH_SCRIPT);

  ctx.on("response", async (response: Response) => {
    const ru = response.url();
    if (
      ru.includes(`comment_v5/articles/${articleId}/root_comment`)
    ) {
      try { captured.commentsApi.push(await response.json()); } catch {}
    }
  });

  // Block heavy resources
  await ctx.route("**/*.{png,jpg,jpeg,gif,webp,mp4,woff,woff2,ttf}", (route) => route.abort());

  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".RichText.ztext, .Post-RichText", { timeout: 15_000 }).catch(() => {});

  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1000);

  captured.html = await page.content();
  await ctx.close();
  return captured;
}

// ── Parse ─────────────────────────────────────────────────────────────────────

function parseState(html: string, articleId: string): Record<string, unknown> | null {
  // Extract from <script> tag content to avoid trailing HTML contaminating JSON.parse
  const scriptRe = /<script[^>]*>(\{"initialState":[\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const state = JSON.parse(m[1]) as { initialState: { entities: { articles: Record<string, unknown> } } };
      const art = state.initialState?.entities?.articles?.[articleId];
      if (art) return art as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
}

function parseArticle(captured: Captured, url: string): ArticleData {
  const articleId = articleIdFromUrl(url);
  const art = parseState(captured.html, articleId);

  let title = "";
  let authorName = "";
  let authorUuid = "";
  let authorUid = "";
  let authorUrlToken = "";
  let createdTs: number | null = null;
  let updatedTs: number | null = null;
  let voteup = 0, liked = 0, favorites = 0, commentCount = 0, shareCount = 0;
  let ipInfo = "";
  let topics: string[] = [];
  let bodyHtml = "";

  if (art) {
    title = String(art.title ?? "");
    createdTs = art.created as number;
    updatedTs = art.updated as number;
    voteup = art.voteupCount as number ?? 0;
    liked = art.likedCount as number ?? 0;
    favorites = art.favlistsCount as number ?? 0;
    commentCount = art.commentCount as number ?? 0;
    ipInfo = String(art.ipInfo ?? "");
    topics = ((art.topics as { name: string }[]) ?? []).map((t) => t.name);
    shareCount = ((art.reaction as { statistics: { shareCount: number } })?.statistics?.shareCount) ?? 0;
    const author = art.author as Record<string, unknown>;
    authorName = String(author?.name ?? "");
    authorUuid = String(author?.id ?? "");
    authorUid = String(author?.uid ?? "");
    authorUrlToken = String(author?.urlToken ?? "");
    bodyHtml = String(art.content ?? "");
  }

  const bodyMd = bodyHtml ? htmlToMd(bodyHtml) : "";

  // Parse comments from intercepted API
  const comments: Comment[] = [];
  for (const page of captured.commentsApi as { data?: unknown[] }[]) {
    for (const c of (page.data ?? []) as Record<string, unknown>[]) {
      const a = c.author as Record<string, unknown>;
      const childComments: ChildComment[] = ((c.child_comments as Record<string, unknown>[]) ?? []).map((ch) => {
        const ca = ch.author as Record<string, unknown>;
        return {
          id: String(ch.id ?? ""),
          author_name: String(ca?.name ?? ""),
          author_id: String(ca?.id ?? ""),
          author_url_token: String(ca?.url_token ?? ""),
          content: String(ch.content ?? ""),
          created_time: ch.created_time as number ?? null,
          like_count: ch.like_count as number ?? 0,
          is_author: Boolean(ch.is_author),
        };
      });
      comments.push({
        id: String(c.id ?? ""),
        author_name: String(a?.name ?? ""),
        author_id: String(a?.id ?? ""),
        author_url_token: String(a?.url_token ?? ""),
        content: String(c.content ?? ""),
        created_time: c.created_time as number ?? null,
        like_count: c.like_count as number ?? 0,
        child_comment_count: c.child_comment_count as number ?? 0,
        is_author: Boolean(c.is_author),
        child_comments: childComments,
      });
    }
  }

  return {
    url,
    article_id: articleId,
    title,
    author: {
      name: authorName,
      uuid: authorUuid,
      uid: authorUid,
      url_token: authorUrlToken,
      profile_url: authorUrlToken ? `https://www.zhihu.com/people/${authorUrlToken}` : "",
    },
    created_at: fmtTs(createdTs),
    updated_at: fmtTs(updatedTs),
    ip_info: ipInfo,
    topics,
    engagement: { voteup, liked, favorites, comments: commentCount, shares: shareCount },
    body_markdown: bodyMd,
    comments,
  };
}

// ── Render ────────────────────────────────────────────────────────────────────

function yamlStr(s: string): string {
  if (/[:#\[\]{}&*!|>'",\n]/.test(s)) return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return s || '""';
}

function render(data: ArticleData): string {
  const a = data.author;
  const e = data.engagement;
  const tagsYaml = data.topics.map((t) => `  - ${yamlStr(t)}`).join("\n");

  const frontmatter = `---
title: ${yamlStr(data.title)}
url: ${data.url}
article_id: "${data.article_id}"
source: zhihu
author_name: ${yamlStr(a.name)}
author_uuid: "${a.uuid}"
author_uid: "${a.uid}"
author_url_token: "${a.url_token}"
author_profile: ${a.profile_url}
created_at: "${data.created_at}"
updated_at: "${data.updated_at}"
ip_info: ${yamlStr(data.ip_info)}
tags:
${tagsYaml}
voteup: ${e.voteup}
liked: ${e.liked}
favorites: ${e.favorites}
comments_total: ${e.comments}
shares: ${e.shares}
comments_loaded: ${data.comments.length}
---
`;

  const body = `# ${data.title}\n\n${data.body_markdown}\n`;

  const commentBlocks: string[] = [];
  if (data.comments.length > 0) {
    commentBlocks.push(`\n---\n\n## 评论（共 ${e.comments} 条，已加载 ${data.comments.length} 条）\n`);
    for (const c of data.comments) {
      const tag = c.is_author ? " #作者" : "";
      const ts = fmtTs(c.created_time);
      const lines = [
        `> [!quote] **${c.author_name}**${tag} · ${ts} · 👍${c.like_count}`,
        `> \`${c.author_id}\``,
        `>`,
        `> ${c.content}`,
      ];
      for (const child of c.child_comments) {
        const ctag = child.is_author ? " #作者" : "";
        lines.push(`>`, `> > **${child.author_name}**${ctag} · ${fmtTs(child.created_time)} · 👍${child.like_count}`, `> > ${child.content}`);
      }
      if (c.child_comment_count > c.child_comments.length) {
        lines.push(`> *(还有 ${c.child_comment_count - c.child_comments.length} 条回复未展开)*`);
      }
      commentBlocks.push(lines.join("\n"));
    }
  }

  return frontmatter + body + commentBlocks.join("\n\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    mode: { type: "string" },
    out: { type: "string", default: "output.md" },
    json: { type: "string" },
  },
  allowPositionals: true,
});

const url = positionals[0] ?? "https://zhuanlan.zhihu.com/p/371637064";
const mode = (values.mode as string) ?? (process.platform === "win32" || process.env.DISPLAY ? "gui" : "headless");
const outPath = values.out as string;
const jsonPath = values.json as string | undefined;

console.error(`Mode    : ${mode}`);
console.error(`Fetching: ${url}`);

const captured = await fetchPage(url, mode);
const data = parseArticle(captured, url);

fs.writeFileSync(outPath, render(data), "utf-8");

if (jsonPath) {
  const a = data.author;
  const e = data.engagement;
  const flat = {
    title: data.title, url: data.url, article_id: data.article_id, source: "zhihu",
    author_name: a.name, author_uuid: a.uuid, author_uid: a.uid,
    author_url_token: a.url_token, author_profile: a.profile_url,
    created_at: data.created_at, updated_at: data.updated_at, ip_info: data.ip_info,
    tags: data.topics,
    voteup: e.voteup, liked: e.liked, favorites: e.favorites,
    comments_total: e.comments, shares: e.shares, comments_loaded: data.comments.length,
    body_markdown: data.body_markdown,
    comments: data.comments,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(flat, null, 2), "utf-8");
}

console.error(`Saved   : ${outPath}`);
console.error(`Title   : ${data.title}`);
console.error(`Author  : ${data.author.name} (${data.author.uuid})`);
console.error(`Created : ${data.created_at}`);
console.error(`Updated : ${data.updated_at}`);
console.error(`Engage  : 赞${data.engagement.voteup} 喜欢${data.engagement.liked} 收藏${data.engagement.favorites} 评论${data.engagement.comments}`);
console.error(`Comments: loaded ${data.comments.length} root comments`);
