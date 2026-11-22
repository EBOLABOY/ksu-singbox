# sing-box for KernelSU

> 专为已获取 **KernelSU Root** 的 Android 手机打造的 **sing-box 透明代理（TPROXY）模块**，内置 Material 3 原生风格配置面板。  
> 无需安装额外代理 App、不占用系统 VPN 通道；在 KernelSU 管理器内即可完成节点导入、测速、AI 家宽分流与家庭软路由联动。

[简体中文](README_zh.md) | [English](README_en.md) | [更新日志](changelog.md)

---

## 核心特性

- **开箱即用的双栈透明代理（IPv4 + IPv6）**：基于内核 TPROXY 接管全局流量，支持原子化 `iptables-restore` 规则写入、TCP `DIVERT` 加速、防 IPv6 环回自激及动态地址/前缀自动同步。
- **支持移动热点共享代理**：针对常见热点/USB/蓝牙共享接口（`wlan1~3`、`softap+`、`swlan+`、`rndis+`、`usb+`、`bt-pan` 等）做了专门的入向劫持与出向豁免，开启热点后其他设备访问**国内与海外网站均正常**。
- **KernelSU 内嵌 Material 3 面板**：直接在 KernelSU 模块卡片打开，零外部 CDN/字体依赖；Clash API 仅监听本机 `127.0.0.1:9090` 并启用随机 Bearer 密钥，不向局域网暴露任何管理端口。
- **三组独立策略分流**：
  - **通用代理（`PROXY`）**：日常海外网站与 App。
  - **AI 专线（`AI`）**：专用于 Gemini / OpenAI / Claude 等 AI 应用，支持一键导入 **家宽 SOCKS5 / HTTP 链接**并自动经通用代理**链式落地**（含 IPv6 瞬时回退 IPv4 与 UDP/443 QUIC 拒连优化）。
  - **微软分流（`MICROSOFT`）**：Bing / Copilot / Rewards / Microsoft 365 独立美国出口。
- **家庭软路由自动联动**：连入家庭 Wi-Fi 时自动切为 `Direct`（流量交给家庭软路由统一分流），外出切移动网络时自动恢复 `Rule` 规则分流。
- **低功耗与防后台冻结**：核心与守护进程自动脱离 Android App Freezer 与高 Swap 内存组（`4:memory:/`、`0::/`），状态无变化时不写闪存，并内置日志自动轮转。

---

## 一、安装前准备（新手必看）

在开始前，请先确认你的手机满足以下 4 项条件：

| 检查项 | 要求说明 |
| :--- | :--- |
| **Root 方案** | 已安装 **KernelSU 管理器**（要求 `versionCode >= 10683`，支持模块 WebUI） |
| **设备与内核** | Android **arm64** 架构，内核支持 `TPROXY`（近年的 GKI / KernelSU 内核普遍支持） |
| **节点信息** | 自备至少一条可用代理节点链接（支持 `vless://`、`hysteria2://`、`hy2://`、`trojan://`、`ss://`、`socks://`、`socks5://`、`http://` 或 sing-box 节点 JSON） |
| **避免冲突** | 安装前请先**关闭并停用**其他 VPN 客户端（如 Clash / V2RayNG / NekoBox）以及其他透明代理模块（如旧版 ClashForMagisk） |

> [!IMPORTANT]
> 本仓库与刷机包内**不包含任何真实可用节点**，默认配置里只有示例占位节点（`*.example.com`）。安装完成后需要按下方步骤导入你自己的节点。

---

## 二、小白 3 步快速上手

### 第 1 步：获取刷机包 `ksu-singbox.zip`

- **方式 A（直接下载）**：前往本仓库的 [Releases](../../releases) 页面下载最新版本的 `ksu-singbox.zip`。
- **方式 B（自行打包，电脑 / Linux / Termux 均可）**：
  ```sh
  git clone https://github.com/EBOLABOY/ksu-singbox.git
  cd ksu-singbox
  python3 build.sh
  ```
  运行完成后会在仓库根目录生成 `ksu-singbox.zip`。

### 第 2 步：在 KernelSU 中刷入模块并重启

1. 将 `ksu-singbox.zip` 复制到手机内部存储（如 `Download` 目录）。
2. 打开手机上的 **KernelSU 管理器** → 点击底部 **「模块」** → 点击 **「安装」** → 选择 `ksu-singbox.zip`。
3. 等待终端日志打印 **`- 完成。请在模块卡片中打开配置面板`**，然后点击 **重启手机**。
4. 重启并解锁锁屏后，等待约 **5 ~ 10 秒**，模块会自动完成内核启动与透明代理规则加载。

