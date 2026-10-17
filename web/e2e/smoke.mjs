// Browser smoke tests: every route, and every interaction added in the front-end round.
// They check behaviour, not pixels, so they do not need snapshot updates when styling changes.
//
// Playwright is not a project dependency (D37). To run:
//   1. npm install --prefix <some folder outside the repo> playwright-core
//   2. start the site (npx next start -p 3000)
//   3. PLAYWRIGHT_CORE=<that folder>/node_modules/playwright-core BROWSER=<path to Edge or Chrome> node e2e/smoke.mjs
// BASE_URL defaults to http://localhost:3000.

import { pathToFileURL } from "node:url";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PW = process.env.PLAYWRIGHT_CORE;
const { chromium } = await import(PW ? pathToFileURL(`${PW.replace(/[\\/]$/, "")}/index.mjs`).href : "playwright-core");
const BROWSER = process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const ROUTES = [
  "/", "/brief", "/judge", "/map", "/chains", "/chains?view=across", "/chains/c52cded99f756309", "/promises", "/recent",
  "/organisations", "/search?q=smart+motorway", "/how-we-know", "/how-we-know/evaluation", "/how-we-know/methodology",
  "/reports/david-levett-prevention-of-future-deaths-report", "/print/chains/e9aa6be219fee97a",
];
const BANNED = /\b(ignored|caused|failed to act|is responsible)\b/i;

