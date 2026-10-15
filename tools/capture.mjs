import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// Run against `npm run dev`. Not part of the production build.
await mkdir("showcase", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  for (const mode of ["title", "board", "replay"]) {
    await page.goto("http://localhost:5173/tools/capture.html");
    await page.waitForTimeout(600);
    const result = await page.evaluate(async (mode) => {
      const { capture } = await import("/tools/capture.ts");
      return capture(mode);
    }, mode);
    if (mode !== "replay")
      await page.screenshot({ path: `showcase/${mode}.png` });
    else {
      await writeFile(
        "showcase/chain.json.gz",
        gzipSync(JSON.stringify(result.recording)),
      );
      await writeFile(
        "/tmp/facet-capture-result.json",
        JSON.stringify(result.snapshot, null, 2),
      );
    }
  }
} finally {
  await browser.close();
}
