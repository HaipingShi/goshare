import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'docs', 'assets');
const baseUrl = process.env.SCREENSHOT_URL || 'http://127.0.0.1:8787';

const sampleMarkdown = `# QuickShare demo

把 AI 生成的 Markdown、HTML、SVG 或 Mermaid 直接粘贴进来，生成一个干净的公开链接。

\`\`\`mermaid
flowchart LR
  A[Paste content] --> B[Store in R2]
  B --> C[Metadata in D1]
  C --> D[Share URL]
\`\`\`

- Cloudflare Workers 部署
- R2 保存正文
- D1 管理索引和权限`;

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#html-input').fill(sampleMarkdown);
  await page.screenshot({
    path: path.join(outputDir, 'quickshare-home.png'),
    fullPage: true,
  });

  await page.locator('#generate-button').click();
  await page.locator('#result-section').waitFor({ state: 'visible' });
  await page.screenshot({
    path: path.join(outputDir, 'quickshare-generated-link.png'),
    fullPage: true,
  });

  const urlId = await page.locator('#result-url').evaluate((node) => node.dataset.originalUrl.split('/').pop());
  await page.goto(`${baseUrl}/view/${urlId}`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(outputDir, 'quickshare-rendered-page.png'),
    fullPage: true,
  });

  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await page.locator('tr[data-id]').first().click();
  await page.locator('#admin-content').waitFor({ state: 'visible' });
  await page.locator('#admin-protected').check();
  await page.locator('#admin-save').click();
  await page.locator('tr[data-id]').first().waitFor({ state: 'visible' });
  await page.screenshot({
    path: path.join(outputDir, 'quickshare-admin.png'),
    fullPage: true,
  });

  await page.goto(`${baseUrl}/view/${urlId}`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(outputDir, 'quickshare-password-gate.png'),
    fullPage: true,
  });
} finally {
  await browser.close();
}

console.log(`Screenshots saved to ${path.relative(rootDir, outputDir)}`);
