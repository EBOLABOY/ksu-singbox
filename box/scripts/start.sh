#!/system/bin/sh

MODID="ksu-singbox"
if [ -d "/data/adb/modules/ksu-singbox" ]; then
  MODID="ksu-singbox"
elif [ -d "/data/adb/modules/box4" ]; then
  MODID="box4"
fi

module_dir="/data/adb/modules/${MODID}"
[ -n "$(magisk -v 2>/dev/null | grep lite)" ] && module_dir="/data/adb/lite_modules/${MODID}"

scripts=$(realpath $0)
scripts_dir=$(dirname ${scripts})

source ${scripts_dir}/box.config

wait_until_login(){
  # we don't have permission to rw "/sdcard" before user unlocks screen
  local test_file="/sdcard/Android/.BOX4TEST"
  true > "$test_file"
  while [ ! -f "$test_file" ] ; do
    true > "$test_file"
    sleep 1
  done
  rm "$test_file"

  while [ ! -f "/data/system/packages.xml" ] ; do
    sleep 1
  done
}

wait_until_login

rm -f ${pid_file}
mkdir -p ${run_path}

if [ ! -f ${box_path}/manual ] && [ ! -f ${module_dir}/disable ] ; then
  mv ${run_path}/run.log ${run_path}/run.log.bak 2>/dev/null
  mv ${run_path}/run_error.log ${run_path}/run_error.log.bak 2>/dev/null

  # Kernel network stack performance tuning
  sysctl -w net.core.default_qdisc=fq_codel >/dev/null 2>&1
  sysctl -w net.ipv4.tcp_slow_start_after_idle=0 >/dev/null 2>&1
  sysctl -w net.ipv4.tcp_fastopen=3 >/dev/null 2>&1
  sysctl -w net.ipv4.tcp_adv_win_scale=1 >/dev/null 2>&1
  sysctl -w net.ipv4.tcp_mtu_probing=1 >/dev/null 2>&1

  ${scripts_dir}/box.service start >> ${run_path}/run.log 2>> ${run_path}/run_error.log && \
  ${scripts_dir}/box.tproxy enable >> ${run_path}/run.log 2>> ${run_path}/run_error.log
fi

[ -x /data/adb/box/scripts/box.smart_home.sh ] && /data/adb/box/scripts/box.smart_home.sh >/dev/null 2>&1 &
