#!/sbin/sh

MODID="ksu-singbox"
if [ -d "/data/adb/modules/ksu-singbox" ]; then
  MODID="ksu-singbox"
elif [ -d "/data/adb/modules/box4" ]; then
  MODID="box4"
fi

module_dir="/data/adb/modules/${MODID}"
[ -n "$(magisk -v 2>/dev/null | grep lite)" ] && module_dir="/data/adb/lite_modules/${MODID}"

scripts_dir="/data/adb/box/scripts"

(
until [ "$(getprop sys.boot_completed)" -eq 1 ] ; do
  sleep 3
done
${scripts_dir}/start.sh
)&

for pid in $(pidof inotifyd); do
  if tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q '/box.inotify'; then kill "$pid" 2>/dev/null || true; fi
done
inotifyd ${scripts_dir}/box.inotify ${module_dir} > /dev/null 2>&1 &

while [ ! -f /data/misc/net/rt_tables ] ; do
  sleep 3
done

# Address rules retain the existing TPROXY lifecycle. The panel never runs
# net.inotify, whose legacy writer is not safe to run for every filesystem event.

# start.sh is the single startup entry for the home coordinator.