> [!TIP]
> **老用户覆盖升级说明**：本模块 ID 为 `box4`。如果你此前已安装过旧版 `box4KernelSU` 或本模块早期版本，**直接覆盖刷入即可，无需先卸载**：
> - 自动保留 `/data/adb/box/` 下你现有的个人节点、应用豁免名单（`box.config`）和家庭联动设置。
> - 自动在 `/data/adb/box/backups/` 创建时间戳备份。
> - 若你曾手动更新过更高版本的 `sing-box` 二进制，升级脚本会对比版本号，**不会降级你的内核**。

### 第 3 步：打开配置面板，导入你的真实节点

1. 打开 **KernelSU 管理器** → 底部 **「模块」** → 找到 **`sing-box for KernelSU`** 模块卡片 → 点击卡片上的 **WebUI / 打开** 图标进入面板。
2. 在 **「总览」** 页确认顶部状态卡片显示 **`工作中`**（如果显示 `已停止`，请点击底部「设置 → 重启 sing-box 核心」）。
3. 点击底部 **「节点」** → 点击右上角蓝色 **`+ 导入`** 按钮。
4. 在文本框中粘贴你的节点分享链接（支持一次粘贴多条，每行一条），点击 **`校验并导入`**。
   - 面板会先调用 `sing-box check` 校验配置合法性，校验通过才会写入并重启核心；若配置有误会直接提示具体错误，**不会破坏原配置**。
5. 导入完成后，在 **「通用代理」** 列表中点击你刚导入的节点即可切换使用，再点击 **`全部测速`** 确认节点有延迟返回。
6. （可选）点击自带的 `[示例]` 占位节点右上角的 **编辑（铅笔图标）→ 删除节点**，清理占位模板即可（注意：每个策略组至少需保留 1 个节点）。

到这里，你的手机就已经完成全局透明代理配置了！

---

## 三、常用功能使用指南

### 1. 总览页：三种出站模式怎么选？

在 **「总览」** 页可以直接切换出站模式：

| 模式 | 流量走向 | 适用场景 |
| :--- | :--- | :--- |
| **规则分流（Rule）** | 国内网站/IP 直连，AI 走 AI 专线，微软走微软分流，其余海外流量走通用代理 | **日常外出推荐（默认）** |
| **全局代理（Global）** | 除局域网私有地址外，所有流量统一经「通用代理」出口转发 | 排查个别网站分流问题时临时使用 |
| **直连模式（Direct）** | 全部流量直连，核心保持运行待命 | 回家交给家庭软路由统一分流，或临时关闭代理 |

> [!NOTE]
> 选择「直连模式」不等于停止核心；如果你开启了「家庭自动切换」，手动切换模式时会弹出确认提示并暂停自动切换，后续可随时在「设置」页重新开启。

---

### 2. AI 专线与家宽 SOCKS5 链式落地（Gemini / OpenAI / Claude）

很多 AI 服务对机房 IP 风控较严，本模块原生支持导入 **住宅家宽 SOCKS5 / HTTP 链接**，并自动配置为 **「手机 → 加密中转节点（`PROXY`）→ 家宽落地 → AI 服务」** 的链式架构：

1. 在面板点击底部 **「节点」** → 右上角 **`+ 导入`**。
2. 粘贴你的家宽链接（支持 `socks://`、`socks5://`、`socks5h://`、`http://`、`https://`，兼容 `token:@host:port#名称`、`user:pass@host:port#名称` 和 Shadowrocket Base64 格式），例如：
   ```text
   socks://你的认证Token:@res.example.com:7129#US-Los-Angeles-Residential
   ```
3. 粘贴家宽链接后，界面会**自动帮你勾选**以下两项（也可按需手动调整）：
   - **加入 AI 专线（Gemini / OpenAI / Claude）**：自动建立/补全 `AI` 策略组、官方 `geosite-category-ai-!cn` 规则集与主流 AI App 域名规则，并将新家宽设为默认出口。
   - **经由通用代理中转（家宽落地推荐）**：为该家宽节点自动写入 `"detour": "PROXY"`。因为国内直连明文 SOCKS5 通常会被阻断或严重丢包，通过已有加密节点链式中转最稳定；同时面板会自动避免把链式节点放进 `PROXY` 组，彻底防止路由死循环。
4. 点击 **`校验并导入`** 即可生效。

> [!TIP]
> - 以后更换新的家宽地址时，只需重复上述导入步骤即可一键接管 `AI` 专线。
> - 如果家宽临时到期或维护，进入 **「节点 → AI 专线」** 点击 **`跟随通用代理`** 即可瞬间回退到普通代理节点，不影响继续使用 AI。
> - 链式家宽多了一跳住宅中转，测速显示 `800 ~ 2000 ms` 属于正常现象（AI 组测速超时已放宽至 `8000 ms`），不影响对话流式输出与纯净家宽出口识别。

---

