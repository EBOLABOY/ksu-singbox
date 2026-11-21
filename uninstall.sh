#!/system/bin/sh
export PATH="/data/adb/ksu/bin:/data/adb/magisk:/data/adb/ap/bin:/system/bin:$PATH"

BOX="/data/adb/box"
RUN="$BOX/run"

# 1. Stop smart_home coordinator and module inotify watcher
if [ -s "$RUN/smart_home.pid" ]; then
  spid=$(cat "$RUN/smart_home.pid" 2>/dev/null)
  if [ -n "$spid" ] && [ -r "/proc/$spid/cmdline" ] && tr '\0' ' ' < "/proc/$spid/cmdline" | grep -q 'box.smart_home.sh'; then
    kill "$spid" 2>/dev/null || true
  fi
fi

for pid in $(pidof inotifyd 2>/dev/null); do
  if [ -r "/proc/$pid/cmdline" ] && tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q '/box.inotify'; then
    kill "$pid" 2>/dev/null || true
  fi
done

# 2. Cleanly tear down TPROXY/iptables rules before stopping core so device keeps network access
[ -x "$BOX/scripts/box.tproxy" ] && "$BOX/scripts/box.tproxy" disable >/dev/null 2>&1 || true
[ -x "$BOX/scripts/box.service" ] && "$BOX/scripts/box.service" stop >/dev/null 2>&1 || true

# 3. Remove boot service hook (preserve /data/adb/box user configs & backups)
rm -f /data/adb/service.d/box4_service.sh
