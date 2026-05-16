//! Network connectivity helpers for the Settings UI.
//!
//! `network_diagnose` reports the user's local IP, public IP, firewall-rule
//! status, and UPnP/IGD port-mapping status for the telemetry port.
//!
//! `network_auto_setup` adds a Windows Firewall inbound rule (via an
//! elevated `netsh` call — UAC will prompt) and asks the router to forward
//! the port back to this machine via UPnP.
//!
//! `open_external_url` opens an http(s) link in the user's default browser.

use serde_json::{json, Value};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket};
use std::time::Duration;

const FIREWALL_RULE_PREFIX: &str = "Race Engineer Telemetry";
const UPNP_DESCRIPTION: &str = "Race Engineer Telemetry";

fn rule_name(port: u16) -> String {
    format!("{} UDP {}", FIREWALL_RULE_PREFIX, port)
}

#[tauri::command]
pub async fn network_diagnose(port: u16) -> Value {
    let local_ip = primary_local_ipv4();
    let local_ips = list_local_ipv4();
    let firewall_rules = scan_firewall_rules(port).await;
    let our_rule = our_firewall_rule_exists(port).await;
    let public_ip = fetch_public_ip().await;
    let cgnat = public_ip
        .as_deref()
        .and_then(|s| s.parse::<Ipv4Addr>().ok())
        .map(is_cgnat)
        .unwrap_or(false);
    let upnp = upnp_status_json(port).await;

    json!({
        "port": port,
        "platform": std::env::consts::OS,
        "localIp": local_ip,
        "localIps": local_ips,
        "publicIp": public_ip,
        "cgnatLikely": cgnat,
        // Any inbound UDP allow rule that covers this port (manual user
        // rules count too — not just the rule we install).
        "firewallRuleExists": !firewall_rules.is_empty(),
        "firewallRules": firewall_rules,
        // Specifically OUR named rule — gates the Remove Setup button so
        // we never delete a rule the user installed themselves.
        "ourFirewallRule": our_rule,
        "upnp": upnp,
    })
}

#[tauri::command]
pub async fn network_auto_setup(port: u16) -> Value {
    let firewall = add_firewall_rule(port).await;
    let upnp = add_upnp_mapping(port).await;
    json!({ "firewall": firewall, "upnp": upnp })
}

#[tauri::command]
pub async fn network_remove_setup(port: u16) -> Value {
    let firewall = remove_firewall_rule(port).await;
    let upnp = remove_upnp_mapping(port).await;
    json!({ "firewall": firewall, "upnp": upnp })
}

/// Open an http(s) URL in the user's default browser. Used by the
/// "Open router admin" button and the VPN download links.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Only http(s) URLs are allowed".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Local IP helpers ─────────────────────────────────────────────────────────

/// LAN IPv4 the OS would use to reach the internet. Works without sending
/// any packets — `connect` on a UDP socket only binds the routing decision.
fn primary_local_ipv4() -> Option<String> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("1.1.1.1:80").ok()?;
    match sock.local_addr().ok()? {
        SocketAddr::V4(v4) => Some(v4.ip().to_string()),
        SocketAddr::V6(_) => None,
    }
}

