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

inotifyd ${scripts_dir}/box.inotify ${module_dir} > /dev/null 2>&1 &

while [ ! -f /data/misc/net/rt_tables ] ; do
  sleep 3
done

net_dir="/data/misc/net"
inotifyd ${scripts_dir}/net.inotify ${net_dir} > /dev/null 2>&1 &

[ -x /data/adb/box/scripts/box.smart_home.sh ] && /data/adb/box/scripts/box.smart_home.sh >/dev/null 2>&1 &
