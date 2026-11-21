# sing-box for KernelSU

专用于 KernelSU 管理器的手机配置面板。模块使用 TPROXY 接管流量，配置页放在 `webroot/`，由 KernelSU 内嵌 WebView 打开。页面通过 KernelSU Shell 桥操作本机，不提供浏览器面板；Clash API 只监听 `127.0.0.1:9090`。

## 配置界面

- 总览：核心状态、实际网络、路由模式、经过核心的上下行速率。
- 节点：通用代理、AI 专线（支持家宽 SOCKS5/HTTP 链式落地）与微软专线独立选择、延迟测试、分享链接 / JSON 导入、编辑和删除。
- 连接：搜索域名、IP 和出口，查看连接流量，关闭指定连接。
- 分流：维护自定义直连域名列表，并自动同步 DNS 与路由规则。
- 设置：家庭自动切换、网关和 Wi-Fi、浅色 / 深色 / 跟随系统、日志、高级 JSON 配置、核心重启。

界面显示实际运行状态；选择 Direct 不等于停止核心。家庭模式把手机流量交给家庭软路由，微软地区分流由软路由负责。手动选择模式会暂停自动切换，之后可在设置中重新开启。

## 安装与升级

运行环境：KernelSU 管理器、Android arm64、内核支持 TPROXY。模块 id 为 `box4`，可直接升级当前 box4KernelSU，避免同时安装两套转发规则。

```sh
python3 build.sh
```

生成 `ksu-singbox.zip`，在 KernelSU → 模块 → 安装模块中选择。安装后重启，再从模块卡片打开配置页。升级会保留 `/data/adb/box/` 中现有节点、应用豁免列表和家庭设置；安装脚本备份旧脚本及配置，并使用 sing-box 原生合并与校验命令将管理接口限制为本机。

分发包中的节点是示例，不含个人节点凭据；新安装需在节点页导入自己的链接。支持 VLESS、Hysteria 2、Trojan、常见 Shadowsocks 链接；特殊传输或插件可导入 sing-box 节点 JSON。加入微软组时应确认节点确为美国出口；界面不会根据节点名称自动验证地理位置。

## 实现

- `webroot/index.html`、`styles.css`、`app.js`：无外部字体、CDN 或前端运行依赖。
- `box/scripts/box.ui`：本机管理桥，接口操作有超时，配置写入串行执行，保存前校验，启动失败恢复上一份配置。
- `box/scripts/box.tproxy`：双栈透明代理规则（TCP `DIVERT`、热点接口精确放行与出向豁免、防环回自激、保留 `accept_ra=2`、支持 `sync-ips` 动态刷新本机 IPv4/IPv6 与局域网前缀）。
- `box/scripts/box.smart_home.sh`：带进程锁的自动模式与网络状态协调器，读取当前实际路由，周期核对模式并触发本机地址/前缀同步，尊重持久化手动设置。
- `box/scripts/box.node`：兼容旧接口，状态查询已改为只读。

家庭设置保存在 `/data/adb/box/smart_home.conf`：

```sh
AUTO_SWITCH=1
ROUTER_GW=192.168.100.1
HOME_SSID='My Wi-Fi'
```

前台界面每 4 秒更新一次，隐藏后停止轮询；实际速率只统计经过 sing-box 的连接，不是整机总网速。节点测试测量 HTTP 请求耗时，不代表最大下载带宽。

## 验证

`tests/panel.spec.cjs` 使用模拟的 KernelSU 桥测试界面交互、失败反馈、节点导入、主题和 320 / 393 / 600 像素布局。手机端另行检查 Shell 语法、配置校验、真实桥返回值和核心状态。自动切网的周期检查存在约 15 秒响应间隔，不承诺瞬时切换或任何固定耗电、延迟、吞吐结果。
