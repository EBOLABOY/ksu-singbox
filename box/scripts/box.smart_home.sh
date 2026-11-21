#!/system/bin/sh
# Android-compatible process locks never leak into child proxy processes.
export PATH="/data/adb/ksu/bin:/system/bin:$PATH"
BOX=/data/adb/box; RUN="$BOX/run"; BB=/data/adb/ksu/bin/busybox
API_SECRET_FILE="$BOX/api.secret"
mkdir -p "$RUN"; umask 077
single="$RUN/smart_home.lockdir"
if ! mkdir "$single" 2>/dev/null; then
    owner=$(cat "$single/pid" 2>/dev/null)
    [ -n "$owner" ] && kill -0 "$owner" 2>/dev/null && exit 0
    rm -f "$single/pid"; rmdir "$single" 2>/dev/null || exit 0
    mkdir "$single" 2>/dev/null || exit 0
fi
echo $$ > "$single/pid"
echo $$ > "$RUN/smart_home.pid"
cleanup() {
    if [ "$(cat "$RUN/panel-write.lockdir/pid" 2>/dev/null)" = "$$" ]; then rm -f "$RUN/panel-write.lockdir/pid"; rmdir "$RUN/panel-write.lockdir" 2>/dev/null || true; fi
    rm -f "$single/pid" "$RUN/smart_home.pid"; rmdir "$single" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM
json_string() {
    printf '%s' "$1" | "$BB" awk 'BEGIN{ORS="";printf "\""}{if(NR>1)printf "\\n";gsub(/\\/,"\\\\");gsub(/\"/,"\\\"");gsub(/\t/,"\\t");gsub(/\r/,"\\r");printf "%s",$0}END{printf "\""}'
}
api() {
    api_secret=$(cat "$API_SECRET_FILE" 2>/dev/null) || return 1
    [ -n "$api_secret" ] || return 1
    curl --noproxy '*' -fsS --connect-timeout 1 --max-time 3 -H "Authorization: Bearer $api_secret" "$@"
}
while true; do
    # Keep LOCAL_IP_V4 / LOCAL_IP_V6 synchronized with dynamic Wi-Fi/cellular/hotspot addresses.
    [ -x "$BOX/scripts/box.tproxy" ] && "$BOX/scripts/box.tproxy" sync-ips >/dev/null 2>&1 || true

    lock="$RUN/panel-write.lockdir"
    if ! mkdir "$lock" 2>/dev/null; then
        owner=$(cat "$lock/pid" 2>/dev/null)
        if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then rm -f "$lock/pid"; rmdir "$lock" 2>/dev/null || true; fi
        sleep 2; continue
    fi
    echo $$ > "$lock/pid"
    AUTO_SWITCH=1; ROUTER_GW=192.168.100.1; HOME_SSID=''
    [ ! -f "$BOX/smart_home.conf" ] || . "$BOX/smart_home.conf"
    route=$(ip -4 route get 1.1.1.1 2>/dev/null)
    iface=$(printf '%s' "$route" | awk '{for(i=1;i<NF;i++)if($i=="dev"){print $(i+1);exit}}')
    gateway=$(printf '%s' "$route" | awk '{for(i=1;i<NF;i++)if($i=="via"){print $(i+1);exit}}')
    ssid=''
    case "$iface" in wlan*) ssid=$(cmd wifi status 2>/dev/null | sed -n 's/^Wifi is connected to "\(.*\)"$/\1/p' | head -n 1) ;; esac
    location=away
    case "$iface" in wlan*)
        if [ "$gateway" = "$ROUTER_GW" ] || { [ -n "$HOME_SSID" ] && [ "$ssid" = "$HOME_SSID" ]; }; then location=home; fi ;;
    esac
    desired=Rule; [ "$location" != home ] || desired=Direct
    applied=false
    response=$(api http://127.0.0.1:9090/configs 2>/dev/null)
    mode=$(printf '%s' "$response" | sed -n 's/.*"mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    if [ "$AUTO_SWITCH" = 1 ] && [ -n "$mode" ]; then
        if [ "$mode" != "$desired" ]; then
            if api -X PATCH -H 'Content-Type: application/json' --data "{\"mode\":\"$desired\"}" http://127.0.0.1:9090/configs >/dev/null 2>&1; then mode=$desired; fi
        fi
        [ "$mode" != "$desired" ] || applied=true
    fi
    {
        printf '{"location":'; json_string "$location"
        printf ',"gateway":'; json_string "$gateway"
        printf ',"interface":'; json_string "$iface"
        printf ',"ssid":'; json_string "$ssid"
        printf ',"mode":'; json_string "$mode"
        printf ',"applied":%s,"automatic":%s,"updated_at":' "$applied" "$([ "$AUTO_SWITCH" = 1 ] && echo true || echo false)"
        json_string "$(date '+%Y-%m-%d %H:%M:%S')"; printf '}\n'
    } > "$RUN/smart_home.json.tmp"
    mv -f "$RUN/smart_home.json.tmp" "$RUN/smart_home.json"
    last=$(cat "$RUN/smart_home.last" 2>/dev/null)
    state="$location/$AUTO_SWITCH/$mode/$applied"
    if [ "$state" != "$last" ]; then
        printf '[%s] network=%s interface=%s automatic=%s mode=%s applied=%s\n' "$(date '+%F %T')" "$location" "$iface" "$AUTO_SWITCH" "$mode" "$applied" >> "$RUN/smart_home.log"
        printf '%s\n' "$state" > "$RUN/smart_home.last"
    fi
    rm -f "$lock/pid"; rmdir "$lock" 2>/dev/null || true
    sleep 15
done