const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push([true, name, Date.now() - t0]);
    console.log(`ok   ${name}`);
  } catch (e) {
    results.push([false, name, Date.now() - t0]);
    console.log(`FAIL ${name}\n     ${String(e.message || e).split("\n")[0]}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch({ executablePath: BROWSER });
const desk = () => browser.newContext({ viewport: { width: 1440, height: 900 } });
const phone = (extra = {}) => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...extra });
async function page(ctx) {
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/status of 404/.test(m.text()) && p.errors.push(m.text()));
  return p;
}

try {
  for (const [label, make, width] of [["desktop", desk, 1440], ["phone", phone, 390]]) {
    await test(`every route loads at ${label} width, without errors or sideways scroll`, async () => {
      const ctx = await make();
      const p = await page(ctx);
      for (const r of ROUTES) {
        const res = await p.goto(BASE + r, { waitUntil: "networkidle" });
        assert(res && res.status() === 200, `${r}: status ${res && res.status()}`);
        const sw = await p.evaluate(() => document.documentElement.scrollWidth);
        assert(sw <= width + 1, `${r}: page is ${sw}px wide`);
        assert(!p.errors.length, `${r}: ${p.errors[0]}`);
      }
      await ctx.close();
    });
  }

  await test("unknown pages get the friendly 404", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    const res = await p.goto(BASE + "/no-such-page", { waitUntil: "networkidle" });
    assert(res.status() === 404, `status ${res.status()}`);
    assert(await p.getByText("This page is not in the record").isVisible(), "no friendly heading");
    await ctx.close();
  });

  await test("old addresses redirect into How we know", async () => {
    for (const [from, to] of [["/nemotron", "/how-we-know"], ["/evaluation", "/how-we-know/evaluation"], ["/methodology", "/how-we-know/methodology"]]) {
      const res = await fetch(BASE + from, { redirect: "manual" });
      assert([301, 308].includes(res.status), `${from}: status ${res.status}`);
      assert(new URL(res.headers.get("location"), BASE).pathname === to, `${from}: goes to ${res.headers.get("location")}`);
    }
  });

  await test("How we know has three tabs and marks the current one", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    await p.goto(BASE + "/how-we-know/evaluation", { waitUntil: "networkidle" });
    const tabs = p.getByRole("navigation", { name: "How we know" }).getByRole("link");
    assert((await tabs.count()) === 3, "not three tabs");
    assert((await p.locator('nav[aria-label="How we know"] [aria-current="page"]').innerText()).includes("Evaluation"), "wrong current tab");
    await ctx.close();
  });

  await test("the sidebar has 8 items with the three main features marked", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    assert((await p.locator('aside nav[aria-label="Main"] li').count()) === 8, "sidebar item count");
    await ctx.close();
  });

  await test("the guided path can be dismissed, and stays dismissed after a reload", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    assert(await p.locator(".guide-strip").isVisible(), "strip not shown");
    await p.getByRole("button", { name: "Hide the guided path" }).click();
    assert(!(await p.locator(".guide-strip").isVisible()), "strip still shown");
    await p.reload({ waitUntil: "networkidle" });
    assert(!(await p.locator(".guide-strip").isVisible()), "strip back after reload");
    await ctx.close();
  });

  await test("phones get a bottom tab bar; desktops do not", async () => {
    for (const [make, want] of [[phone, true], [desk, false]]) {
      const ctx = await make();
      const p = await page(ctx);
      await p.goto(BASE + "/", { waitUntil: "networkidle" });
      const bar = p.getByRole("navigation", { name: "Quick links" });
      assert((await bar.isVisible()) === want, `tab bar visible: ${!want}`);
      if (want) assert((await bar.getByRole("link").count()) === 4, "not four tabs");
      await ctx.close();
    }
  });

  await test("the hero draws, ends on a still frame, and offers a replay", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    await p.goto(BASE + "/?replay", { waitUntil: "networkidle" });
    const hero = p.locator('[data-m="hero"]');
    await p.waitForTimeout(7500);
    assert(await hero.getByRole("button", { name: "Replay" }).isEnabled(), "no replay button at the end");
    assert(/coroners/.test(await hero.innerText()), "no coroner counter");
    await hero.getByRole("button", { name: "Replay" }).click();
    await p.waitForTimeout(300);
    assert((await hero.getAttribute("data-state")) === "run", "replay did not restart");
    await ctx.close();
  });

  await test("reduced motion shows final frames straight away", async () => {
    const ctx = await desk();
    await ctx.close();
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const p = await page(c2);
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    await p.waitForTimeout(300);
    assert((await p.locator('[data-m="hero"]').getAttribute("data-state")) === "still", "hero not still");
    const op = await p.locator('[data-m="hero"] .m-pop').first().evaluate((e) => getComputedStyle(e).opacity);
    assert(op === "1", `hero dot opacity ${op}`);
    await c2.close();
  });

  await test("the 100 dots play when scrolled into view", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    await p.locator("#dots-heading").scrollIntoViewIfNeeded();
    await p.waitForTimeout(1200);
    assert((await p.locator("#dots-heading").evaluate((e) => e.closest(".rw-m").dataset.state)) === "run", "dots did not start");
    assert((await p.locator(".hd-dot").count()) === 100, "not 100 dots");
    await ctx.close();
  });

  await test("an example chip replays a recorded brief with counters and model badges", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    await p.goto(BASE + "/brief", { waitUntil: "networkidle" });
    await p.getByRole("button", { name: /smart motorway death/ }).click();
    await p.getByText("Tokens in").waitFor({ timeout: 15000 });
    await p.locator(".badge-super").first().waitFor({ timeout: 15000 });
    await p.getByText(/earlier warnings? to/).first().waitFor({ timeout: 20000 });
    await ctx.close();
  });

  await test("a quote opens in its source and is found word for word", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    await p.goto(BASE + "/chains/c52cded99f756309", { waitUntil: "networkidle" });
    const btn = p.locator("button[aria-controls]").filter({ hasText: "Check it in the source" }).first();
    const id = await btn.getAttribute("aria-controls");
    await btn.click();
    await p.locator(`[id="${id}"]`).getByText(/Found word for word/).waitFor({ timeout: 4000 });
    assert(await p.locator(`[id="${id}"] a[href*="judiciary.uk"]`).count(), "no link to the original");
    await ctx.close();
  });

  await test("the judge game reveals verdicts, keeps score, and draws a share card", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    await p.goto(BASE + "/judge", { waitUntil: "networkidle" });
    assert((await p.evaluate(() => window.scrollY)) === 0, "page scrolled itself on load");
    await p.getByRole("button", { name: /^Start$/ }).click();
    await p.getByRole("button", { name: /Same hazard/ }).first().click();
    await p.getByText(/Nemotron Super judged/).waitFor();
    assert(/Agreed with Nemotron: \d of 1/.test(await p.locator('[data-tour="game"]').innerText()), "no agreement meter");
    await p.getByRole("button", { name: /Stop and see/ }).click();
    await p.getByText(/You agreed with Nemotron on \d of 1/).waitFor();
    await p.locator('img[alt^="Share card"]').waitFor({ timeout: 5000 });
    await ctx.close();
  });

  await test("the map intro lights one chain and can be skipped", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    await p.goto(BASE + "/map?replay", { waitUntil: "networkidle" });
    await p.getByText("One chain, drawn in").waitFor({ timeout: 6000 });
    await p.getByRole("button", { name: "Skip the intro" }).click();
    assert(!(await p.getByText("One chain, drawn in").isVisible()), "intro still showing");
    await ctx.close();
  });

  await test("the methodology shows redaction on an invented example", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    await p.goto(BASE + "/how-we-know/methodology", { waitUntil: "networkidle" });
    const box = p.getByText("An invented example, not from any report").locator("xpath=ancestor::div[2]");
    assert(/\[name redacted\]/.test(await box.innerText()) && /\[the deceased\]/.test(await box.innerText()), "no redacted line");
    await ctx.close();
  });

  // The rule covers the site's own words. Quotes from coroners' reports stay word for word, so they are skipped.
  await test("no banned wording in the site's own text on the main pages", async () => {
    const ctx = await desk();
    const p = await page(ctx);
    for (const r of ["/", "/brief", "/judge", "/map", "/chains", "/chains/c52cded99f756309", "/how-we-know", "/how-we-know/evaluation"]) {
      await p.goto(BASE + r, { waitUntil: "networkidle" });
      const own = await p.locator("main").evaluate((el) => {
        const c = el.cloneNode(true);
        c.querySelectorAll("blockquote, mark, .quote").forEach((q) => q.remove());
        return c.innerText || c.textContent;
      });
      const m = own.match(BANNED);
      assert(!m, `${r}: "${m && m[0]}"`);
    }
    await ctx.close();
  });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
