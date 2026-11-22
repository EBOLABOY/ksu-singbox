#!/system/bin/sh
# Low-power network coordinator & periodic dynamic-IP / log-rotation guard.
# Android-compatible process locks never leak into child proxy processes.
export PATH="/data/adb/ksu/bin:/system/bin:$PATH"
BOX=/data/adb/box
RUN="$BOX/run"
BB=/data/adb/ksu/bin/busybox
[ -x "$BB" ] || BB=busybox
API_SECRET_FILE="$BOX/api.secret"
mkdir -p "$RUN"
umask 077

# Escape app cgroup freezer & /apps memcg in case we were launched from KernelSU Manager WebUI.
echo $$ > /sys/fs/cgroup/cgroup.procs 2>/dev/null || echo $$ > /acct/cgroup.procs 2>/dev/null || true
[ -w /dev/memcg/cgroup.procs ] && echo $$ > /dev/memcg/cgroup.procs 2>/dev/null || true

single="$RUN/smart_home.lockdir"
if ! mkdir "$single" 2>/dev/null; then
    owner=$(cat "$single/pid" 2>/dev/null)
    [ -n "$owner" ] && kill -0 "$owner" 2>/dev/null && exit 0
    rm -f "$single/pid"
    rmdir "$single" 2>/dev/null || exit 0
    mkdir "$single" 2>/dev/null || exit 0
fi
echo $$ > "$single/pid"
echo $$ > "$RUN/smart_home.pid"

cleanup() {
    if [ "$(cat "$RUN/panel-write.lockdir/pid" 2>/dev/null)" = "$$" ]; then
        rm -f "$RUN/panel-write.lockdir/pid"
        rmdir "$RUN/panel-write.lockdir" 2>/dev/null || true
    fi
    rm -f "$single/pid" "$RUN/smart_home.pid"
    rmdir "$single" 2>/dev/null || true
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

# Lightweight IP fingerprint check: only spawn box.tproxy when interface addresses/prefixes actually change.
sync_ips_if_needed() {
    [ -x "$BOX/scripts/box.tproxy" ] || return 0
    local state_file="$RUN/local_ips.state"
    local v4_list v6_list cur_state saved_state v6_en=1

    if [ -f "$state_file" ]; then
        saved_state=$(cat "$state_file" 2>/dev/null)
        case "$saved_state" in
            'v6en:0;'*) v6_en=0 ;;
        esac
    fi

    v4_list=$(ip -4 addr show 2>/dev/null | awk '/inet / {sub(/\/.*/, "", $2); if ($2 != "" && $2 !~ /^127\./) print $2 "/32"}' | sort -u)
    v6_list=""
    if [ "$v6_en" = "1" ]; then
        v6_list=$( {
            ip -6 addr show scope global 2>/dev/null | awk '/inet6 / {sub(/\/.*/, "", $2); if ($2 != "" && $2 !~ /^fe80:|^::1$|^::$/) print $2 "/128"}'
            ip -6 route show table all 2>/dev/null | awk '($0 ~ /proto kernel/ || $0 ~ /table local_network/) && $1 ~ /^[0-9a-fA-F:]+\/[0-9]+$/ && $1 !~ /^fe80:|^ff00:|^::1\/|^::\// {print $1}'
        } | sort -u )
    fi
    cur_state="v6en:${v6_en};v4:${v4_list};v6:${v6_list}"

    if [ -f "$state_file" ]; then
        [ "$cur_state" = "$saved_state" ] && return 0
    else
        # Avoid repeatedly spawning box.tproxy when TPROXY is intentionally disabled.
        [ "$cur_state" = "$last_untracked_ip_state" ] && return 0
        last_untracked_ip_state="$cur_state"
    fi

    "$BOX/scripts/box.tproxy" sync-ips >/dev/null 2>&1 || true
}

# Cap live log growth safely (sing-box opens sing-box.log with O_APPEND so in-place truncate is safe).
rotate_logs() {
    local sb_log="$RUN/sing-box.log"
    local sh_log="$RUN/smart_home.log"
    local sz

    if [ -f "$sb_log" ]; then
        sz=$(wc -c < "$sb_log" 2>/dev/null || echo 0)
        if [ "${sz:-0}" -gt 2097152 ]; then
            tail -n 500 "$sb_log" > "$sb_log.old" 2>/dev/null || true
            : > "$sb_log" 2>/dev/null || true
        fi
    fi

    if [ -f "$sh_log" ]; then
        sz=$(wc -c < "$sh_log" 2>/dev/null || echo 0)
        if [ "${sz:-0}" -gt 262144 ]; then
            tail -n 200 "$sh_log" > "$sh_log.tmp" 2>/dev/null && mv -f "$sh_log.tmp" "$sh_log" || true
        fi
    fi
}

load_conf() {
    AUTO_SWITCH=1
    ROUTER_GW=192.168.100.1
    HOME_SSID=''
    [ ! -f "$BOX/smart_home.conf" ] || . "$BOX/smart_home.conf"
}

