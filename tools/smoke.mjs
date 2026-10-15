import { URL } from "node:url";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import assert from "node:assert/strict";

// Verify the built site, deliberately mounted below a non-root URL.
const prefix = "/nested/facet/";
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (!path.startsWith(prefix)) throw new Error("outside mounted site");
    const file = path.slice(prefix.length) || "index.html";
    if (file.includes("..")) throw new Error("invalid path");
    const type = {
      js: "application/javascript",
      css: "text/css",
      html: "text/html",
      png: "image/png",
      json: "application/json",
      wav: "audio/wav",
    }[file.split(".").pop()];
    response.writeHead(200, {
      "Content-Type": type ?? "application/octet-stream",
    });
    response.end(await readFile(`dist/${file}`));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const address = server.address();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript(() => {
    globalThis.__facetText = [];
    const proto = globalThis.CanvasRenderingContext2D.prototype;
    const fillText = proto.fillText;
    proto.fillText = function (...args) {
      globalThis.__facetText.push(String(args[0]));
      if (globalThis.__facetText.length > 4000)
        globalThis.__facetText.splice(0, 2000);
      return fillText.apply(this, args);
    };
  });
  await page.goto(`http://127.0.0.1:${address.port}${prefix}`);
  await page.waitForFunction(() => globalThis.__facetText.includes("FACET"));
  const clear = () => page.evaluate(() => (globalThis.__facetText = []));
  const has = (text) =>
    page.waitForFunction(
      (value) => globalThis.__facetText.includes(value),
      text,
    );
  await clear();
  await page.mouse.click(320, 450);
  await has("PAUSE");
  await page.waitForTimeout(500);
  await page.mouse.move(388, 144);
  await page.mouse.down();
  await page.mouse.move(460, 144, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await clear();
  await page.mouse.click(1130, 60);
  await has("PAUSED");
  await clear();
  await page.keyboard.press("Escape");
  await has("PAUSE");
  await page.keyboard.press("KeyM");
  await has("M  SOUND OFF");
  await page.keyboard.press("KeyP");
  await page.keyboard.press("ArrowDown");
  await clear();
  await page.keyboard.press("Enter");
  await has("FACET");
  await page.keyboard.press("ArrowDown");
  await clear();
  await page.keyboard.press("Enter");
  await has("The beauty is in the break.");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const canvas = await page.locator("canvas").boundingBox();
  assert.equal(canvas.width, 390);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
