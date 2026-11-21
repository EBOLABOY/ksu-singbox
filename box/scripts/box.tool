#!/system/bin/sh

scripts=$(realpath "$0")
scripts_dir=$(dirname "${scripts}")
source "${scripts_dir}/box.config"

geo_update() {
  local target_dir="${box_path}/sing-box"
  mkdir -p "$target_dir"
  echo "Updating Geo rule-sets from mirror..."

  local mirror="https://raw.githubusercontent.com/SagerNet"
  local files="
sing-geoip/rule-set/geoip-cn.srs
sing-geosite/rule-set/geosite-cn.srs
sing-geosite/rule-set/geosite-microsoft.srs
"

  local success=0
  for rel in $files; do
    local fname=$(basename "$rel")
    local url="${mirror}/${rel}"
    echo "- Downloading ${fname}..."
    curl -f -s -L --connect-timeout 10 -m 30 -o "${target_dir}/${fname}.tmp" "$url"
    if [ $? -eq 0 ] && [ -s "${target_dir}/${fname}.tmp" ]; then
      mv -f "${target_dir}/${fname}.tmp" "${target_dir}/${fname}"
      echo "  [OK] ${fname} updated."
      success=$((success + 1))
    else
      rm -f "${target_dir}/${fname}.tmp"
      echo "  [FAIL] ${fname} download failed."
    fi
  done

  if [ $success -gt 0 ]; then
    echo "Reloading sing-box service..."
    if [ -x "${scripts_dir}/box.ui" ]; then
      "${scripts_dir}/box.ui" restart >/dev/null 2>&1
    else
      "${scripts_dir}/box.service" restart >/dev/null 2>&1
    fi
    echo "Rule-sets update completed successfully."
    return 0
  else
    echo "Error: Failed to update rule-sets. Please check network connection."
    return 1
  fi
}

case "$1" in
  update-geo)
    geo_update
    ;;
  *)
    echo "Usage: $0 {update-geo}"
    ;;
esac