acquire_write_lock() {
    local lock="$RUN/panel-write.lockdir"
    local attempts=0
    until mkdir "$lock" 2>/dev/null; do
        local owner=$(cat "$lock/pid" 2>/dev/null)
        if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
            rm -f "$lock/pid"
            rmdir "$lock" 2>/dev/null || true
        fi
        attempts=$((attempts + 1))
        [ "$attempts" -lt 20 ] || return 1
        sleep 0.1
    done
    echo $$ > "$lock/pid"
    return 0
}

release_write_lock() {
    local lock="$RUN/panel-write.lockdir"
    if [ "$(cat "$lock/pid" 2>/dev/null)" = "$$" ]; then
        rm -f "$lock/pid"
        rmdir "$lock" 2>/dev/null || true
    fi
}

tick=0
last_iface=""
last_gateway=""
cached_ssid=""
ssid_age=0
last_json_core=""
last_untracked_ip_state=""

while true; do
    sync_ips_if_needed

    if [ "$((tick % 60))" -eq 0 ]; then
        rotate_logs
    fi
    tick=$((tick + 1))

    load_conf

    route=$(ip -4 route get 1.1.1.1 2>/dev/null)
    iface=$(printf '%s' "$route" | awk '{for(i=1;i<NF;i++)if($i=="dev"){print $(i+1);exit}}')
    gateway=$(printf '%s' "$route" | awk '{for(i=1;i<NF;i++)if($i=="via"){print $(i+1);exit}}')

    # Cache Wi-Fi SSID to avoid waking system_server WifiService via Binder every 15s.
    # Refresh immediately on interface/gateway change, or periodically when matching by SSID.
    ssid=""
    case "$iface" in
        wlan*)
            need_ssid=0
            if [ "$iface" != "$last_iface" ] || [ "$gateway" != "$last_gateway" ] || [ -z "$cached_ssid" ]; then
                need_ssid=1
            elif [ "$AUTO_SWITCH" = 1 ] && [ "$gateway" != "$ROUTER_GW" ] && [ -n "$HOME_SSID" ] && [ "$ssid_age" -ge 4 ]; then
                need_ssid=1
            elif [ "$ssid_age" -ge 20 ]; then
                need_ssid=1
            fi

            if [ "$need_ssid" = 1 ]; then
                cached_ssid=$(cmd wifi status 2>/dev/null | sed -n 's/^Wifi is connected to "\(.*\)"$/\1/p' | head -n 1)
                ssid_age=0
            else
                ssid_age=$((ssid_age + 1))
            fi
            ssid="$cached_ssid"
            ;;
        *)
            cached_ssid=""
            ssid_age=0
            ;;
    esac
    last_iface="$iface"
    last_gateway="$gateway"

    location=away
    case "$iface" in
        wlan*)
            if [ "$gateway" = "$ROUTER_GW" ] || { [ -n "$HOME_SSID" ] && [ "$ssid" = "$HOME_SSID" ]; }; then
                location=home
            fi
            ;;
    esac

    desired=Rule
    [ "$location" != home ] || desired=Direct
    applied=false

    response=$(api http://127.0.0.1:9090/configs 2>/dev/null)
    mode=$(printf '%s' "$response" | sed -n 's/.*"mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

    # Only take the write lock when a mode switch is actually required.
    if [ "$AUTO_SWITCH" = 1 ] && [ -n "$mode" ]; then
        if [ "$mode" != "$desired" ]; then
            if acquire_write_lock; then
                # Re-check config under lock so concurrent manual mode changes from WebUI always win.
                load_conf
                if [ "$AUTO_SWITCH" = 1 ]; then
                    if api -X PATCH -H 'Content-Type: application/json' --data "{\"mode\":\"$desired\"}" http://127.0.0.1:9090/configs >/dev/null 2>&1; then
                        mode="$desired"
                    fi
                fi
                release_write_lock
            fi
        fi
        [ "$AUTO_SWITCH" = 1 ] && [ "$mode" = "$desired" ] && applied=true
    fi

    # Write smart_home.json only when state actually changes (eliminates ~5,700 redundant flash writes/day).
    json_core="$location|$gateway|$iface|$ssid|$mode|$applied|$AUTO_SWITCH"
    if [ "$json_core" != "$last_json_core" ] || [ ! -s "$RUN/smart_home.json" ]; then
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
        last_json_core="$json_core"
    fi

    last=$(cat "$RUN/smart_home.last" 2>/dev/null)
    state="$location/$AUTO_SWITCH/$mode/$applied"
    if [ "$state" != "$last" ]; then
        printf '[%s] network=%s interface=%s automatic=%s mode=%s applied=%s\n' "$(date '+%F %T')" "$location" "$iface" "$AUTO_SWITCH" "$mode" "$applied" >> "$RUN/smart_home.log"
        printf '%s\n' "$state" > "$RUN/smart_home.last"
    fi

    sleep 15
done
