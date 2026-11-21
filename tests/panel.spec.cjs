const { chromium } = require('/root/router-dashboard/node_modules/playwright');
const fs = require('fs');
const assert = require('assert');
const { pathToFileURL } = require('url');
const root = '/root/ksu-singbox';
const quoteParse = command => {
  const pieces = command.match(/'(?:[^']|'\\'')*'/g) || [];
  return pieces.map(p => p.slice(1, -1).replace(/'\\''/g, "'"));
};
const tags = ['🇭🇰 香港 VLESS (极速 21ms)', '🇸🇬 新加坡 VLESS (金融专线)', '🇺🇸 美国 VLESS (跨洋大带宽)', '🇭🇰 香港 Hysteria 2', '🇺🇸 美国 Hysteria 2'];
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  let snapshot = {
    core: { running: true, pid: 18208, rss_kb: 30216 }, configs: { mode: 'Direct' },
    preferences: { automatic: true, gateway: '192.168.1.1', ssid: 'HomeWiFi' },
    home: { location: 'home', interface: 'wlan0', gateway: '192.168.1.1', ssid: 'HomeWiFi', applied: true },
    proxies: { proxies: Object.fromEntries(tags.map(t => [t, { type: t.includes('Hysteria') ? 'Hysteria2' : 'VLESS' }])) },
    connections: { downloadTotal: 50330000, uploadTotal: 334000, connections: [{ id: 'one', metadata: { host: 'rewards.bing.com', network: 'tcp' }, chains: ['direct'], download: 54000, upload: 1200 }] }
  };
  snapshot.proxies.proxies.PROXY = { now: tags[0], all: tags };
  snapshot.proxies.proxies.MICROSOFT = { now: tags[2], all: [tags[2], tags[4]] };
  let config = { outbounds: [{ type: 'selector', tag: 'PROXY', outbounds: tags, default: tags[0] }, { type: 'selector', tag: 'MICROSOFT', outbounds: [tags[2], tags[4]] }, ...tags.map(tag => ({ type: 'vless', tag, server: 'example.com', server_port: 443, uuid: 'test' }))], experimental: { clash_api: {} } };
  let failPut = false, writes = 0;
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__execMock', command => {
    const args = quoteParse(command); const op = args[0];
    if (op === 'snapshot') return JSON.stringify(snapshot);
    if (op === 'config-get') return JSON.stringify(config);
    if (op === 'config-save') { config = JSON.parse(Buffer.from(args[1], 'base64').toString()); writes++; return '{}'; }
    if (op === 'mode') { snapshot.configs.mode = args[1]; snapshot.preferences.automatic = false; return '{}'; }
    if (op === 'home-save') { snapshot.preferences = { automatic: args[1] === '1', gateway: args[2], ssid: Buffer.from(args[3], 'base64').toString() }; return '{}'; }
    if (op === 'logs') return '2026-11-15 核心已启动\nERROR sample';
    if (op === 'restart') return '{}';
    if (op === 'api') {
      if (args[2] === '/version') return JSON.stringify({ version: 'sing-box 1.14.4' });
      if (args[1] === 'PUT') { if (failPut) throw new Error('模拟节点切换失败'); const body = JSON.parse(Buffer.from(args[3], 'base64').toString()); snapshot.proxies.proxies[args[2].split('/').pop()].now = body.name; return '{}'; }
      if (args[2].includes('/delay')) return JSON.stringify({ delay: 34 });
      if (args[1] === 'DELETE') { snapshot.connections.connections = []; return '{}'; }
    }
    throw new Error('Unexpected command ' + command);
  });
  await page.addInitScript(() => { window.ksu = { exec(command, options, callback) { window.__execMock(command).then(stdout => window[callback]?.(0, stdout, ''), error => window[callback]?.(1, '', error.message)); } }; });
  await page.goto(pathToFileURL(root + '/webroot/index.html').href);
  await page.getByText('核心运行中', { exact: true }).waitFor();
  assert(await page.getByText('在家，交给软路由', { exact: true }).isVisible());
  await page.screenshot({ path: root + '/artifacts/overview-light.png', fullPage: true });
  await page.locator('.bottom-nav [data-tab="nodes"]').click();
  assert.equal(await page.locator('.node-card').count(), 5);
  await page.locator('[data-group="MICROSOFT"]').click();
  assert.equal(await page.locator('.node-card').count(), 2);
  await page.locator('.node-select').nth(1).click();
  await page.waitForTimeout(80);
  assert.equal(snapshot.proxies.proxies.MICROSOFT.now, tags[4]);
  failPut = true;
  await page.locator('.node-select').first().click();
  await page.getByText('模拟节点切换失败', { exact: true }).waitFor();
  assert.equal(snapshot.proxies.proxies.MICROSOFT.now, tags[4]); failPut = false;
  await page.locator('[data-group="PROXY"]').click();
  await page.locator('.latency').first().click();
  await page.getByText('34 ms', { exact: true }).waitFor();
  await page.screenshot({ path: root + '/artifacts/nodes-light.png', fullPage: true });
  await page.locator('.bottom-nav [data-tab="connections"]').click();
  await page.locator('#connection-search').fill('no-match');
  assert(await page.getByText('没有匹配的连接').isVisible());
  await page.locator('#connection-search').fill('rewards');
  assert(await page.locator('.connection-card').isVisible());
  await page.locator('.bottom-nav [data-tab="settings"]').click();
  await page.locator('#home-ssid').fill("Home's Wi-Fi");
  await page.locator('#home-form button').click(); await page.waitForTimeout(80);
  assert.equal(snapshot.preferences.ssid, "Home's Wi-Fi");
  await page.locator('button[data-theme="dark"]').click();
  await page.screenshot({ path: root + '/artifacts/settings-dark.png', fullPage: true });
  await page.locator('[data-action="import"]').last().click({ force: true }).catch(() => {});
  await page.locator('.bottom-nav [data-tab="nodes"]').click();
  await page.locator('[data-action="import"]').last().click();
  await page.locator('#sheet textarea').fill('vless://12345678-1234-1234-1234-123456789012@example.net:443?security=tls&sni=example.net#Test%20Node');
  await page.getByText('校验并导入', { exact: true }).click(); await page.waitForTimeout(100);
  assert.equal(writes, 1); assert(config.outbounds.some(o => o.tag === 'Test Node'));
  assert.equal(config.experimental.clash_api.external_controller, '127.0.0.1:9090');
  for (const width of [320, 393, 600]) { await page.setViewportSize({ width, height: 852 }); for (const tab of ['overview','nodes','connections','routing','settings']) { await page.locator(`.bottom-nav [data-tab="${tab}"]`).click(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}/${tab}`); } }
  assert.deepEqual(errors, []);
  await browser.close(); console.log('Panel integration checks passed: navigation, groups, failure feedback, delay, search, settings, import, theme, responsive layout.');
})();
