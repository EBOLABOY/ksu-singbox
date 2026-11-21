#!/sbin/sh
SKIPUNZIP=1
ASH_STANDALONE=1
[ "$BOOTMODE" = true ] || abort '请在 KernelSU 管理器中安装'
[ "$KSU" = true ] || abort '此版本的配置界面需要 KernelSU'
[ "$KSU_VER_CODE" -ge 10683 ] || abort '请先更新 KernelSU 管理器'
service_dir=/data/adb/service.d
mkdir -p "$service_dir"
unzip -qo "$ZIPFILE" -x 'META-INF/*' -d "$MODPATH"
if [ -d /data/adb/box ]; then
  ui_print '- 保留现有节点、应用列表和家庭设置'
  stamp=$(date +%Y%m%d-%H%M%S)
  mkdir -p "/data/adb/box/backups/$stamp"
  cp -a /data/adb/box/scripts "/data/adb/box/backups/$stamp/"
  cp -a /data/adb/box/sing-box/config.json "/data/adb/box/backups/$stamp/"
  for file in "$MODPATH"/box/scripts/*; do
    [ "${file##*/}" = box.config ] && continue
    cp -f "$file" /data/adb/box/scripts/
  done
  ui_print '- 使用 sing-box 合并并校验本机管理配置'
  sh /data/adb/box/scripts/box.ui localize || abort '配置迁移失败，已保留原配置'
  rm -rf "$MODPATH/box"
else
  mv "$MODPATH/box" /data/adb/box
fi
mkdir -p /data/adb/box/run /data/adb/box/bin
mv -f "$MODPATH/box4_service.sh" "$service_dir/box4_service.sh"
set_perm_recursive /data/adb/box/scripts 0 0 0755 0700
set_perm_recursive /data/adb/box/bin 0 0 0755 0700
set_perm "$service_dir/box4_service.sh" 0 0 0700
# KernelSU sets the WebView directory context and permissions during install.
ui_print '- 完成。请在模块卡片中打开配置面板'
