(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
  const encodeSegment = value => encodeURIComponent(value).replace(/[!'()*~]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
  const base64 = value => btoa(Array.from(new TextEncoder().encode(value), b => String.fromCharCode(b)).join(''));
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const create = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  const state = {
    page: 'overview',
    group: 'PROXY',
    snapshot: null,
    config: null,
    version: 'sing-box',
    directDomains: [],
    delays: new Map(),
    sort: false,
    timer: null,
    refreshing: false,
    writing: false,
    dirtyHome: false,
    previous: null
  };

  const supported = typeof window.ksu?.exec === 'function';
  let sequence = 0;
  let toastTimer;

  function exec(command, timeout = 22000) {
    if (!supported) return Promise.reject(new Error('请在 KernelSU 模块中打开面板'));
    return new Promise((resolve, reject) => {
      const callback = `__singbox_${Date.now()}_${sequence++}`;
      const timer = setTimeout(() => {
        delete window[callback];
        reject(new Error('操作超时，请刷新后确认实际状态'));
      }, timeout);
      window[callback] = (errno, stdout, stderr) => {
        clearTimeout(timer);
        delete window[callback];
        if (Number(errno) !== 0) reject(new Error((stderr || stdout || `命令返回 ${errno}`).trim().slice(0, 1800)));
        else resolve(String(stdout || '').trim());
      };
      try {
        window.ksu.exec(command, '{}', callback);
      } catch (error) {
        clearTimeout(timer);
        delete window[callback];
        reject(error);
      }
    });
  }

  const bridge = (...args) => exec('sh /data/adb/box/scripts/box.ui ' + args.map(quote).join(' '));

  async function api(method, path, body) {
    const value = await bridge('api', method, path, body ? base64(JSON.stringify(body)) : '');
    return value ? JSON.parse(value) : {};
  }

  function notify(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
  }

  function report(error) {
    notify(error.message || String(error));
  }

  function bytes(value) {
    value = Math.max(0, Number(value) || 0);
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  function speedText(value) {
    return `${bytes(value)}/s`;
  }

  function region(name) {
    if (/香港|🇭🇰|\bHK\b/i.test(name)) return 'HK';
    if (/美国|🇺🇸|\bUS\b/i.test(name)) return 'US';
    if (/新加坡|🇸🇬|\bSG\b/i.test(name)) return 'SG';
    if (/日本|🇯🇵|\bJP\b/i.test(name)) return 'JP';
    if (/台湾|🇹🇼|\bTW\b/i.test(name)) return 'TW';
    return 'NET';
  }

  function cleanName(name) {
    return (name || '未选择')
      .replace(/\p{Regional_Indicator}/gu, '')
      .replace(/\s*[（(](?:极速|金融专线|跨洋大带宽)[^）)]*[）)]\s*/g, '')
      .trim();
  }

  function modeLabel(mode) {
    if (mode === 'Rule') return '规则分流';
    if (mode === 'Global') return '全局代理';
    if (mode === 'Direct') return '直连模式';
    return '—';
  }

  function groupData() {
    return state.snapshot?.proxies?.proxies?.[state.group];
  }

  function navigate(page) {
    if (!['overview', 'nodes', 'connections', 'routing', 'settings'].includes(page)) return;
    state.page = page;
    document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
    document.querySelectorAll('.m3-nav-bar button').forEach(el => {
      const active = el.dataset.tab === page;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (page === 'nodes') renderNodes();
    if (page === 'connections') renderConnections();
    if (page === 'routing') loadDirectDomains().catch(report);
  }

  function update() {
    const s = state.snapshot;
    if (!s) return;

    const running = Boolean(s.core?.running);
    const mode = s.configs?.mode || '';
    const home = s.home?.location === 'home';
    const automatic = Boolean(s.preferences?.automatic);
    const proxy = s.proxies?.proxies?.PROXY;
    const microsoft = s.proxies?.proxies?.MICROSOFT;

    $('status-banner').className = `m3-status-card ${running ? 'working' : 'stopped'}`;
    $('core-status-title').textContent = running ? '工作中' : '已停止';
    $('mode-chip').textContent = running ? modeLabel(mode) : '未启动';
    $('core-status-meta').textContent = running && s.core?.pid
      ? `${state.version} · PID ${s.core.pid}`
      : '核心未运行，可在设置中重启或查看日志';

    $('control-source').textContent = automatic ? '自动切换已开启' : '手动控制';
    document.querySelectorAll('[data-mode]').forEach(el => {
      const selected = el.dataset.mode === mode;
      el.classList.toggle('selected', selected);
      el.setAttribute('aria-pressed', String(selected));
    });

    $('mode-description').textContent = !running
      ? '核心当前未运行，可在设置中重启或查看日志。'
      : home && mode === 'Direct'
        ? '已识别家庭网络，流量直连交由软路由统一分流。'
        : mode === 'Direct'
          ? '所有流量直连，核心保持运行以便随时切换。'
          : mode === 'Global'
            ? '所有非私有流量均经由「通用代理」转发。'
            : '国内域名与 IP 直连，其余流量按规则转发。';

    $('current-node').textContent = cleanName(proxy?.now);
    $('current-node-note').textContent = mode === 'Direct' ? '待命 · 当前直连' : 'PROXY 默认出口';

    $('microsoft-node').textContent = cleanName(microsoft?.now);
    $('microsoft-note').textContent = home && mode === 'Direct'
      ? '当前由软路由处理'
      : '美国出口 · M365';

    const ai = s.proxies?.proxies?.AI;
    $('ai-node').textContent = !ai
      ? '未配置'
      : ai.now === 'PROXY'
        ? '跟随通用代理'
        : cleanName(ai.now);
    $('ai-note').textContent = !ai
      ? '导入家宽 SOCKS5 后自动启用'
      : home && mode === 'Direct'
        ? '当前由软路由处理'
        : ai.now === 'PROXY'
          ? 'Gemini · OpenAI · Claude（未选用家宽）'
          : 'Gemini · OpenAI · Claude · 独立出口';

    $('runtime-memory').textContent = `${((s.core?.rss_kb || 0) / 1024).toFixed(1)} MB`;
    $('runtime-connections').textContent = String(s.connections?.connections?.length || 0);

    const envName = home
      ? '家庭网络'
      : s.home?.interface?.startsWith('wlan')
        ? '外部 Wi-Fi'
        : '移动网络';
    const netTarget = s.home?.ssid || s.home?.gateway || s.home?.interface || '';
    $('network-title').textContent = netTarget ? `${envName} · ${netTarget}` : envName;
    $('network-sub').textContent = home ? '已匹配家庭网络联动规则' : '外出网络环境';
    const autoPill = $('auto-pill');
    autoPill.textContent = automatic ? '自动切换' : '手动';
    autoPill.className = `tonal-pill${automatic ? ' active' : ''}`;

    if (!state.dirtyHome) {
      $('automatic-switch').checked = automatic;
      $('home-gateway').value = s.preferences?.gateway || '';
      $('home-ssid').value = s.preferences?.ssid || '';
    }

    const current = {
      time: performance.now(),
      down: s.connections?.downloadTotal || 0,
      up: s.connections?.uploadTotal || 0,
      pid: s.core?.pid
    };
    if (state.previous && current.pid === state.previous.pid) {
      const seconds = (current.time - state.previous.time) / 1000;
      if (seconds > 0) {
        $('download-speed').textContent = speedText(Math.max(0, (current.down - state.previous.down) / seconds));
        $('upload-speed').textContent = speedText(Math.max(0, (current.up - state.previous.up) / seconds));
      }
    } else {
      $('download-speed').textContent = speedText(0);
      $('upload-speed').textContent = speedText(0);
    }
    state.previous = current;

    if (state.page === 'nodes') renderNodes();
    if (state.page === 'connections') renderConnections();
  }

  async function refresh({ quiet = false } = {}) {
    if (state.refreshing || !supported) return;
    state.refreshing = true;
    try {
      state.snapshot = JSON.parse(await bridge('snapshot'));
      $('error-banner').hidden = true;
      update();
    } catch (error) {
      $('error-banner').hidden = false;
      $('error-banner').textContent = `状态读取失败：${error.message}`;
      if (!quiet) report(error);
    } finally {
      state.refreshing = false;
    }
  }

  function schedule() {
    clearTimeout(state.timer);
    if (document.hidden || !supported) return;
    state.timer = setTimeout(async () => {
      await refresh({ quiet: true });
      schedule();
    }, 4000);
  }

  async function write(action) {
    if (state.writing) return;
    state.writing = true;
    const controls = document.querySelectorAll('[data-mode], #home-form button, #routing-form button, #sheet-content button');
    controls.forEach(el => { el.disabled = true; });
    try {
      await action();
      await refresh({ quiet: true });
    } catch (error) {
      report(error);
      const inline = $('operation-error') || (state.page === 'routing' ? $('routing-error') : null);
      if (inline) inline.textContent = error.message;
    } finally {
      state.writing = false;
      controls.forEach(el => { el.disabled = false; });
    }
  }

  function openSheet(title) {
    $('sheet-title').textContent = title;
    $('sheet-content').replaceChildren();
    if (!$('sheet').open) $('sheet').showModal();
    return $('sheet-content');
  }

  function sheetError(container) {
    const p = create('p', 'inline-error');
    p.id = 'operation-error';
    container.append(p);
  }

  function confirmAction(title, message, label, action, danger = false) {
    const root = openSheet(title);
    root.append(create('p', 'sheet-text', message));
    const row = create('div', 'sheet-actions');
    const cancel = create('button', 'm3-outline-btn', '取消');
    const proceed = create('button', danger ? 'm3-danger-btn' : 'm3-filled-btn', label);
    cancel.onclick = () => $('sheet').close();
    proceed.onclick = () => write(async () => {
      await action();
      $('sheet').close();
    });
    row.append(cancel, proceed);
    root.append(row);
    sheetError(root);
  }

  function renderNodes() {
    const group = groupData();
    const map = state.snapshot?.proxies?.proxies || {};
    const list = $('node-list');
    list.replaceChildren();

    document.querySelectorAll('[data-group]').forEach(el => el.classList.toggle('selected', el.dataset.group === state.group));
    $('sort-btn').classList.toggle('active', state.sort);
    $('sort-btn').textContent = state.sort ? '按延迟中' : '延迟排序';
    $('group-description').textContent = state.group === 'MICROSOFT'
      ? '微软分流组独立生效，建议仅添加美国出口节点。'
      : state.group === 'AI'
        ? 'AI 专线用于 Gemini / OpenAI / Claude，支持导入家宽 SOCKS5 经通用代理链式落地。'
        : '切换节点仅对当前策略组的新建连接生效。';

    let names = [...(group?.all || [])];
    if (state.sort) {
      names.sort((a, b) => (state.delays.get(a) ?? Infinity) - (state.delays.get(b) ?? Infinity));
    }
    $('node-count').textContent = `${names.length} 个节点`;

    if (!names.length) {
      list.append(create('div', 'empty-card', state.group === 'AI'
        ? '尚未配置 AI 专线，点击右上角「导入」添加家宽 SOCKS5 链接'
        : '暂无节点，点击右上角「导入」添加配置'));
      return;
    }

    names.forEach(name => {
      const selected = group.now === name;
      const isProxyRef = state.group === 'AI' && name === 'PROXY';
      const displayName = isProxyRef ? '跟随通用代理' : cleanName(name);
      const card = create('article', `node-card${selected ? ' selected' : ''}`);

      const top = create('div', 'node-card-top');
      top.append(create('span', 'region-tag', isProxyRef ? 'AUTO' : region(name)));

      const topRight = create('div', 'node-top-right');
      if (selected) {
        const badge = create('span', 'selected-dot');
        badge.innerHTML = icon('check');
        topRight.append(badge);
      }
      if (!isProxyRef) {
        const edit = create('button', 'node-edit');
        edit.innerHTML = icon('edit');
        edit.setAttribute('aria-label', `编辑 ${displayName}`);
        edit.onclick = () => editNode(name);
        topRight.append(edit);
      }
      top.append(topRight);

      const selectNode = () => write(async () => {
        await api('PUT', '/proxies/' + state.group, { name });
        notify('节点已切换');
      });

      const selectBtn = create('button', 'node-select');
      selectBtn.setAttribute('aria-label', `选择 ${name}`);
      selectBtn.setAttribute('aria-pressed', String(selected));
      selectBtn.append(create('span', 'node-name', displayName));
      selectBtn.onclick = event => {
        event.stopPropagation();
        selectNode();
      };

      card.onclick = event => {
        if (event.target.closest('button')) return;
        selectNode();
      };

      const foot = create('div', 'node-card-foot');
      foot.append(create('span', 'node-proto', isProxyRef ? '策略组回退' : (map[name]?.type || '代理')));

      const value = state.delays.get(name);
      let latencyClass = 'latency';
      let latencyText = '测速';
      const goodMs = state.group === 'AI' ? 800 : 150;
      const midMs = state.group === 'AI' ? 2200 : 350;
      if (value !== undefined) {
        if (Number.isFinite(value)) {
          latencyText = `${value} ms`;
          latencyClass += value < goodMs ? ' good' : value < midMs ? ' mid' : ' bad';
        } else {
          latencyText = '超时';
          latencyClass += ' bad';
        }
      }
      const latency = create('button', latencyClass, latencyText);
      latency.onclick = () => testNode(name);
      foot.append(latency);

      card.append(top, selectBtn, foot);
      list.append(card);
    });
  }

  async function testNode(name) {
    const timeout = state.group === 'AI' ? 8000 : 4000;
    try {
      const result = await api('GET', `/proxies/${encodeSegment(name)}/delay?timeout=${timeout}&url=http%3A%2F%2Fcp.cloudflare.com%2Fgenerate_204`);
      state.delays.set(name, Number(result.delay) || Infinity);
    } catch (_) {
      state.delays.set(name, Infinity);
    }
    renderNodes();
  }

  async function testAll() {
    const button = $('test-all');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '测速中…';
    const queue = [...(groupData()?.all || [])];
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) await testNode(queue.shift());
    }));
    button.disabled = false;
    button.textContent = '全部测速';
    notify('节点测速完成');
  }

  function renderConnections() {
    const source = state.snapshot?.connections || {};
    const query = $('connection-search').value.trim().toLowerCase();
    const all = source.connections || [];
    const connections = all.filter(c => [
      c.metadata?.host,
      c.metadata?.destinationIP,
      ...(c.chains || []),
      c.rule
    ].join(' ').toLowerCase().includes(query));

    $('connection-count').textContent = `${all.length} 条活跃`;
    $('download-total').textContent = bytes(source.downloadTotal);
    $('upload-total').textContent = bytes(source.uploadTotal);

    const list = $('connection-list');
    list.replaceChildren();
    if (!connections.length) {
      list.append(create('div', 'empty-state', query ? '没有匹配的连接' : '当前没有活跃连接'));
      return;
    }

    connections.slice(0, 150).forEach(c => {
      const row = create('div', 'connection-row');
      const copy = create('div', 'connection-copy');
      const host = c.metadata?.host || c.metadata?.destinationIP || '未知目标';
      copy.append(
        create('strong', '', host),
        create('p', '', `${(c.metadata?.network || 'tcp').toUpperCase()} · ${(c.chains || ['direct']).join(' → ')} · ↓ ${bytes(c.download)} · ↑ ${bytes(c.upload)}`)
      );
      const close = create('button', 'connection-close');
      close.innerHTML = icon('close');
      close.setAttribute('aria-label', `关闭 ${host} 的连接`);
      close.onclick = () => write(async () => {
        await api('DELETE', `/connections/${encodeSegment(c.id)}`);
        notify('连接已关闭');
      });
      row.append(copy, close);
      list.append(row);
    });
  }

  async function loadConfig() {
    state.config = JSON.parse(await bridge('config-get'));
    return state.config;
  }

  function normalizeConfig(config) {
    const result = structuredClone(config);
    result.experimental ||= {};
    result.experimental.clash_api ||= {};
    Object.assign(result.experimental.clash_api, { external_controller: '127.0.0.1:9090' });
    delete result.experimental.clash_api.external_ui;
    delete result.experimental.clash_api.external_ui_download_url;

    if (result.dns?.servers?.some(server => server.type === 'fakeip')) {
      result.experimental.cache_file ||= {};
      Object.assign(result.experimental.cache_file, { enabled: true, store_fakeip: true });
    }

    if (result.dns?.servers?.some(server => server.tag === 'dns-direct')) {
      const directRule = result.route?.rules?.find(managedDirectRule);
      if (directRule) {
        const domains = Array.isArray(directRule.domain_suffix) ? [...directRule.domain_suffix] : [directRule.domain_suffix];
        result.dns.rules ||= [];
        const index = result.dns.rules.findIndex(rule => {
          const suffixes = Array.isArray(rule.domain_suffix) ? rule.domain_suffix : [rule.domain_suffix];
          return rule.server === 'dns-direct'
            && Object.keys(rule).every(key => ['domain_suffix', 'server', 'action'].includes(key))
            && suffixes.includes('pushplus.plus');
        });
        const rule = { domain_suffix: domains, server: 'dns-direct' };
        if (index >= 0) result.dns.rules[index] = rule;
        else result.dns.rules.unshift(rule);
      }
    }
    return result;
  }

  async function saveConfig(config) {
    await bridge('config-save', base64(JSON.stringify(normalizeConfig(config), null, 2)));
    state.config = config;
    notify('配置已校验并应用');
  }

  function managedDirectRule(rule) {
    const domains = Array.isArray(rule?.domain_suffix) ? rule.domain_suffix : rule?.domain_suffix ? [rule.domain_suffix] : [];
    return rule?.outbound === 'direct' && domains.some(domain => String(domain).replace(/^\+\./, '').toLowerCase() === 'pushplus.plus');
  }

  async function loadDirectDomains() {
    const config = await loadConfig();
    const rules = config.route?.rules || [];
    const rule = rules.find(managedDirectRule);
    const ruleDomains = Array.isArray(rule?.domain_suffix) ? rule.domain_suffix : rule?.domain_suffix ? [rule.domain_suffix] : [];
    state.directDomains = [...new Set([...ruleDomains, 'pushplus.plus'].map(domain => String(domain).replace(/^\+\./, '').toLowerCase()))];
    renderDirectDomains();
  }

  function renderDirectDomains() {
    const input = $('direct-domains');
    if (input && document.activeElement !== input) input.value = state.directDomains.join('\n');
  }

  async function saveDirectDomains() {
    const inline = $('routing-error');
    inline.textContent = '';
    const domains = [...new Set(
      $('direct-domains').value
        .split(/\r?\n/)
        .map(value => value.trim().toLowerCase().replace(/^\+\./, ''))
        .filter(Boolean)
    )];
    if (!domains.includes('pushplus.plus')) domains.unshift('pushplus.plus');
    for (const domain of domains) {
      if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
        throw new Error(`域名格式无效：${domain}`);
      }
    }
    const config = await loadConfig();
    config.route ||= {};
    config.route.rules ||= [];
    const index = config.route.rules.findIndex(managedDirectRule);
    const rule = { domain_suffix: domains, outbound: 'direct' };
    if (index >= 0) {
      config.route.rules[index] = rule;
    } else {
      const privateIndex = config.route.rules.findIndex(item => item.ip_is_private === true);
      config.route.rules.splice(privateIndex >= 0 ? privateIndex + 1 : 0, 0, rule);
    }
    await saveConfig(config);
    state.directDomains = domains;
    renderDirectDomains();
    notify('直连域名已保存');
  }

  function field(root, label, value, options = {}) {
    const id = `field-${sequence++}`;
    const wrapper = create('label', `field-label${options.first ? ' first' : ''}`, label);
    wrapper.htmlFor = id;
    const input = create(options.multiline ? 'textarea' : 'input', options.multiline ? 'm3-field code-editor' : 'm3-field');
    input.id = id;
    input.value = value || '';
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.type) input.type = options.type;
    root.append(wrapper, input);
    return input;
  }

  const AI_DOMAINS = [
    'gemini.google.com', 'generativelanguage.googleapis.com', 'aistudio.google.com',
    'makersuite.google.com', 'robinfrontend-pa.googleapis.com', 'proactivebackend-pa.googleapis.com',
    'geller-pa.googleapis.com', 'alkalimakersuite-pa.clients6.google.com', 'aisandbox-pa.googleapis.com',
    'notebooklm.google.com', 'notebooklm.google', 'deepmind.com', 'deepmind.google',
    'labs.google', 'bard.google.com', 'openai.com', 'chatgpt.com', 'oaistatic.com',
    'oaiusercontent.com', 'sora.com', 'anthropic.com', 'claude.ai', 'claude.com',
    'claudeusercontent.com', 'perplexity.ai', 'x.ai', 'grok.com', 'cursor.com', 'cursor.sh'
  ];

  const hasRuleSet = (rule, tag) => Array.isArray(rule?.rule_set)
    ? rule.rule_set.includes(tag)
    : rule?.rule_set === tag;

  function ensureAiRouting(config) {
    config.outbounds ||= [];
    let aiGroup = config.outbounds.find(o => o.tag === 'AI');
    if (!aiGroup) {
      aiGroup = { type: 'selector', tag: 'AI', outbounds: ['PROXY'], default: 'PROXY' };
      const msIndex = config.outbounds.findIndex(o => o.tag === 'MICROSOFT');
      const proxyIndex = config.outbounds.findIndex(o => o.tag === 'PROXY');
      const insertAt = msIndex >= 0 ? msIndex + 1 : proxyIndex >= 0 ? proxyIndex + 1 : 0;
      config.outbounds.splice(insertAt, 0, aiGroup);
    } else {
      aiGroup.outbounds ||= [];
      if (!aiGroup.outbounds.includes('PROXY')) aiGroup.outbounds.push('PROXY');
    }

    config.route ||= {};
    config.route.rule_set ||= [];
    if (!config.route.rule_set.some(rs => rs.tag === 'geosite-category-ai-!cn')) {
      const hasProxyHttp = Array.isArray(config.http_clients) && config.http_clients.some(c => c.tag === 'proxy-http');
      const rs = {
        tag: 'geosite-category-ai-!cn',
        type: 'remote',
        format: 'binary',
        url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ai-!cn.srs'
      };
      if (hasProxyHttp) rs.http_client = 'proxy-http';
      config.route.rule_set.push(rs);
    }

    config.route.rules ||= [];
    if (!config.route.rules.some(r => r.outbound === 'AI')) {
      const cnIdx = config.route.rules.findIndex(r => hasRuleSet(r, 'geoip-cn') || hasRuleSet(r, 'geosite-cn'));
      const aiRules = [
        { network: 'udp', port: 443, rule_set: ['geosite-category-ai-!cn'], action: 'reject' },
        { network: 'udp', port: 443, domain_suffix: [...AI_DOMAINS], action: 'reject' },
        { ip_version: 6, rule_set: ['geosite-category-ai-!cn'], action: 'reject' },
        { ip_version: 6, domain_suffix: [...AI_DOMAINS], action: 'reject' },
        { rule_set: ['geosite-category-ai-!cn'], outbound: 'AI' },
        { domain_suffix: [...AI_DOMAINS], outbound: 'AI' }
      ];
      config.route.rules.splice(cnIdx >= 0 ? cnIdx : config.route.rules.length, 0, ...aiRules);
    } else if (!config.route.rules.some(r => r.ip_version === 6 && r.action === 'reject' && hasRuleSet(r, 'geosite-category-ai-!cn'))) {
      const aiIdx = config.route.rules.findIndex(r => r.outbound === 'AI');
      const v6RejectRules = [
        { ip_version: 6, rule_set: ['geosite-category-ai-!cn'], action: 'reject' },
        { ip_version: 6, domain_suffix: [...AI_DOMAINS], action: 'reject' }
      ];
      config.route.rules.splice(aiIdx >= 0 ? aiIdx : config.route.rules.length, 0, ...v6RejectRules);
    }

    if (config.dns?.servers?.some(s => s.type === 'fakeip')) {
      config.dns.rules ||= [];
      if (!config.dns.rules.some(r => hasRuleSet(r, 'geosite-category-ai-!cn'))) {
        const cnDnsIdx = config.dns.rules.findIndex(r => hasRuleSet(r, 'geosite-cn'));
        const aiDnsRules = [
          { rule_set: ['geosite-category-ai-!cn'], server: 'dns-fakeip' },
          { domain_suffix: [...AI_DOMAINS], server: 'dns-fakeip' }
        ];
        config.dns.rules.splice(cnDnsIdx >= 0 ? cnDnsIdx : config.dns.rules.length, 0, ...aiDnsRules);
      }
    }
    return aiGroup;
  }

  function parseUserInfo(rawText, link) {
    const match = rawText.trim().match(/^[a-z0-9+.-]+:\/\/([^@/?#]+)@/i);
    if (!match) return null;
    const rawUserInfo = match[1];
    if (rawUserInfo.includes(':')) {
      return {
        username: decodeURIComponent(link.username),
        password: decodeURIComponent(link.password)
      };
    }
    // Support Shadowrocket-style base64(user:pass) socks links when no ':' is present.
    try {
      const decoded = atob(rawUserInfo.replace(/-/g, '+').replace(/_/g, '/'));
      const colon = decoded.indexOf(':');
      if (colon > 0 && /^[\x20-\x7e]+$/.test(decoded)) {
        return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
      }
    } catch (_) {}
    return { username: decodeURIComponent(link.username), password: '' };
  }

  function parseLink(text) {
    const trimmed = text.trim();
    const link = new URL(trimmed);
    const type = link.protocol.slice(0, -1).toLowerCase();
    const params = link.searchParams;
    const tag = decodeURIComponent(link.hash.slice(1)) || `${link.hostname} ${type.toUpperCase()}`;
    const common = { tag, server: link.hostname.replace(/^\[|\]$/g, ''), server_port: Number(link.port) || 443 };

    if (type === 'vless') {
      const node = { ...common, type: 'vless', uuid: decodeURIComponent(link.username) };
      if (params.get('flow')) node.flow = params.get('flow');
      const security = params.get('security');
      if (security === 'tls' || security === 'reality') {
        node.tls = { enabled: true, server_name: params.get('sni') || params.get('servername') || common.server };
        if (params.get('fp')) node.tls.utls = { enabled: true, fingerprint: params.get('fp') };
        if (security === 'reality') {
          node.tls.reality = { enabled: true, public_key: params.get('pbk') || '', short_id: params.get('sid') || '' };
        }
      }
      const transport = params.get('type');
      if (transport && transport !== 'tcp') {
        if (!['ws', 'grpc', 'http'].includes(transport)) throw new Error('该传输方式请使用 JSON 导入');
        node.transport = { type: transport };
        if (params.get('path')) node.transport.path = params.get('path');
        if (params.get('host')) node.transport.headers = { Host: params.get('host') };
        if (transport === 'grpc') node.transport.service_name = params.get('serviceName') || '';
      }
      return node;
    }

    if (['hysteria2', 'hy2', 'trojan'].includes(type)) {
      const node = {
        ...common,
        type: type === 'hy2' ? 'hysteria2' : type,
        password: decodeURIComponent(link.username + (link.password ? ':' + link.password : '')),
        tls: { enabled: true, server_name: params.get('sni') || common.server }
      };
      if (params.get('insecure') === '1' || params.get('allowInsecure') === '1') node.tls.insecure = true;
      if (params.get('obfs') === 'salamander') {
        node.obfs = { type: 'salamander', password: params.get('obfs-password') || '' };
      }
      return node;
    }

    if (type === 'ss') {
      let auth = decodeURIComponent(link.username);
      if (!auth.includes(':')) auth = atob(auth.replace(/-/g, '+').replace(/_/g, '/'));
      const colon = auth.indexOf(':');
      if (colon < 0) throw new Error('Shadowsocks 链接缺少加密方法');
      if (params.has('plugin')) throw new Error('带插件的 Shadowsocks 节点请使用 JSON 导入');
      return {
        ...common,
        type: 'shadowsocks',
        method: auth.slice(0, colon),
        password: auth.slice(colon + 1),
        server_port: Number(link.port) || 8388
      };
    }

    if (['socks', 'socks5', 'socks5h'].includes(type)) {
      const auth = parseUserInfo(trimmed, link);
      const node = {
        ...common,
        type: 'socks',
        version: '5',
        server_port: Number(link.port) || 1080
      };
      if (auth) {
        node.username = auth.username;
        node.password = auth.password;
      }
      return node;
    }

    if (type === 'http' || type === 'https') {
      const auth = parseUserInfo(trimmed, link);
      const node = {
        ...common,
        type: 'http',
        server_port: Number(link.port) || (type === 'https' ? 443 : 8080)
      };
      if (auth) {
        node.username = auth.username;
        node.password = auth.password;
      }
      if (type === 'https') {
        node.tls = { enabled: true, server_name: params.get('sni') || common.server };
      }
      return node;
    }

    throw new Error('支持 VLESS、Hysteria 2、Trojan、Shadowsocks、SOCKS5、HTTP，或 sing-box 节点 JSON');
  }

  function importNodes() {
    const root = openSheet('导入节点');
    root.append(create('p', 'sheet-text', '粘贴分享链接（每行一条，支持 VLESS / Hysteria2 / SOCKS5 家宽等）或 sing-box 节点 JSON。'));
    const input = field(root, '链接或 JSON', '', { multiline: true, placeholder: 'vless://…\nsocks://token:@host:7129#US-家宽' });
    input.classList.remove('code-editor');
    input.classList.add('mono-field');

    const aiLabel = create('label', 'checkbox-row');
    const aiCheck = create('input');
    aiCheck.type = 'checkbox';
    aiCheck.id = 'import-ai';
    aiCheck.checked = state.group === 'AI';
    aiLabel.append(aiCheck, document.createTextNode('加入 AI 专线（Gemini / OpenAI / Claude）'));
    root.append(aiLabel);

    const chainLabel = create('label', 'checkbox-row');
    const chainCheck = create('input');
    chainCheck.type = 'checkbox';
    chainCheck.id = 'import-chain';
    chainCheck.checked = state.group === 'AI';
    chainLabel.append(chainCheck, document.createTextNode('经由通用代理中转（家宽落地推荐）'));
    root.append(chainLabel);

    const msLabel = create('label', 'checkbox-row');
    const msCheck = create('input');
    msCheck.type = 'checkbox';
    msCheck.id = 'import-ms';
    msLabel.append(msCheck, document.createTextNode('同时加入微软分流组（仅限美国出口）'));
    root.append(msLabel);

    let manualToggled = false;
    [aiCheck, chainCheck].forEach(el => el.addEventListener('change', () => { manualToggled = true; }));
    input.addEventListener('input', () => {
      if (manualToggled) return;
      const isResidentialLink = /^\s*(?:socks5?h?|https?):\/\//im.test(input.value);
      if (isResidentialLink) {
        aiCheck.checked = true;
        chainCheck.checked = true;
      }
    });

    const submit = create('button', 'm3-filled-btn full-width', '校验并导入');
    root.append(submit);
    sheetError(root);

    submit.onclick = () => write(async () => {
      if (!input.value.trim()) throw new Error('请先粘贴链接或 JSON');
      const raw = input.value.trim();
      let nodes;
      if (raw.startsWith('{') || raw.startsWith('[')) {
        const obj = JSON.parse(raw);
        nodes = Array.isArray(obj) ? obj : obj.outbounds || [obj];
      } else {
        nodes = raw.split(/\r?\n/).filter(l => l.trim()).map(parseLink);
      }

      const config = await loadConfig();
      const allowed = new Set(['vless', 'hysteria2', 'trojan', 'shadowsocks', 'vmess', 'tuic', 'socks', 'http', 'anytls']);
      const aiGroup = aiCheck.checked ? ensureAiRouting(config) : null;

      for (const node of nodes) {
        if (!allowed.has(node.type) || !node.tag || !node.server) {
          throw new Error('每个节点需要有效的 type、tag 和 server');
        }
        if (config.outbounds.some(o => o.tag === node.tag)) {
          throw new Error(`节点名称已存在：${node.tag}`);
        }
        if (chainCheck.checked && !node.detour) {
          node.detour = 'PROXY';
        }
        config.outbounds.push(node);

        // Chained nodes using detour:"PROXY" must never be placed inside PROXY (would create a cycle).
        const addToProxy = node.detour !== 'PROXY';
        if (addToProxy) {
          const proxyGroup = config.outbounds.find(o => o.tag === 'PROXY');
          if (proxyGroup) {
            proxyGroup.outbounds ||= [];
            proxyGroup.outbounds.push(node.tag);
            proxyGroup.default ||= node.tag;
          }
        }
        if (aiGroup) {
          aiGroup.outbounds ||= [];
          aiGroup.outbounds = [node.tag, ...aiGroup.outbounds.filter(t => t !== node.tag)];
          aiGroup.default = node.tag;
        }
        if (msCheck.checked) {
          const msGroup = config.outbounds.find(o => o.tag === 'MICROSOFT');
          if (msGroup) {
            msGroup.outbounds ||= [];
            msGroup.outbounds.push(node.tag);
            msGroup.default ||= node.tag;
          }
        }
      }
      await saveConfig(config);
      $('sheet').close();
    });
  }

  async function editNode(name) {
    try {
      const config = await loadConfig();
      const node = config.outbounds.find(o => o.tag === name);
      if (!node) throw new Error('配置中未找到此节点');

      const root = openSheet(`编辑 · ${cleanName(name)}`);
      const input = field(root, 'sing-box 节点 JSON', JSON.stringify(node, null, 2), { multiline: true, first: true });
      root.append(create('p', 'note', '保存前由 sing-box 校验，认证信息仅留在本机。'));

      const actions = create('div', 'sheet-actions');
      const remove = create('button', 'm3-danger-btn', '删除节点');
      const save = create('button', 'm3-filled-btn', '校验并保存');
      actions.append(remove, save);
      root.append(actions);
      sheetError(root);

      save.onclick = () => write(async () => {
        const updated = JSON.parse(input.value);
        if (!updated.tag || !updated.type || !updated.server) throw new Error('节点缺少必要字段');
        const latest = await loadConfig();
        if (updated.tag !== name && latest.outbounds.some(o => o.tag === updated.tag)) {
          throw new Error('节点名称已存在');
        }
        latest.outbounds = latest.outbounds.map(o => {
          if (o.tag === name) return updated;
          if (Array.isArray(o.outbounds)) o.outbounds = o.outbounds.map(t => (t === name ? updated.tag : t));
          if (o.default === name) o.default = updated.tag;
          return o;
        });
        await saveConfig(latest);
        $('sheet').close();
      });

      remove.onclick = () => confirmAction(
        '删除节点',
        `将从所有策略组中移除「${cleanName(name)}」。`,
        '确认删除',
        async () => {
          const latest = await loadConfig();
          for (const group of latest.outbounds.filter(o => Array.isArray(o.outbounds) && o.outbounds.includes(name))) {
            if (group.outbounds.length < 2) throw new Error(`这是 ${group.tag} 的最后一个节点，请先添加替代节点`);
            group.outbounds = group.outbounds.filter(t => t !== name);
            if (group.default === name) group.default = group.outbounds[0];
          }
          latest.outbounds = latest.outbounds.filter(o => o.tag !== name);
          await saveConfig(latest);
        },
        true
      );
    } catch (error) {
      report(error);
    }
  }

  async function advanced() {
    try {
      const config = await loadConfig();
      const root = openSheet('完整配置（JSON）');
      root.append(create('p', 'sheet-text', '保存会短暂重启核心；仅接受通过校验的配置，启动失败自动恢复上一份。'));
      const input = field(root, 'config.json', JSON.stringify(config, null, 2), { multiline: true });
      const button = create('button', 'm3-filled-btn full-width', '校验并应用');
      root.append(button);
      sheetError(root);
      button.onclick = () => write(async () => {
        await saveConfig(JSON.parse(input.value));
        $('sheet').close();
      });
    } catch (error) {
      report(error);
    }
  }

  async function showLogs() {
    const root = openSheet('运行日志（最近 80 行）');
    const pre = create('pre', 'log-output', '正在读取…');
    root.append(pre);
    try {
      pre.textContent = await bridge('logs') || '暂时没有日志';
    } catch (error) {
      pre.textContent = error.message;
    }
  }

  function applyTheme(preference) {
    localStorage.setItem('singbox-theme', preference);
    const resolved = preference === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : preference;
    document.documentElement.dataset.theme = resolved;
    document.querySelectorAll('[data-theme]').forEach(el => el.classList.toggle('selected', el.dataset.theme === preference));
    document.querySelector('meta[name="theme-color"]').content = resolved === 'dark' ? '#111318' : '#f4f6fa';
  }

  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]');
    if (tab) {
      navigate(tab.dataset.tab);
      return;
    }
    const group = event.target.closest('[data-group]');
    if (group) {
      state.group = group.dataset.group;
      renderNodes();
      return;
    }
    const theme = event.target.closest('button[data-theme]');
    if (theme) {
      applyTheme(theme.dataset.theme);
      return;
    }
    const mode = event.target.closest('[data-mode]');
    if (mode) {
      const change = async () => {
        await bridge('mode', mode.dataset.mode);
        notify('已切换为手动模式');
      };
      if (state.snapshot?.preferences?.automatic) {
        confirmAction('切换为手动模式', '自动切换将暂停，之后可在设置中重新开启。', '切换模式', change);
      } else {
        write(change);
      }
      return;
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'refresh') {
      refresh();
      schedule();
    } else if (action === 'microsoft') {
      state.group = 'MICROSOFT';
      navigate('nodes');
    } else if (action === 'ai') {
      state.group = 'AI';
      navigate('nodes');
    } else if (action === 'import') {
      importNodes();
    } else if (action === 'sort') {
      state.sort = !state.sort;
      renderNodes();
    } else if (action === 'test-all') {
      testAll();
    } else if (action === 'restart') {
      confirmAction('重启 sing-box', '由手机转发的连接会短暂中断，当前配置和节点选择将保留。', '重启核心', async () => {
        await bridge('restart');
        notify('核心已重新就绪');
      });
    } else if (action === 'logs') {
      showLogs();
    } else if (action === 'advanced') {
      advanced();
    }
  });

  $('connection-search').addEventListener('input', renderConnections);
  $('home-form').addEventListener('input', () => { state.dirtyHome = true; });
  $('routing-form').addEventListener('submit', event => {
    event.preventDefault();
    write(saveDirectDomains);
  });
  $('home-form').addEventListener('submit', event => {
    event.preventDefault();
    write(async () => {
      const gateway = $('home-gateway').value.trim();
      const ssid = $('home-ssid').value;
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(gateway) || gateway.split('.').some(v => +v > 255)) {
        throw new Error('请输入有效的 IPv4 网关地址');
      }
      if (new TextEncoder().encode(ssid).length > 32) {
        throw new Error('Wi-Fi 名称不能超过 32 字节');
      }
      await bridge('home-save', $('automatic-switch').checked ? '1' : '0', gateway, base64(ssid));
      state.dirtyHome = false;
      notify('家庭联动设置已保存');
    });
  });

  document.addEventListener('visibilitychange', () => {
    clearTimeout(state.timer);
    if (!document.hidden) {
      refresh({ quiet: true });
      schedule();
    }
  });
  window.addEventListener('pagehide', () => clearTimeout(state.timer));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('singbox-theme') === 'system') applyTheme('system');
  });

  applyTheme(localStorage.getItem('singbox-theme') || 'system');

  if (!supported) {
    $('bridge-warning').hidden = false;
    $('core-status-title').textContent = '等待 KernelSU';
    $('core-status-meta').textContent = '请在 KernelSU 模块页打开';
  } else {
    refresh();
    bridge('api', 'GET', '/version').then(value => {
      state.version = JSON.parse(value).version || 'sing-box';
      update();
    }).catch(() => {});
    schedule();
  }
})();
