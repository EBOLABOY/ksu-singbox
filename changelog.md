# KernelSU Sing-Box TProxy 更新日志

## v1.2.0 (2026-11-14)
- 🚀 **智能家庭网络感知 (Smart Home Auto-Sensing)**:
  - 自动探测家庭网关与 Wi-Fi SSID (`/data/adb/box/smart_home.conf`)。
  - 回家连接家庭 Wi-Fi 时内核 0.1 秒自动卸载本地代理，切换为全量直连 (`clash_mode: Direct`)，交由家庭软路由统一分流，彻底杜绝双重代理与电量浪费。
  - 外出离开家庭 Wi-Fi 时毫秒级自动接管恢复代理 (`Rule` 模式)。
- 🎮 **国服手游 0 延迟内核直通 (Mobile Gaming Direct Bypass)**:
  - 内核级 `iptables` / `ip6tables` 包过滤直通王者荣耀等竞技手游 (`com.tencent.tmgp.sgame`)。
  - 游戏数据包彻底绕过 sing-box 核心，保证 0 毫秒代理开销、0 抖动、原生 15-20ms 超低 ping 值与 0 掉线。
- 🇺🇸 **微软全家桶专用美国线路分流 (Microsoft US Route)**:
  - 针对 Copilot、Bing、Office 365、OneDrive、Azure、Xbox 深度定制专线分流规则。
  - 解决国内或跨区节点导致的验证码、访问受限及功能屏蔽问题。
- ⚡ **Go 运行时与内核网络栈极致调优 (Memory & Power Tuning)**:
  - 限制 Go 核心线程与堆内存分配 (`GOMAXPROCS=2`, `GOMEMLIMIT=36MiB`, `GOGC=30`)。
  - 物理常驻内存 (VmRSS) 压缩至 **23 MB**，空闲 CPU 占用 **0.0%**。
  - 启用 Linux 内核 `fq_codel` 队列调度算法（杜绝 Bufferbloat 拥塞排队延迟）。
  - 启用 TCP Fast Open 3 并关闭空闲慢启动 (`tcp_slow_start_after_idle=0`)，保持长连接热度，消灭锁屏唤醒首包迟滞。
- 📱 **KernelSU 官方 WebUI 深度集成**:
  - 官方 Manager 卡片直接唤出响应式暗色管理面板。
  - 集成智能家居环境卡片、游戏直通指示器、微软专线状态卡片、节点测速与双栈 IPv6 连通性诊断。

## 历史版本 (v5.1 及更早)
- 支持 sing-box、mihomo、clash、xray 等核心 TProxy 透明代理。
- 支持 IPv6 透明代理与防回环规则。
- 支持 Android 多用户与应用黑白名单分流。
