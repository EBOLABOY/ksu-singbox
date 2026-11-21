# v1.3.2

- Prevented `customize.sh` from downgrading a manually updated `sing-box` binary on upgrade (semver-aware replacement).
- Moved `sing-box` out of `/apps` memcg (`swappiness=100`) into root `/dev/memcg` (`swappiness=30`) in `box.service` to prevent aggressive swapping under Android memory pressure.
- Cleaned up `box.ui localize` stderr output from `sing-box merge` and updated version metadata consistently across `module.prop` and WebUI.

# v1.3.1

- Fixed hotspot/tethering domestic website access failure caused by IPv6 SYN-ACK loopback in `BOX_LOCAL` (added `-o <ap>` bypass for hotspot interfaces).
- Fixed severe IPv6 UDP loopback storm (high CPU) by excluding STA uplink `wlan0` from `ap_list`, ignoring unmarked loopback traffic (`-i lo -m mark ! --mark`), adding TCP `-m socket` protection, and syncing dynamic local IPv4/IPv6 addresses into `LOCAL_IP_V4`/`LOCAL_IP_V6`.
- Added missing RFC1918 `172.16.0.0/12` and IPv6 ULA `fd00::/8` intranet bypasses, narrowed `100.0.0.0/8` to CGNAT `100.64.0.0/10`, and included `softap+`/`swlan+`/`usb+`/`bt-pan` in `ap_list`.
- Kept `accept_ra=2` in `enable_ipv6()` so IPv6 Router Advertisements continue working while hotspot forwarding is enabled.
- Reordered `config.json` route rules so `sniff`/`hijack-dns` run before `Direct` mode, `ip_is_private` runs before `Global` mode, and `udp/443` rejection runs after `geoip-cn`/`geosite-cn` so domestic QUIC works properly.
- Fixed module lifecycle consistency in `start.sh`, `box.inotify`, and `box.ui` (auto-generate `api.secret` on fresh installs, avoid running `box.smart_home.sh` or orphan `sing-box` when disabled, and keep TPROXY rules in sync on restart).
- Redesigned KernelSU WebUI with native Material 3 styling, 2-column node cards, and responsive light/dark themes.
- Hardened and optimized backend scripts: atomic `iptables-restore --noflush` IP sync, low-power `box.smart_home.sh` (inline IP pre-check with IPv6-enable tracking, Wi-Fi SSID caching, write-on-change `smart_home.json`, lock-only-on-write, cgroup freezer escape), automatic log rotation (`sing-box.log` / `smart_home.log`), graceful `box.service` start/stop verification, `gid_list` blacklist fix, `/proc/net/ip_tables_targets` TPROXY fallback, temp config cleanup in `box.ui`, and full TPROXY/service teardown in `uninstall.sh`.
- Fixed RFC 3986 path encoding in WebUI (`app.js`) so delay checks succeed for nodes containing parentheses `()`, fixed fresh-install localization & atomic binary update in `customize.sh`, migrated remote `rule_set` from deprecated `download_detour` to `http_clients` (`sing-box 1.14+`), and removed legacy `net.inotify`.

# v1.3.0

- Rebuilt the KernelSU panel with overview, node groups, connections and settings pages.
- Added local themes, validated node import/editing, Microsoft group selection and honest runtime status.
- Removed browser panel support; management uses the KernelSU shell bridge and loopback API.
- Added serialized configuration writes, checked restarts and automatic rollback on failed startup.
- Replaced duplicate home-mode processes with a locked coordinator and persisted manual override.
- Made legacy status queries read-only and preserved existing user configuration during upgrades.
