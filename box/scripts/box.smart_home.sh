#!/system/bin/sh

# Optional external config: /data/adb/box/smart_home.conf
CONF_FILE="/data/adb/box/smart_home.conf"
[ -f "$CONF_FILE" ] && . "$CONF_FILE"

ROUTER_GW="${ROUTER_GW:-192.168.100.1}"
HOME_SSID="${HOME_SSID:-195iot}"
CLASH_API="http://127.0.0.1:9090"
RUN_DIR="/data/adb/box/run"
PID_FILE="${RUN_DIR}/smart_home.pid"
STATE_FILE="${RUN_DIR}/smart_home.json"
LOG_FILE="${RUN_DIR}/smart_home.log"
CONFIG_FILE="/data/adb/box/sing-box/config.json"

mkdir -p "${RUN_DIR}"
echo $$ > "${PID_FILE}"
LAST_LOCATION="unknown"

is_at_home() {
  # 1. Check if default gateway matches router IP
  if ip route show table all 2>/dev/null | grep -q "default via ${ROUTER_GW}"; then
    return 0
  fi
  # 2. Check if connected Wi-Fi SSID matches home SSID
  if cmd wifi status 2>/dev/null | grep -q "SSID: \"${HOME_SSID}\""; then
    return 0
  fi
  return 1
}

update_state_file() {
  cat << EOF > "${STATE_FILE}.tmp"
{
  "location": "$1",
  "gateway": "$2",
  "updated_at": "$(date +'%Y-%m-%d %H:%M:%S')"
}
EOF
  mv -f "${STATE_FILE}.tmp" "${STATE_FILE}"
}

sync_mode() {
  CURRENT_GW=$(ip route show table all 2>/dev/null | awk '/default via/ {print $3}' | head -n 1)
  
  if is_at_home; then
    NEW_LOCATION="home"
  else
    NEW_LOCATION="away"
  fi

  if [ "$NEW_LOCATION" != "$LAST_LOCATION" ]; then
    NOW=$(date +'%Y-%m-%d %H:%M:%S')
    if [ "$NEW_LOCATION" = "home" ]; then
      # At home: Switch to Direct mode
      curl -s -X PATCH "${CLASH_API}/configs" \
           -H "Content-Type: application/json" \
           -d '{"mode":"Direct"}' >/dev/null 2>&1
      echo "[${NOW}] 🏠 检测到家庭网络 (${ROUTER_GW} / ${HOME_SSID})，已自动切换为【全量直连】(由软路由处理代理)" >> "${LOG_FILE}"
    else
      # Away: Switch to Rule mode
      curl -s -X PATCH "${CLASH_API}/configs" \
           -H "Content-Type: application/json" \
           -d '{"mode":"Rule"}' >/dev/null 2>&1
      echo "[${NOW}] 🚗 检测到移动/外网环境，已自动恢复【规则代理】(手机底层内核透明接管)" >> "${LOG_FILE}"
    fi
    LAST_LOCATION="${NEW_LOCATION}"
    update_state_file "${NEW_LOCATION}" "${CURRENT_GW:-cellular}"
  fi
}

# Initial check
sync_mode

# Netlink event listener loop
while true; do
  # Wait for route change event from kernel netlink
  ip monitor route 2>/dev/null | head -n 1 >/dev/null
  sync_mode
  sleep 3
done
