# KernelSU Sing-Box TProxy Transparent Proxy Module

<p align="center">
  <img src="https://img.shields.io/badge/KernelSU-Supported-brightgreen?style=flat-square&logo=android" alt="KernelSU" />
  <img src="https://img.shields.io/badge/APatch-Supported-blue?style=flat-square&logo=android" alt="APatch" />
  <img src="https://img.shields.io/badge/Magisk-Supported-orange?style=flat-square&logo=android" alt="Magisk" />
  <img src="https://img.shields.io/badge/Core-sing--box%20Bionic%20arm64-blueviolet?style=flat-square" alt="sing-box" />
  <img src="https://img.shields.io/badge/RAM%20Usage-~23%20MB%20VmRSS-success?style=flat-square" alt="Memory" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-lightgrey?style=flat-square" alt="License" />
</p>

<p align="center">
  <strong>An all-in-one Android transparent proxy hub powered by Linux kernel-level TProxy and sing-box (Bionic arm64).</strong><br>
  Official KernelSU WebUI Integration · Smart Home Auto-Sensing · Zero-Latency Competitive Gaming Direct Bypass · Microsoft US Dedicated Route · 23MB Ultra-low RAM & Battery Tuning
</p>

<p align="center">
  <a href="README.md">简体中文</a> • <a href="README_en.md">English</a>
</p>

---

## 💡 Why This Project?

Traditional user-space proxy apps on Android (e.g., ClashForAndroid, v2rayNG, sing-box client) suffer from several inherent drawbacks:
1. **Persistent VPN Key Icon**: Clutters the status bar and triggers anti-proxy / anti-fraud security checks in banking and corporate apps.
2. **Aggressive Process Termination**: OEM Android skins (HyperOS, OriginOS, ColorOS) aggressively kill background VPN services, causing frequent connection drops when the screen is locked.
3. **Extra Virtual TUN Overhead**: Android's `VpnService` incurs multiple user-space to kernel-space packet copies, inflating battery drain and network latency.
4. **Game Lag & Packet Jitter**: Competitive mobile games routed through local proxy tunnels often suffer from sudden 460ms ping spikes.
5. **Home vs. Away Friction**: When connecting to a home network equipped with a smart/soft router, double proxying occurs unless the user manually toggles their mobile proxy off.

**KernelSU Sing-Box TProxy resolves all of these issues at the Linux kernel level.**

---

## 🌟 Key Highlights

### 1. 🏠 Smart Home Auto-Sensing
- **Auto Direct at Home**: When your phone connects to your home Wi-Fi, the daemon detects the gateway and SSID and **automatically switches the proxy mode to `Direct` within 100ms**. All traffic is offloaded to your home router, eliminating double-proxy overhead.
- **Auto Takeover Away**: Disconnecting from home Wi-Fi (switching to cellular 5G/4G or public networks) instantly restores **`Rule` proxy mode** in milliseconds. Completely autonomous—no manual toggling required.

### 2. 🎮 Competitive Gaming 0-Latency Direct Bypass
- Identifies gaming traffic by package UID via kernel-level `iptables` / `ip6tables` (defaults to *Honor of Kings* `com.tencent.tmgp.sgame`).
- Bypasses the sing-box user-space core completely at the Linux packet-filter level.
- Delivers **0ms proxy processing overhead, 0 jitter, native 15–20ms ping, and zero disconnects**.

### 3. 🇺🇸 Microsoft Ecosystem US Dedicated Route
- Dedicated outbound selector routing all Microsoft services (Copilot, Bing AI, Office 365, OneDrive, Azure, Xbox) through trusted US egress nodes.
- Eliminates CAPTCHA prompts, regional geo-blocking, and account risk flags.

### 4. ⚡ Extreme Low Resource Consumption (23MB VmRSS & 0.0% CPU)
- **Go Runtime Tuning**:
  - Thread concurrency capped at `GOMAXPROCS=2`.
  - Memory limit soft-cap: `GOMEMLIMIT=36MiB`.
  - Aggressive GC ratio: `GOGC=30`.
  - Resident memory (VmRSS) lowered from 70–90MB down to **~23 MB**!
- **Linux Network Stack Optimizations**:
  - `fq_codel` queuing discipline: Eliminates bufferbloat queuing lag.
  - TCP Fast Open 3: Accelerates handshakes.
  - Disabled slow-start restart (`tcp_slow_start_after_idle=0`): Keeps long-lived sockets hot, eliminating first-packet stalls on screen wake.