fn list_local_ipv4() -> Vec<String> {
    match local_ip_address::list_afinet_netifas() {
        Ok(ifs) => ifs
            .iter()
            .filter_map(|(_, ip)| match ip {
                IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_link_local() => {
                    Some(v4.to_string())
                }
                _ => None,
            })
            .collect(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_public_ip() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .ok()?;
    let resp = client.get("https://api.ipify.org").send().await.ok()?;
    let txt = resp.text().await.ok()?;
    let trimmed = txt.trim();
    if trimmed.parse::<IpAddr>().is_ok() {
        Some(trimmed.to_string())
    } else {
        None
    }
}

/// 100.64.0.0/10 is the CGNAT range — if the user's public IP falls in it,
/// no amount of port-forwarding can help; they must use a VPN overlay.
fn is_cgnat(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 100 && (64..=127).contains(&o[1])
}

// ── Windows Firewall ─────────────────────────────────────────────────────────

/// Returns display names of every enabled inbound UDP allow-rule that
/// covers `port`, including ranges (`20770-20780`) and `Any`. Walks the full
/// firewall ruleset so user-installed rules count, not just our own.
#[cfg(target_os = "windows")]
async fn scan_firewall_rules(port: u16) -> Vec<String> {
    // Pulling all rules + port filters in one pipeline is much faster than
    // calling Get-NetFirewallPortFilter per rule (which round-trips the
    // firewall service for each call).
    let ps = format!(
        r#"
$ErrorActionPreference='SilentlyContinue'
$port = {port}
$rules = Get-NetFirewallRule -Direction Inbound -Action Allow -Enabled True
$pfMap = @{{}}
$rules | Get-NetFirewallPortFilter | ForEach-Object {{ $pfMap[$_.InstanceID] = $_ }}
$out = New-Object System.Collections.ArrayList
foreach ($r in $rules) {{
    $f = $pfMap[$r.Name]
    if (-not $f) {{ continue }}
    if ($f.Protocol -ne 'UDP') {{ continue }}
    $hit = $false
    foreach ($p in @($f.LocalPort)) {{
        $ps = "$p"
        if ($ps -eq 'Any') {{ $hit = $true; break }}
        if ($ps -eq "$port") {{ $hit = $true; break }}
        if ($ps -match '^(\d+)-(\d+)$') {{
            $a = [int]$Matches[1]; $b = [int]$Matches[2]
            if ($port -ge $a -and $port -le $b) {{ $hit = $true; break }}
        }}
    }}
    if ($hit) {{ [void]$out.Add($r.DisplayName) }}
}}
$out -join "`n"
"#
    );
    let res = tokio::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .output()
        .await;
    match res {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

#[cfg(not(target_os = "windows"))]
async fn scan_firewall_rules(_port: u16) -> Vec<String> {
    Vec::new()
}

/// Whether OUR specific named rule (the one Auto Setup creates) is present.
/// Used to decide if the Remove Setup button is safe to show — we must
/// never delete rules the user installed themselves.
#[cfg(target_os = "windows")]
async fn our_firewall_rule_exists(port: u16) -> bool {
    let name = rule_name(port);
    let out = tokio::process::Command::new("netsh")
        .args([
            "advfirewall",
            "firewall",
            "show",
            "rule",
            &format!("name={}", name),
        ])
        .output()
        .await;
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout);
            s.contains("LocalPort") || s.contains("Local Port")
        }
        Err(_) => false,
    }
}

#[cfg(not(target_os = "windows"))]
async fn our_firewall_rule_exists(_port: u16) -> bool {
    false
}

#[cfg(target_os = "windows")]
async fn add_firewall_rule(port: u16) -> Value {
    let name = rule_name(port);
    let netsh_args = format!(
        "advfirewall firewall add rule name=\"{}\" dir=in action=allow protocol=UDP localport={} profile=any",
        name, port
    );
    run_elevated_netsh(&netsh_args).await
}

#[cfg(target_os = "windows")]
async fn remove_firewall_rule(port: u16) -> Value {
    let name = rule_name(port);
    let netsh_args = format!(
        "advfirewall firewall delete rule name=\"{}\" protocol=UDP localport={}",
        name, port
    );
    run_elevated_netsh(&netsh_args).await
}

#[cfg(target_os = "windows")]
async fn run_elevated_netsh(netsh_args: &str) -> Value {
    // PowerShell `Start-Process -Verb RunAs` triggers UAC. We ask for the
    // exit code so we can distinguish "user clicked No" from a real failure.
    // Single-quote escape for embedding into the PS string.
    let escaped = netsh_args.replace('\'', "''");
    let ps = format!(
        "$ErrorActionPreference='Stop'; \
         try {{ \
           $p = Start-Process -FilePath 'netsh' -ArgumentList '{}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; \
           exit $p.ExitCode \
         }} catch {{ \
           Write-Error $_.Exception.Message; exit 1223 \
         }}",
        escaped
    );
    let out = tokio::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .output()
        .await;
    match out {
        Ok(o) if o.status.success() => json!({ "ok": true }),
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();
            // 1223 = ERROR_CANCELLED — the canonical UAC-cancelled code.
            let user_declined = o.status.code() == Some(1223)
                || stderr.contains("operation was canceled by the user")
                || stderr.contains("The operation was canceled");
            json!({
                "ok": false,
                "userDeclined": user_declined,
                "error": if user_declined {
                    "You declined the Windows admin prompt. Click 'Yes' to allow the firewall rule.".to_string()
                } else if stderr.is_empty() {
                    format!("netsh exited with code {:?}", o.status.code())
                } else {
                    stderr
                },
                "code": o.status.code(),
            })
        }
        Err(e) => json!({ "ok": false, "error": e.to_string() }),
    }
}

#[cfg(not(target_os = "windows"))]
async fn add_firewall_rule(_port: u16) -> Value {
    json!({
        "ok": false, "skipped": true,
        "error": "Firewall auto-setup is only supported on Windows."
    })
}

