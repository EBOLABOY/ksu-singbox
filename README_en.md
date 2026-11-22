# sing-box for KernelSU

A dual-stack (IPv4 + IPv6) **TPROXY transparent proxy module** for **KernelSU-rooted Android (arm64)** devices with a built-in **Material 3 WebUI**.  
Everything is configured locally inside KernelSU Manager—no separate VPN client app, no external browser dashboard, and Clash API is locked to `127.0.0.1:9090` with a per-device Bearer secret.

[简体中文](README.md) | [Changelog](changelog.md)

---

## Highlights

- **Dual-Stack Kernel TPROXY + Hotspot Ready**: Atomic `iptables-restore` / `ip6tables-restore --noflush` rule installation, TCP `DIVERT`, IPv6 loopback storm protection, dynamic local IP/prefix sync, and full hotspot/tethering passthrough (`wlan1~3`, `softap+`, `swlan+`, `rndis+`, `usb+`, `bt-pan`).
- **Native Material 3 WebUI**: Zero CDN or external font dependencies; 2-column node cards, live connection inspection, custom direct-domain rules, theme switching, logs, and validated JSON editing with automatic rollback on startup failure.
- **Dedicated Strategy Groups**:
  - `PROXY` — General outbound traffic.
  - `AI` — Dedicated routing for Gemini, OpenAI/ChatGPT, Claude, etc., with one-click **residential SOCKS5 / HTTP link import**, optional chained transit (`detour: "PROXY"` with cycle guard), and instant IPv6/QUIC fallback.
  - `MICROSOFT` — Dedicated US outbound selector for Bing / Copilot / Rewards / M365.
- **Smart Home Router Coordination**: Automatically switches to `Direct` on your home Wi-Fi (handing traffic to a home soft router) and restores `Rule` mode on cellular/external networks, with low-power polling and zero redundant flash writes.

---

## Quick Start (3 Steps)

### Requirements
- Android **arm64** rooted with **KernelSU Manager** (`versionCode >= 10683`)
- Kernel with `TPROXY` support
- Disable other VPN apps or transparent proxy modules before installing

### 1. Build or Download `ksu-singbox.zip`
Download from [Releases](../../releases), or build locally:
```sh
git clone https://github.com/EBOLABOY/ksu-singbox.git
cd ksu-singbox
python3 build.sh
```

### 2. Flash in KernelSU Manager
1. Open **KernelSU Manager** → **Modules** → **Install** → select `ksu-singbox.zip`.
2. Reboot after installation completes and wait ~5–10s after unlocking.
3. Upgrading an existing `box4` install automatically preserves `/data/adb/box/` nodes, app bypass lists, and smart-home preferences (and never downgrades a manually updated `sing-box` binary).

### 3. Open the Panel & Import Your Nodes
> Distributed `config.json` contains **placeholder sample nodes only** (`*.example.com`).

1. Open **KernelSU Manager** → **Modules** → tap the WebUI button on **sing-box for KernelSU**.
2. Go to **Nodes** → tap **`+ Import`** and paste your links (`vless://`, `hysteria2://`, `trojan://`, `ss://`, `socks://`, `socks5://`, `http://`, or raw sing-box outbound JSON).
3. Pasting a residential `socks://` / `http://` link automatically enables the **AI** group and **chained transit via `PROXY`** (`detour: "PROXY"`).
4. Select your imported node and run **Test All** to verify connectivity.

---

## Detailed Guide & FAQ

See the full beginner walkthrough, app bypass configuration, troubleshooting commands, and FAQ in [README.md](README.md) (Chinese).