### 5. 📱 Modern High-Performance WebUI (Adopting Zashboard & boxproxy Strengths)
- 🚀 **Live Traffic Speedometer & Canvas Sparkline Waveform**: Real-time upload/download speeds with hardware-accelerated sparkline curves.
- 🔍 **Active Connections Inspector & Disconnector**: Real-time audit of every active socket (target host, port, destination IP, matched rule e.g. `geosite-microsoft` or `direct`, and transferred bytes) with individual and kill-all options.
- ⚡ **Parallel Concurrent Batch Ping & Auto-Sort**: Fast multi-threaded latency benchmarks with one-click ascending delay auto-sorting.
- 🔄 **Online GeoIP / GeoSite Rule-Set Hot Updater**: Integrated `box.tool update-geo` to synchronize the latest SagerNet rule-sets with zero-latency daemon hot-reload.
- 📱 **Official KernelSU / APatch Manager Integration**: Single-file instant load (only ~50KB) with native mobile dark aesthetics.

### 6. 🌐 True Dual-Stack IPv6 Transparent Proxy
- Native IPv6 direct pass-through for domestic high-speed connectivity.
- `ip6tables` TProxy redirection for overseas traffic with full IPv6 node support.

---

## 📂 Module Structure

```
├── META-INF/                    # Magisk / KernelSU flash package descriptor
├── customize.sh                 # Installation script (permissions & mounts)
├── module.prop                  # Module metadata (id, version, WebUI config)
├── box4_service.sh              # Boot daemon & service supervision script
├── uninstall.sh                 # Uninstallation script
├── build.sh                     # Python3 one-click package builder
├── webroot/                     # KernelSU embedded WebUI source
│   └── index.html               # Responsive dark dashboard
└── box/                         # Core proxy runtime directory
    ├── bin/
    │   └── sing-box             # Official NDK Bionic aarch64 native binary
    ├── scripts/
    │   ├── box.service          # Service control (start/stop/status with env vars)
    │   ├── box.tproxy           # iptables / ip6tables TProxy rules
    │   ├── box.smart_home.sh    # Smart home sensing daemon
    │   ├── box.node             # Node management helper
    │   ├── box.config           # Base configuration (blacklist, IPv6 switches)
    │   └── net.inotify          # Network interface event listener
    └── sing-box/
        ├── config.json          # Main sing-box runtime configuration
        ├── config.example.json  # Reference configuration template
        └── ui/                  # External browser WebUI mirror
            └── index.html
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Android device rooted with **KernelSU**, **APatch**, or **Magisk**.
- Architecture: `arm64-v8a` (aarch64).
- Android version: Android 10+ (tested on Android 14 / Xiaomi HyperOS).
- Kernel: Linux kernel with `TProxy` support (standard on modern kernels).

### Step 1: Install Module
1. Download `ksu-singbox.zip` from [Releases](https://github.com/EBOLABOY/ksu-singbox/releases), or build it locally:
   ```bash
   python3 build.sh
   ```
2. Transfer `ksu-singbox.zip` to your phone.
3. Open **KernelSU Manager** ➔ **Modules** ➔ **Install Module** ➔ Select the zip file.
4. Reboot your phone.

### Step 2: Configure Nodes
#### Option A: WebUI Import (Recommended)
1. Open **KernelSU Manager** ➔ Modules ➔ Click the **Web Config** button on the `KernelSU Sing-Box TProxy` card (or browse to `http://127.0.0.1:9090/ui`).
2. Under "Node Management", click **"+ Import Share Link"** and paste your `vless://`, `hysteria2://`, `trojan://`, or `ss://` URI.

#### Option B: Edit Config Manually
Edit `/data/adb/box/sing-box/config.json` directly using a root editor or terminal, then restart the service:
```bash
su -c '/data/adb/box/scripts/box.service restart'
```

### Step 3: Configure Smart Home Sensing (Optional)
To enable automatic direct connection when on home Wi-Fi:
```bash
su -c 'cat << "EOF" > /data/adb/box/smart_home.conf
ROUTER_GW="192.168.1.1"      # Your home router/gateway IP
HOME_SSID="MyHomeWiFi"       # Your home Wi-Fi SSID
EOF'
```

---

## 📊 Benchmark Comparison (Xiaomi 13 / Snapdragon 8 Gen 2)

| Metric | Traditional VPN App | KernelSU Sing-Box TProxy | Improvement |
| :--- | :---: | :---: | :---: |
| **Resident Memory (VmRSS)** | 78 ~ 115 MB | **23 MB** | **-75% reduction** |
| **Idle Screen-Off CPU** | 0.8% ~ 2.4% | **0.0%** | **Near-zero battery drain** |
| **Honor of Kings In-Game Ping** | 55 ~ 90 ms | **16 ~ 21 ms** | **Native physical baseline** |
| **Screen Wake First-Packet Lag** | 800 ~ 1500 ms | **< 60 ms** | **Fast Open + fq_codel** |
| **Status Bar Icon** | Cluttered Key Icon | **Clean Native Status Bar** | **Bypasses banking fraud detection** |

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](LICENSE).  
The sing-box core is developed and copyrighted by the [SagerNet Team](https://github.com/SagerNet/sing-box).