### 3. 微软分流（Bing / Copilot / Rewards / M365）

- 在导入美国节点时勾选 **「同时加入微软分流组（仅限美国出口）」**，即可让微软系服务固定走美国节点，与日常使用的香港/新加坡通用代理互不干扰。
- 界面不会自动检测节点物理归属地，加入此组前请自行确认节点确实为美国出口。

---

### 4. 自定义直连域名（「分流」页）

如果某些国内网站、私有服务或推送域名被误分流到了代理：

1. 点击底部 **「分流」**。
2. 在文本框中每行填写一个域名后缀（例如 `example.com`，会自动匹配 `example.com` 及所有 `*.example.com` 子域名）。
3. 点击 **`保存并应用`**，面板会同步更新 DNS 与路由规则并校验重启核心。

---

### 5. 家庭网络自动切换（「设置」页）

如果你家里部署了旁路由 / 软路由（如 OpenWrt / iStoreOS），希望**回家用软路由、出门用手机代理**：

1. 点击底部 **「设置」** → **「家庭网络联动」**。
2. 填写 **家庭网关 IPv4**（例如 `192.168.1.1`，即你家路由器的局域网 IP）和 **家庭 Wi-Fi 名称**（可选，用于辅助识别）。
3. 打开 **「自动切换模式」** 开关 → 点击 **`保存联动设置`**。
4. 之后连入家庭 Wi-Fi 约 **15 秒内**会自动切换为 `Direct`（交给软路由统一分流），离开家切回 4G/5G 时自动切回 `Rule`。

---

### 6. 手机开热点共享给电脑 / 其他设备

无需额外配置，直接打开手机移动热点即可：
- 透明代理规则已精确覆盖 `wlan1`、`wlan2`、`wlan3`、`softap+`、`swlan+`、`ap+`、`rndis+`、`ncm+`、`usb+`、`bt-pan` 等热点与共享网卡（同时避开手机自身的 Wi-Fi 上行网卡 `wlan0`）。
- 已处理内核出向回包豁免与 IPv6 `accept_ra=2` 保持，连入热点的设备可同时顺畅访问**国内网站（IPv4/IPv6）**与**海外网站**。

---

## 四、进阶配置与日常维护（按需查看）

### 1. 修改免代理 App 名单（分应用黑名单 / 白名单）

模块默认采用 `blacklist`（黑名单直连）模式，已在 `/data/adb/box/scripts/box.config` 的 `user_packages_list` 中预置了常见微信、QQ、支付宝、淘宝、京东、拼多多、抖音、B 站、银行、游戏及智能家居等国内 App 绕过透明代理（降低延迟和耗电）。

如需增删应用：
1. 用 Root 文件管理器或终端编辑 `/data/adb/box/scripts/box.config` 中的 `user_packages_list`（格式为 `"0:应用包名"`，双开应用用户 ID 为 `999` 等）。
2. 执行以下命令重载规则（无需重启手机）：
   ```sh
   su -c '/data/adb/box/scripts/box.tproxy renew'
   ```

### 2. 临时停用与彻底卸载

- **临时停用**：打开 KernelSU 管理器 → 模块 → 直接关闭 `sing-box for KernelSU` 的开关。后台 `inotifyd` 会自动停止守护进程、撤销全部 TPROXY 规则并停掉核心，**无需重启**即可恢复系统原始网络；再次打开开关即可恢复。
- **卸载模块**：在 KernelSU 管理器点击卸载，[uninstall.sh](uninstall.sh) 会自动清理 TPROXY 防火墙规则、停止核心并移除开机自启脚本，**不会导致卸载后断网**；同时会保留 `/data/adb/box/` 里的节点配置和历史备份，方便以后重装。若需彻底清除全部数据，重启后执行 `su -c 'rm -rf /data/adb/box'` 即可。

### 3. 常用 Root 排障命令

```sh
# 查看 sing-box 核心运行状态
su -c '/data/adb/box/scripts/box.service status'

# 通过面板桥重启核心并同步 TPROXY 规则
su -c 'sh /data/adb/box/scripts/box.ui restart'

# 重新加载 iptables / ip6tables 透明代理规则
su -c '/data/adb/box/scripts/box.tproxy renew'

# 查看最近 80 行核心日志与启动错误日志
su -c 'sh /data/adb/box/scripts/box.ui logs'
su -c 'cat /data/adb/box/run/error_sing-box.log'

# 校验当前配置文件语法
su -c '/data/adb/box/bin/sing-box check -D /data/adb/box/sing-box'
```

---

## 五、常见问题（FAQ）

<details>
<summary><b>Q1：刷完模块并重启后，打开海外网站连不上？</b></summary>

