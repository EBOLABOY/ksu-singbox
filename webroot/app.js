(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
  const base64 = value => btoa(Array.from(new TextEncoder().encode(value), b => String.fromCharCode(b)).join(''));
  const icons = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const create = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  const state = { page: 'overview', group: 'PROXY', snapshot: null, config: null, directDomains: [], delays: new Map(), sort: false, timer: null, refreshing: false, writing: false, dirtyHome: false, previous: null, history: { down: Array(24).fill(0), up: Array(24).fill(0) } };
  const supported = typeof window.ksu?.exec === 'function';
  let sequence = 0, toastTimer;

  function exec(command, timeout = 22000) {
    if (!supported) return Promise.reject(new Error('请在 KernelSU 模块中打开面板'));
    return new Promise((resolve, reject) => {
      const callback = `__singbox_${Date.now()}_${sequence++}`;
      const timer = setTimeout(() => { delete window[callback]; reject(new Error('操作超时，请刷新后确认实际状态')); }, timeout);
      window[callback] = (errno, stdout, stderr) => {
        clearTimeout(timer); delete window[callback];
        if (Number(errno) !== 0) reject(new Error((stderr || stdout || `命令返回 ${errno}`).trim().slice(0, 1800)));
        else resolve(String(stdout || '').trim());
      };
      try { window.ksu.exec(command, '{}', callback); } catch (error) { clearTimeout(timer); delete window[callback]; reject(error); }
    });
  }
  const bridge = (...args) => exec('sh /data/adb/box/scripts/box.ui ' + args.map(quote).join(' '));
  async function api(method, path, body) { const value = await bridge('api', method, path, body ? base64(JSON.stringify(body)) : ''); return value ? JSON.parse(value) : {}; }
  function notify(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3400); }
  function report(error) { notify(error.message || String(error)); }
  function bytes(value) { value = Math.max(0, Number(value) || 0); const units = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; } return `${value.toFixed(i ? 1 : 0)} ${units[i]}`; }
  function speed(value) { const result = bytes(value).split(' '); return [result[0], `${result[1]}/s`]; }
  function region(name) { if (/香港|🇭🇰|\bHK\b/i.test(name)) return 'HK'; if (/美国|🇺🇸|\bUS\b/i.test(name)) return 'US'; if (/新加坡|🇸🇬|\bSG\b/i.test(name)) return 'SG'; if (/日本|🇯🇵|\bJP\b/i.test(name)) return 'JP'; return '↗'; }
  function cleanName(name) { return (name || '未选择节点').replace(/\p{Regional_Indicator}/gu, '').replace(/\s*[（(](?:极速|金融专线|跨洋大带宽)[^）)]*[）)]\s*/g, '').trim(); }
  function groupData() { return state.snapshot?.proxies?.proxies?.[state.group]; }
  function navigate(page) {
    if (!['overview', 'nodes', 'connections', 'routing', 'settings'].includes(page)) return;
    state.page = page;
    document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
    document.querySelectorAll('.bottom-nav button').forEach(el => { const active = el.dataset.tab === page; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (page === 'nodes') renderNodes(); if (page === 'connections') renderConnections(); if (page === 'routing') loadDirectDomains().catch(report);
  }
  function draw(direction, value) {
    const history = state.history[direction]; history.push(value); history.shift(); const max = Math.max(...history, 1024);
    $(direction === 'down' ? 'download-line' : 'upload-line').setAttribute('d', history.map((v, i) => `${i ? 'L' : 'M'}${(i * 150 / (history.length - 1)).toFixed(2)} ${(24 - v / max * 21).toFixed(2)}`).join(' '));
    const [number, unit] = speed(value); const target = $(direction === 'down' ? 'download-speed' : 'upload-speed'); target.replaceChildren(document.createTextNode(number + ' '), create('small', '', unit));
  }
  function update() {
    const s = state.snapshot; if (!s) return;
    const running = s.core?.running, mode = s.configs?.mode || '', home = s.home?.location === 'home', automatic = s.preferences?.automatic;
    const proxy = s.proxies?.proxies?.PROXY, microsoft = s.proxies?.proxies?.MICROSOFT;
    $('core-badge').className = `pill ${running ? 'running' : 'neutral'}`; $('core-badge').replaceChildren(create('span', 'dot'), document.createTextNode(running ? '核心运行中' : '核心未运行'));
    $('environment-label').textContent = home ? '家庭网络' : (s.home?.interface?.startsWith('wlan') ? '外部 Wi-Fi' : '移动网络');
    $('hero-live-label').textContent = running ? '连接就绪' : '等待启动';
    $('hero-kicker').textContent = automatic ? '自动适应当前网络' : '当前使用手动策略';
    $('hero-title').textContent = !running ? '核心暂未运行' : home && mode === 'Direct' ? '在家，交给软路由' : mode === 'Direct' ? '保持原生连接' : mode === 'Global' ? '连接更广阔的世界' : '让每条连接各得其所';
    $('hero-description').textContent = !running ? '在设置中重启核心，或查看运行日志' : home && mode === 'Direct' ? '手机使用直连，由家庭软路由统一分流' : mode === 'Direct' ? '手机直连模式，核心保持运行' : mode === 'Global' ? '通用流量使用当前选中的代理节点' : '国内按规则直连，其他流量使用代理';
    $('network-name').textContent = s.home?.ssid || s.home?.gateway || s.home?.interface || '识别中';
    $('control-source').textContent = automatic ? '自动切换已开启' : '手动管理';
    document.querySelectorAll('[data-mode]').forEach(el => { el.classList.toggle('selected', el.dataset.mode === mode); el.setAttribute('aria-pressed', String(el.dataset.mode === mode)); });
    $('current-node').textContent = cleanName(proxy?.now);
    $('current-node-note').textContent = mode === 'Direct' ? '已待命 · 当前使用直连' : '用于匹配通用代理策略的连接';
    $('microsoft-node').textContent = cleanName(microsoft?.now);
    $('microsoft-note').textContent = home && mode === 'Direct' ? '当前由家庭软路由处理微软分流' : mode === 'Global' ? '全局模式下请核对高级分流规则' : 'Bing · Copilot · Rewards · Microsoft 365';
    $('runtime-memory').textContent = `内存 ${((s.core?.rss_kb || 0) / 1024).toFixed(1)} MB`;
    $('runtime-connections').textContent = `连接 ${s.connections?.connections?.length || 0}`;
    if (!state.dirtyHome) { $('automatic-switch').checked = !!automatic; $('home-gateway').value = s.preferences?.gateway || ''; $('home-ssid').value = s.preferences?.ssid || ''; }
    const current = { time: performance.now(), down: s.connections?.downloadTotal || 0, up: s.connections?.uploadTotal || 0, pid: s.core?.pid };
    if (state.previous && current.pid === state.previous.pid) { const seconds = (current.time - state.previous.time) / 1000; if (seconds > 0) { draw('down', Math.max(0, (current.down - state.previous.down) / seconds)); draw('up', Math.max(0, (current.up - state.previous.up) / seconds)); } } else { draw('down', 0); draw('up', 0); }
    state.previous = current;
    if (state.page === 'nodes') renderNodes(); if (state.page === 'connections') renderConnections();
  }
  async function refresh({ quiet = false } = {}) {
    if (state.refreshing || !supported) return;
    state.refreshing = true;
    try { state.snapshot = JSON.parse(await bridge('snapshot')); $('error-banner').hidden = true; update(); }
    catch (error) { $('error-banner').hidden = false; $('error-banner').textContent = `状态读取失败：${error.message}`; if (!quiet) report(error); }
    finally { state.refreshing = false; }
  }
  function schedule() { clearTimeout(state.timer); if (document.hidden || !supported) return; state.timer = setTimeout(async () => { await refresh({ quiet: true }); schedule(); }, 4000); }
  async function write(action) {
    if (state.writing) return;
    state.writing = true;
    document.querySelectorAll('[data-mode], #home-form button, #routing-form button, #sheet-content .button').forEach(el => el.disabled = true);
    try { await action(); await refresh({ quiet: true }); }
    catch (error) { report(error); const inline = $('operation-error') || (state.page === 'routing' ? $('routing-error') : null); if (inline) inline.textContent = error.message; }
    finally { state.writing = false; document.querySelectorAll('[data-mode], #home-form button, #routing-form button, #sheet-content .button').forEach(el => el.disabled = false); }
  }
  function openSheet(title, eyebrow = '本机配置') { $('sheet-title').textContent = title; $('sheet-eyebrow').textContent = eyebrow; $('sheet-content').replaceChildren(); if (!$('sheet').open) $('sheet').showModal(); return $('sheet-content'); }
  function sheetError(container) { const p = create('p', 'inline-error'); p.id = 'operation-error'; container.append(p); }
  function confirmAction(title, message, label, action) {
    const root = openSheet(title); root.append(create('p', 'sheet-text', message));
    const row = create('div', 'sheet-actions'), cancel = create('button', 'button', '取消'), proceed = create('button', 'button primary', label);
    cancel.onclick = () => $('sheet').close(); proceed.onclick = () => write(async () => { await action(); $('sheet').close(); }); row.append(cancel, proceed); root.append(row); sheetError(root);
  }
  function renderNodes() {
    const group = groupData(), map = state.snapshot?.proxies?.proxies || {}, list = $('node-list'); list.replaceChildren();
    document.querySelectorAll('[data-group]').forEach(el => el.classList.toggle('selected', el.dataset.group === state.group));
    $('group-description').textContent = state.group === 'MICROSOFT' ? '微软专线独立选择。请只将美国出口加入此组。' : '选择节点只影响该策略组的新连接。';
    let names = [...(group?.all || [])]; if (state.sort) names.sort((a, b) => (state.delays.get(a) ?? Infinity) - (state.delays.get(b) ?? Infinity));
    $('node-count').textContent = `${names.length} 个节点`;
    if (!names.length) { list.append(create('div', 'empty-state', '尚无可用节点，导入链接后即可选择')); return; }
    names.forEach(name => {
      const selected = group.now === name, row = create('article', `node-card${selected ? ' selected' : ''}`);
      const button = create('button', 'node-select'); button.setAttribute('aria-label', `选择 ${name}`); button.setAttribute('aria-pressed', String(selected));
      const info = create('span', 'node-info'); info.append(create('span', 'node-name', cleanName(name)), create('span', 'node-detail', `${map[name]?.type || '代理'}${selected ? ' · 已选择' : ''}`)); button.append(create('span', 'region-icon', region(name)), info);
      button.onclick = () => write(async () => { await api('PUT', '/proxies/' + state.group, { name }); notify('节点已切换'); });
      const side = create('div', 'node-side'), latency = create('button', 'latency'); const value = state.delays.get(name); latency.textContent = value === undefined ? '测试' : Number.isFinite(value) ? `${value} ms` : '超时'; latency.onclick = () => testNode(name);
      const edit = create('button', 'node-edit', '编辑'); edit.onclick = () => editNode(name);
      side.append(latency, edit); row.append(button, side); list.append(row);
    });
  }
  async function testNode(name) {
    try { const result = await api('GET', `/proxies/${encodeURIComponent(name)}/delay?timeout=4000&url=http%3A%2F%2Fcp.cloudflare.com%2Fgenerate_204`); state.delays.set(name, Number(result.delay) || Infinity); }
    catch (_) { state.delays.set(name, Infinity); }
    renderNodes();
  }
  async function testAll() {
    const button = $('test-all'); if (button.disabled) return; button.disabled = true; button.textContent = '测试中…';
    const queue = [...(groupData()?.all || [])]; await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) await testNode(queue.shift()); }));
    button.disabled = false; button.innerHTML = icons('activity') + '全部测试'; notify('节点测试完成');
  }
  function renderConnections() {
    const source = state.snapshot?.connections || {}, query = $('connection-search').value.trim().toLowerCase(), all = source.connections || [];
    const connections = all.filter(c => [c.metadata?.host, c.metadata?.destinationIP, ...(c.chains || []), c.rule].join(' ').toLowerCase().includes(query));
    $('connection-count').textContent = `${all.length} 个活跃`; $('download-total').textContent = bytes(source.downloadTotal); $('upload-total').textContent = bytes(source.uploadTotal);
    const list = $('connection-list'); list.replaceChildren();
    if (!connections.length) { list.append(create('div', 'empty-state', query ? '没有匹配的连接' : '当前没有活跃连接')); return; }
    connections.slice(0, 150).forEach(c => {
      const row = create('article', 'connection-card'), copy = create('div', 'connection-copy'), host = c.metadata?.host || c.metadata?.destinationIP || '未知目标';
      copy.append(create('strong', '', host), create('p', '', `${(c.metadata?.network || 'tcp').toUpperCase()} · ${(c.chains || ['direct']).join(' → ')} · ↓ ${bytes(c.download)} · ↑ ${bytes(c.upload)}`));
      const close = create('button', 'icon-button'); close.innerHTML = icons('close'); close.setAttribute('aria-label', `关闭 ${host} 的连接`); close.onclick = () => write(async () => { await api('DELETE', `/connections/${encodeURIComponent(c.id)}`); notify('连接已关闭'); });
      row.append(copy, close); list.append(row);
    });
  }
  async function loadConfig() { state.config = JSON.parse(await bridge('config-get')); return state.config; }
  function normalizeConfig(config) {
    const result = structuredClone(config);
    result.experimental ||= {}; result.experimental.clash_api ||= {};
    Object.assign(result.experimental.clash_api, { external_controller: '127.0.0.1:9090' });
    delete result.experimental.clash_api.external_ui; delete result.experimental.clash_api.external_ui_download_url;
    if (result.dns?.servers?.some(server => server.type === 'fakeip')) {
      result.experimental.cache_file ||= {};
      Object.assign(result.experimental.cache_file, { enabled: true, store_fakeip: true });
    }
    // Keep the page's direct domain list consistent with DNS, including
    // domains added/removed after the initial PushPlus setup.
    if (result.dns?.servers?.some(server => server.tag === 'dns-direct')) {
      const directRule = result.route?.rules?.find(managedDirectRule);
      if (directRule) {
        const domains = Array.isArray(directRule.domain_suffix) ? [...directRule.domain_suffix] : [directRule.domain_suffix];
        result.dns.rules ||= [];
        const index = result.dns.rules.findIndex(rule => {
          const suffixes = Array.isArray(rule.domain_suffix) ? rule.domain_suffix : [rule.domain_suffix];
          return rule.server === 'dns-direct' && Object.keys(rule).every(key => ['domain_suffix', 'server', 'action'].includes(key)) && suffixes.includes('pushplus.plus');
        });
        const rule = { domain_suffix: domains, server: 'dns-direct' };
        if (index >= 0) result.dns.rules[index] = rule;
        else result.dns.rules.unshift(rule);
      }
    }
    return result;
  }
  async function saveConfig(config) { await bridge('config-save', base64(JSON.stringify(normalizeConfig(config), null, 2))); state.config = config; notify('配置已校验并应用'); }
  function managedDirectRule(rule) { const domains = Array.isArray(rule?.domain_suffix) ? rule.domain_suffix : rule?.domain_suffix ? [rule.domain_suffix] : []; return rule?.outbound === 'direct' && domains.some(domain => String(domain).replace(/^\+\./, '').toLowerCase() === 'pushplus.plus'); }
  async function loadDirectDomains() {
    const config = await loadConfig(), rules = config.route?.rules || [], rule = rules.find(managedDirectRule);
    const ruleDomains = Array.isArray(rule?.domain_suffix) ? rule.domain_suffix : rule?.domain_suffix ? [rule.domain_suffix] : [];
    state.directDomains = [...new Set([...ruleDomains, 'pushplus.plus'].map(domain => String(domain).replace(/^\+\./, '').toLowerCase()))];
    renderDirectDomains();
  }
  function renderDirectDomains() { const input = $('direct-domains'); if (input && document.activeElement !== input) input.value = state.directDomains.join('\n'); }
  async function saveDirectDomains() {
    const inline = $('routing-error'); inline.textContent = '';
    const domains = [...new Set($('direct-domains').value.split(/\r?\n/).map(value => value.trim().toLowerCase().replace(/^\+\./, '')).filter(Boolean))];
    if (!domains.includes('pushplus.plus')) domains.unshift('pushplus.plus');
    for (const domain of domains) {
      if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error(`域名格式无效：${domain}`);
    }
    const config = await loadConfig(); config.route ||= {}; config.route.rules ||= [];
    const index = config.route.rules.findIndex(managedDirectRule), rule = { domain_suffix: domains, outbound: 'direct' };
    if (index >= 0) config.route.rules[index] = rule;
    else { const privateIndex = config.route.rules.findIndex(item => item.ip_is_private === true); config.route.rules.splice(privateIndex >= 0 ? privateIndex + 1 : 0, 0, rule); }
    await saveConfig(config); state.directDomains = domains; renderDirectDomains(); notify('直连域名已保存');
  }
  function field(root, label, value, options = {}) { const id = `field-${sequence++}`, wrapper = create('label', 'field-label', label); wrapper.htmlFor = id; const input = create(options.multiline ? 'textarea' : 'input', options.multiline ? 'text-area code-editor' : 'text-input'); input.id = id; input.value = value || ''; if (options.placeholder) input.placeholder = options.placeholder; if (options.type) input.type = options.type; root.append(wrapper, input); return input; }
  function parseLink(text) {
    const link = new URL(text.trim()), type = link.protocol.slice(0, -1), params = link.searchParams;
    const tag = decodeURIComponent(link.hash.slice(1)) || `${link.hostname} ${type.toUpperCase()}`;
    const common = { tag, server: link.hostname.replace(/^\[|\]$/g, ''), server_port: Number(link.port) || 443 };
    if (type === 'vless') {
      const node = { ...common, type: 'vless', uuid: decodeURIComponent(link.username) };
      if (params.get('flow')) node.flow = params.get('flow');
      const security = params.get('security'); if (security === 'tls' || security === 'reality') { node.tls = { enabled: true, server_name: params.get('sni') || params.get('servername') || common.server }; if (params.get('fp')) node.tls.utls = { enabled: true, fingerprint: params.get('fp') }; if (security === 'reality') node.tls.reality = { enabled: true, public_key: params.get('pbk') || '', short_id: params.get('sid') || '' }; }
      const transport = params.get('type'); if (transport && transport !== 'tcp') { if (!['ws', 'grpc', 'http'].includes(transport)) throw new Error('该传输方式请使用 JSON 导入'); node.transport = { type: transport }; if (params.get('path')) node.transport.path = params.get('path'); if (params.get('host')) node.transport.headers = { Host: params.get('host') }; if (transport === 'grpc') node.transport.service_name = params.get('serviceName') || ''; }
      return node;
    }
    if (['hysteria2', 'hy2', 'trojan'].includes(type)) { const node = { ...common, type: type === 'hy2' ? 'hysteria2' : type, password: decodeURIComponent(link.username + (link.password ? ':' + link.password : '')), tls: { enabled: true, server_name: params.get('sni') || common.server } }; if (params.get('insecure') === '1' || params.get('allowInsecure') === '1') node.tls.insecure = true; if (params.get('obfs') === 'salamander') node.obfs = { type: 'salamander', password: params.get('obfs-password') || '' }; return node; }
    if (type === 'ss') { let auth = decodeURIComponent(link.username); if (!auth.includes(':')) { auth = atob(auth.replace(/-/g, '+').replace(/_/g, '/')); } const colon = auth.indexOf(':'); if (colon < 0) throw new Error('Shadowsocks 链接缺少加密方法'); if (params.has('plugin')) throw new Error('带插件的 Shadowsocks 节点请使用 JSON 导入'); return { ...common, type: 'shadowsocks', method: auth.slice(0, colon), password: auth.slice(colon + 1), server_port: Number(link.port) || 8388 }; }
    throw new Error('支持 VLESS、Hysteria 2、Trojan、Shadowsocks，或 sing-box 节点 JSON');
  }
  async function importNodes() {
    const root = openSheet('添加新的连接', '节点导入'); root.append(create('p', 'sheet-text', '粘贴分享链接，每行一个；也支持 sing-box 节点 JSON。'));
    const input = field(root, '链接或 JSON', '', { multiline: true, placeholder: 'vless://…\nhysteria2://…' }); input.classList.remove('code-editor');
    const msLabel = create('label', 'field-label'), checkbox = create('input'); checkbox.type = 'checkbox'; msLabel.append(checkbox, document.createTextNode(' 同时加入微软专线（请确认是美国出口）')); root.append(msLabel);
    const submit = create('button', 'button primary full-width', '校验并导入'); root.append(submit); sheetError(root);
    submit.onclick = () => write(async () => {
      if (!input.value.trim()) throw new Error('请先粘贴链接或 JSON');
      const raw = input.value.trim(); let nodes;
      if (raw.startsWith('{') || raw.startsWith('[')) { const obj = JSON.parse(raw); nodes = Array.isArray(obj) ? obj : obj.outbounds || [obj]; } else nodes = raw.split(/\r?\n/).filter(l => l.trim()).map(parseLink);
      const config = await loadConfig(), allowed = new Set(['vless', 'hysteria2', 'trojan', 'shadowsocks', 'vmess', 'tuic', 'socks', 'http', 'anytls']);
      for (const node of nodes) { if (!allowed.has(node.type) || !node.tag || !node.server) throw new Error('每个节点需要有效的 type、tag 和 server'); if (config.outbounds.some(o => o.tag === node.tag)) throw new Error(`节点名称已存在：${node.tag}`); config.outbounds.push(node); for (const group of config.outbounds.filter(o => o.tag === 'PROXY' || (checkbox.checked && o.tag === 'MICROSOFT'))) { group.outbounds ||= []; group.outbounds.push(node.tag); group.default ||= node.tag; } }
      await saveConfig(config); $('sheet').close();
    });
  }
  async function editNode(name) {
    try {
      const config = await loadConfig(), node = config.outbounds.find(o => o.tag === name); if (!node) throw new Error('配置中未找到此节点');
      const root = openSheet('编辑节点', cleanName(name)), input = field(root, 'sing-box 节点 JSON', JSON.stringify(node, null, 2), { multiline: true });
      root.append(create('p', 'note', '认证信息仅在本机读取。保存前由 sing-box 校验。'));
      const actions = create('div', 'sheet-actions'), remove = create('button', 'button danger', '删除节点'), save = create('button', 'button primary', '校验并保存'); actions.append(remove, save); root.append(actions); sheetError(root);
      save.onclick = () => write(async () => { const updated = JSON.parse(input.value); if (!updated.tag || !updated.type || !updated.server) throw new Error('节点缺少必要字段'); const latest = await loadConfig(); if (updated.tag !== name && latest.outbounds.some(o => o.tag === updated.tag)) throw new Error('节点名称已存在'); latest.outbounds = latest.outbounds.map(o => { if (o.tag === name) return updated; if (Array.isArray(o.outbounds)) o.outbounds = o.outbounds.map(t => t === name ? updated.tag : t); if (o.default === name) o.default = updated.tag; return o; }); await saveConfig(latest); $('sheet').close(); });
      remove.onclick = () => confirmAction('删除这个节点？', `将从所有策略组中移除「${cleanName(name)}」。`, '确认删除', async () => { const latest = await loadConfig(); for (const group of latest.outbounds.filter(o => Array.isArray(o.outbounds) && o.outbounds.includes(name))) { if (group.outbounds.length < 2) throw new Error(`这是 ${group.tag} 的最后一个节点，请先添加替代节点`); group.outbounds = group.outbounds.filter(t => t !== name); if (group.default === name) group.default = group.outbounds[0]; } latest.outbounds = latest.outbounds.filter(o => o.tag !== name); await saveConfig(latest); });
    } catch (error) { report(error); }
  }
  async function advanced() { try { const config = await loadConfig(), root = openSheet('高级配置', 'SING-BOX JSON'); root.append(create('p', 'sheet-text', '保存会短暂重启核心。仅接受有效配置，启动失败时恢复上一份。')); const input = field(root, '完整配置', JSON.stringify(config, null, 2), { multiline: true }); const button = create('button', 'button primary full-width', '校验并应用'); root.append(button); sheetError(root); button.onclick = () => write(async () => { await saveConfig(JSON.parse(input.value)); $('sheet').close(); }); } catch (error) { report(error); } }
  async function showLogs() { const root = openSheet('运行日志', '最近 80 行'); const pre = create('pre', 'log-output', '正在读取…'); root.append(pre); try { pre.textContent = await bridge('logs') || '暂时没有日志'; } catch (error) { pre.textContent = error.message; } }
  function applyTheme(preference) { localStorage.setItem('singbox-theme', preference); document.documentElement.dataset.theme = preference === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : preference; document.querySelectorAll('[data-theme]').forEach(el => el.classList.toggle('selected', el.dataset.theme === preference)); document.querySelector('meta[name="theme-color"]').content = document.documentElement.dataset.theme === 'dark' ? '#10191c' : '#f4f6f8'; }
  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]'); if (tab) { navigate(tab.dataset.tab); return; }
    const group = event.target.closest('[data-group]'); if (group) { state.group = group.dataset.group; renderNodes(); return; }
    const theme = event.target.closest('button[data-theme]'); if (theme) { applyTheme(theme.dataset.theme); return; }
    const mode = event.target.closest('[data-mode]'); if (mode) {
      const change = async () => { await bridge('mode', mode.dataset.mode); notify('已切换为手动模式'); };
      if (state.snapshot?.preferences?.automatic) confirmAction('改为手动管理？', '自动切换将暂停。之后可在设置中重新开启。', '切换模式', change); else write(change); return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'refresh') { refresh(); schedule(); }
    if (action === 'microsoft') { state.group = 'MICROSOFT'; navigate('nodes'); }
    if (action === 'import') importNodes();
    if (action === 'sort') { state.sort = !state.sort; event.target.textContent = state.sort ? '恢复原顺序' : '按延迟排序'; renderNodes(); }
    if (action === 'test-all') testAll();
    if (action === 'restart') confirmAction('重启 sing-box？', '由手机处理的连接会短暂中断。当前配置和节点选择将保留。', '重启核心', async () => { await bridge('restart'); notify('核心已重新就绪'); });
    if (action === 'logs') showLogs(); if (action === 'advanced') advanced();
  });
  $('connection-search').addEventListener('input', renderConnections);
  $('home-form').addEventListener('input', () => state.dirtyHome = true);
  $('routing-form').addEventListener('submit', event => { event.preventDefault(); write(saveDirectDomains); });
  $('home-form').addEventListener('submit', event => { event.preventDefault(); write(async () => { const gateway = $('home-gateway').value.trim(), ssid = $('home-ssid').value; if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(gateway) || gateway.split('.').some(v => +v > 255)) throw new Error('请输入有效的 IPv4 网关地址'); if (new TextEncoder().encode(ssid).length > 32) throw new Error('Wi-Fi 名称不能超过 32 字节'); await bridge('home-save', $('automatic-switch').checked ? '1' : '0', gateway, base64(ssid)); state.dirtyHome = false; notify('家庭联动设置已保存'); }); });
  document.addEventListener('visibilitychange', () => { clearTimeout(state.timer); if (!document.hidden) { refresh({ quiet: true }); schedule(); } });
  window.addEventListener('pagehide', () => clearTimeout(state.timer));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (localStorage.getItem('singbox-theme') === 'system') applyTheme('system'); });
  applyTheme(localStorage.getItem('singbox-theme') || 'system');
  if (!supported) { $('bridge-warning').hidden = false; $('core-badge').textContent = '等待 KernelSU'; } else { refresh(); bridge('api', 'GET', '/version').then(value => { $('core-version').textContent = JSON.parse(value).version || 'sing-box'; }).catch(() => {}); schedule(); }
})();