#[cfg(not(target_os = "windows"))]
async fn remove_firewall_rule(_port: u16) -> Value {
    json!({ "ok": false, "skipped": true })
}

// ── UPnP / IGD ───────────────────────────────────────────────────────────────

async fn discover_gateway() -> Result<igd_next::aio::Gateway<igd_next::aio::tokio::Tokio>, String> {
    let opts = igd_next::SearchOptions {
        timeout: Some(Duration::from_secs(3)),
        ..Default::default()
    };
    igd_next::aio::tokio::search_gateway(opts)
        .await
        .map_err(|e| e.to_string())
}

async fn upnp_status_json(port: u16) -> Value {
    let gateway = match discover_gateway().await {
        Ok(g) => g,
        Err(e) => {
            return json!({
                "available": false,
                "mapped": false,
                "error": format!("UPnP not available — router may have it disabled: {}", e),
            });
        }
    };
    let gateway_ip = match gateway.addr {
        SocketAddr::V4(v4) => Some(v4.ip().to_string()),
        SocketAddr::V6(_) => None,
    };
    let external_ip = gateway
        .get_external_ip()
        .await
        .ok()
        .map(|ip| ip.to_string());
    // The async Gateway has no `get_specific_port_mapping_entry`, so walk
    // the generic table until we either find our UDP/external_port mapping
    // or hit the end (an error signals "no entry at this index").
    let mut mapped = false;
    for i in 0..64u32 {
        match gateway.get_generic_port_mapping_entry(i).await {
            Ok(entry) => {
                if entry.external_port == port
                    && entry.protocol == igd_next::PortMappingProtocol::UDP
                {
                    mapped = true;
                    break;
                }
            }
            Err(_) => break,
        }
    }
    json!({
        "available": true,
        "mapped": mapped,
        "externalIp": external_ip,
        "gatewayIp": gateway_ip,
        "gatewayAdminUrl": gateway_ip.as_ref().map(|ip| format!("http://{}", ip)),
    })
}

async fn add_upnp_mapping(port: u16) -> Value {
    let gateway = match discover_gateway().await {
        Ok(g) => g,
        Err(e) => {
            return json!({
                "ok": false,
                "error": format!("Router does not respond to UPnP discovery (it may be disabled in router settings): {}", e),
            });
        }
    };
    let local_ip = match local_ipv4_for_gateway(&gateway) {
        Some(ip) => ip,
        None => {
            return json!({
                "ok": false,
                "error": "Could not determine this machine's LAN IP for the route to the gateway.",
            });
        }
    };
    let local_addr = SocketAddr::V4(SocketAddrV4::new(local_ip, port));

    // Try infinite lease first; some routers reject 0 → fall back to 1 hour.
    for lease in [0u32, 3600u32] {
        let res = gateway
            .add_port(
                igd_next::PortMappingProtocol::UDP,
                port,
                local_addr,
                lease,
                UPNP_DESCRIPTION,
            )
            .await;
        match res {
            Ok(()) => {
                let ext = gateway
                    .get_external_ip()
                    .await
                    .ok()
                    .map(|ip| ip.to_string());
                return json!({
                    "ok": true,
                    "externalIp": ext,
                    "leaseSeconds": lease,
                    "localIp": local_ip.to_string(),
                });
            }
            Err(e) if lease == 0 => {
                log::warn!("UPnP add_port lease=0 failed: {}, retrying with 3600s", e);
                continue;
            }
            Err(e) => {
                return json!({
                    "ok": false,
                    "error": format!("Router rejected the port-forward request: {}", e),
                });
            }
        }
    }
    json!({ "ok": false, "error": "UPnP add_port failed on every attempt" })
}

async fn remove_upnp_mapping(port: u16) -> Value {
    let gateway = match discover_gateway().await {
        Ok(g) => g,
        Err(e) => {
            return json!({ "ok": false, "error": format!("UPnP not available: {}", e) });
        }
    };
    match gateway
        .remove_port(igd_next::PortMappingProtocol::UDP, port)
        .await
    {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e.to_string() }),
    }
}

/// Pick the LAN interface IP that reaches the gateway. Uses a UDP socket's
/// routing decision — no packets are actually sent.
fn local_ipv4_for_gateway(gateway: &igd_next::aio::Gateway<igd_next::aio::tokio::Tokio>) -> Option<Ipv4Addr> {
    let target = match gateway.addr {
        SocketAddr::V4(v4) => v4,
        SocketAddr::V6(_) => return None,
    };
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect(target).ok()?;
    match sock.local_addr().ok()? {
        SocketAddr::V4(v4) => Some(*v4.ip()),
        SocketAddr::V6(_) => None,
    }
}