模块自带的 `config.json` 中只有 `*.example.com` 占位节点，无法联网。请先进入 **KernelSU → 模块 → 打开面板 → 节点 → `+ 导入`**，导入你自己的真实节点链接并点选激活。
</details>

<details>
<summary><b>Q2：为什么在浏览器访问 <code>127.0.0.1:9090/ui</code> 打不开控制面板？</b></summary>

为了安全，本模块**取消了浏览器远程面板**。Clash API 仅监听本机回环 `127.0.0.1:9090` 且强制 Bearer 密钥认证（密钥存于 `/data/adb/box/api.secret`，权限 `0600`）。请直接在 **KernelSU 管理器 → 模块卡片** 中打开内嵌 WebUI。
</details>

<details>
<summary><b>Q3：手动切了「规则分流」，过几秒又自动变回「直连模式」？</b></summary>

说明你开启了「家庭网络自动切换」，且当前连着配置的家庭 Wi-Fi。进入面板 **「设置 → 家庭网络联动」** 关闭「自动切换模式」并保存即可保持手动控制。
</details>

<details>
<summary><b>Q4：导入节点链接提示校验失败或不支持该协议？</b></summary>

- 常见链接直接支持 `vless://`、`hysteria2://` / `hy2://`、`trojan://`、`ss://`、`socks://` / `socks5://`、`http://` / `https://`。
- 如果是带特殊插件、复杂传输或 `vmess` / `tuic` / `anytls` 等协议，直接把对应的 **sing-box 节点 JSON** 粘贴进导入框即可。
- 校验失败会显示 `sing-box check` 原文提示，原配置不会被覆盖。
</details>

<details>
<summary><b>Q5：总览页「实时速率」为什么和测速软件显示的总网速不一样？</b></summary>

总览页的上下行速率仅统计**经过 `sing-box` 核心转发的连接**。被 `box.config` 列入黑名单直连豁免的国内 App（如抖音、B 站、淘宝等）不经过核心，因此不会计入该速率。
</details>

<details>
<summary><b>Q6：高级配置改坏了导致核心起不来怎么办？</b></summary>

通过面板保存任何配置前都会先执行 `sing-box check` 校验；即使通过校验但核心启动超时未就绪，`box.ui` 也会**自动还原上一次可用配置并重新拉起核心**，不用担心改坏配置变砖断网。
</details>

---

## 六、项目架构与文件说明

```text
ksu-singbox/
├── build.sh                     # 打包脚本，运行 python3 build.sh 生成 ksu-singbox.zip
├── customize.sh                 # KernelSU 安装/升级脚本（备份旧配置、防降级更新内核、初始化密钥）
├── box4_service.sh              # 开机自启入口（安装至 /data/adb/service.d/）
├── uninstall.sh                 # 卸载清理脚本（停服务、清 TPROXY 规则、删自启，保留用户配置）
├── module.prop                  # KernelSU 模块元数据（id=box4）
├── webroot/                     # KernelSU 内嵌 Material 3 WebUI（纯原生 HTML/CSS/JS，零外部依赖）
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── box/
│   ├── bin/sing-box             # Android arm64 sing-box 核心二进制
│   ├── sing-box/
│   │   ├── config.json          # 默认占位配置模板（不含任何个人凭据）
│   │   └── config.example.json  # 精简示例配置
│   └── scripts/
│       ├── start.sh             # 开机解锁后启动核心、加载规则并拉起自动切网守护
│       ├── box.config           # 用户配置（代理模式、端口、豁免 App 列表、热点接口列表）
│       ├── box.service          # 核心启停控制（存活校验、优雅停机、脱离 Freezer/高 Swap、日志轮转）
│       ├── box.tproxy           # 双栈 TPROXY 规则（原子化 iptables-restore、动态 IP 同步、热点放行）
│       ├── box.ui               # WebUI ↔ 本机安全桥（串行锁、校验回滚、API 密钥隔离、临时文件自动清理）
│       ├── box.smart_home.sh    # 低功耗网络守护（家庭自动切网、动态 IP 指纹同步、Wi-Fi SSID 缓存、日志轮转）
│       ├── box.inotify          # 监听 KernelSU 模块开关状态，实时启停代理
│       └── box.tool             # 规则集辅助更新脚本
└── tests/
    └── panel.spec.cjs           # Playwright 面板集成测试（交互、导入、防环、主题、320/393/600 适配）
```

### 自动化验证

仓库自带 Playwright 前端集成测试（使用模拟的 KernelSU 桥）：

```sh
node tests/panel.spec.cjs
```

覆盖范围包括：多页导航、策略组切换、失败反馈、RFC 3986 节点测速编码、连接搜索、直连域名保存、家庭联动设置、VLESS 与家宽 SOCKS5 链式导入防环、浅/深色主题及 `320 / 393 / 600 px` 响应式无溢出校验。
