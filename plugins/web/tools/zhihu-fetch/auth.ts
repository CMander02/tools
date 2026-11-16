/**
 * Manage Zhihu login session via a persistent browser profile.
 *
 * Commands:
 *   npx tsx auth.ts login    - Open browser, let user log in, save session
 *   npx tsx auth.ts check    - Check if current session is still valid
 *   npx tsx auth.ts refresh  - Visit zhihu.com to refresh cookie expiry
 *   npx tsx auth.ts export   - Export cookies to cookies.json
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, "zhihu_profile");
const COOKIES_FILE = path.join(__dirname, "cookies.json");
const ZHIHU_HOME = "https://www.zhihu.com";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const STEALTH_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
window.chrome = {runtime: {}};
`;

async function login() {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  console.log("Opening browser... please log in to zhihu.com, then close the window.");

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    userAgent: USER_AGENT,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    viewport: { width: 1280, height: 900 },
  });

  await ctx.addInitScript(STEALTH_SCRIPT);
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto(ZHIHU_HOME);

  console.log("Waiting for you to log in... (close the browser window when done)");
  await page.waitForEvent("close", { timeout: 0 }).catch(() => {});

  await exportFromContext(ctx);
  await ctx.close();
  console.log(`Session saved to ${PROFILE_DIR}`);
  console.log(`Cookies exported to ${COOKIES_FILE}`);
}

async function exportFromContext(ctx: Awaited<ReturnType<typeof chromium.launchPersistentContext>>) {
  const cookies = await ctx.cookies([ZHIHU_HOME, "https://zhuanlan.zhihu.com"]);
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2), "utf-8");
  return cookies;
}

async function check() {
  if (!fs.existsSync(PROFILE_DIR)) {
    console.log("No profile found. Run: npx tsx auth.ts login");
    return false;
  }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    userAgent: USER_AGENT,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  await ctx.addInitScript(STEALTH_SCRIPT);
  const page = await ctx.newPage();
  await page.goto(ZHIHU_HOME, { waitUntil: "domcontentloaded", timeout: 20_000 });

  const loggedIn = await page.$(".AppHeader-userInfo, .UserAvatar");
  const url = page.url();
  await ctx.close();

  if (loggedIn || !url.includes("signin")) {
    console.log("Session valid: logged in");
    return true;
  } else {
    console.log("Session expired. Run: npx tsx auth.ts login");
    return false;
  }
}

async function exportCookies() {
  if (!fs.existsSync(PROFILE_DIR)) {
    console.log("No profile found. Run: npx tsx auth.ts login");
    return;
  }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    userAgent: USER_AGENT,
  });
  const cookies = await exportFromContext(ctx);
  await ctx.close();

  const zhihuCookies = cookies.filter((c) => c.domain.includes("zhihu"));
  console.log(`Exported ${zhihuCookies.length} zhihu cookies to ${COOKIES_FILE}`);
  for (const c of zhihuCookies.filter((c) => ["z_c0", "_zap", "BEC"].includes(c.name))) {
    const exp = c.expires > 0
      ? `expires ${new Date(c.expires * 1000).toISOString().slice(0, 10)}`
      : "session";
    console.log(`  ${c.name}: ...${c.value.slice(-12)}  (${exp})`);
  }
}

async function refresh() {
  if (!fs.existsSync(PROFILE_DIR)) {
    console.log("No profile found. Run: npx tsx auth.ts login");
    return;
  }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    userAgent: USER_AGENT,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  await ctx.addInitScript(STEALTH_SCRIPT);
  const page = await ctx.newPage();
  await page.goto(ZHIHU_HOME, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.waitForTimeout(2000);

  const cookies = await exportFromContext(ctx);
  await ctx.close();

  const zhihuCookies = cookies.filter((c) => c.domain.includes("zhihu"));
  console.log(`Refreshed. ${zhihuCookies.length} zhihu cookies saved.`);
}

const COMMANDS: Record<string, () => Promise<void>> = {
  login,
  check,
  export: exportCookies,
  refresh,
};

const cmd = process.argv[2] ?? "check";
if (!COMMANDS[cmd]) {
  console.error(`Unknown command: ${cmd}`);
  console.error(`Available: ${Object.keys(COMMANDS).join(", ")}`);
  process.exit(1);
}
COMMANDS[cmd]();
