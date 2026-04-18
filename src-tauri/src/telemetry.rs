/// UDP telemetry runtime — ported from src/main/telemetry-runtime.js
use crate::parser::{self, HEADER_SIZE};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::net::UdpSocket;
use tokio::sync::oneshot;

pub const DEFAULT_PORT: u16 = 20777;

#[derive(Debug, Clone, Default)]
pub struct TelemetryState {
    pub session_data: Option<Value>,
    pub participants: Option<Value>,
    pub lap_data: Option<Value>,
    pub car_telemetry: Option<Value>,
    pub car_status: Option<Value>,
    pub car_damage: Option<Value>,
    pub car_setup: Option<Value>,
    pub next_front_wing: f64,
    pub player_car_index: usize,
    pub best_lap_times: HashMap<usize, u32>,
    pub fastest_lap: Option<Value>,
    pub manual_track_id: Option<i8>,
}

pub type SharedState = Arc<Mutex<TelemetryState>>;

/// Handle to a running UDP listener — drop to cancel.
pub struct TelemetryHandle {
    pub shutdown: oneshot::Sender<()>,
}

pub async fn start_udp_listener(
    port: u16,
    state: SharedState,
    app: AppHandle,
) -> Result<TelemetryHandle, String> {
    let addr = format!("0.0.0.0:{}", port);
    let socket = UdpSocket::bind(&addr)
        .await
        .map_err(|e| format!("Cannot bind UDP port {}: {}", port, e))?;

    log::info!("Telemetry listening on UDP :{}", port);

    let (tx, mut rx) = oneshot::channel::<()>();

    // Send started event immediately
    let _ = app.emit("telemetry-started", json!({ "port": port }));

    let state_clone = state.clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        let mut buf = vec![0u8; 4096];
        loop {
            tokio::select! {
                _ = &mut rx => break,
                result = socket.recv(&mut buf) => {
                    let n = match result {
                        Ok(n) => n,
                        Err(e) => {
                            log::error!("UDP recv error: {}", e);
                            let _ = app_clone.emit("telemetry-error", json!({ "message": e.to_string() }));
                            break;
                        }
                    };
                    if n < HEADER_SIZE { continue; }
                    let packet = &buf[..n];
                    if let Some(header) = parser::parse_header(packet) {
                        handle_packet(header, packet, &state_clone, &app_clone);
                    }
                }
            }
        }
        log::info!("Telemetry UDP listener stopped on :{}", port);
    });

    Ok(TelemetryHandle { shutdown: tx })
}

fn handle_packet(header: parser::Header, data: &[u8], state: &SharedState, app: &AppHandle) {
    let mut s = match state.lock() { Ok(s) => s, Err(_) => return };
    let idx = header.player_car_index as usize;
    if idx < parser::MAX_CARS { s.player_car_index = idx; }

    match header.packet_id {
        1 => {
            if let Some(mut session) = parser::parse_session(data) {
                // Apply manual track override
                if let Some(override_id) = s.manual_track_id {
                    session["trackId"] = json!(override_id);
                }
                // Clear best laps on track change
                if let Some(existing) = &s.session_data {
                    let changed = existing["trackId"] != session["trackId"]
                        || existing["sessionType"] != session["sessionType"];
                    if changed {
                        s.best_lap_times.clear();
                        s.fastest_lap = None;
                        log::info!("Session changed: track={} type={}", session["trackId"], session["sessionType"]);
                    }
                }
                s.session_data = Some(session.clone());
                let payload = enrich_session(&session);
                drop(s);
                let _ = app.emit("session-update", payload);
            }
        }
        2 => {
            if let Some(lap) = parser::parse_lap_data(data) {
                let player_idx = s.player_car_index;
                s.lap_data = Some(lap.clone());
                drop(s);
                let _ = app.emit("lap-update", json!({ "lapData": lap, "playerCarIndex": player_idx }));
            }
        }
        4 => {
            if let Some(participants) = parser::parse_participants(data) {
                s.participants = Some(participants.clone());
                drop(s);
                let _ = app.emit("participants-update", participants);
            }
        }
        5 => {
            if let Some(setup_packet) = parser::parse_car_setup(data) {
                let player_idx = s.player_car_index;
                if let (Some(setups), next_fw) = (
                    setup_packet["carSetups"].as_array(),
                    setup_packet["nextFrontWingValue"].as_f64().unwrap_or(0.0),
                ) {
                    s.car_setup = Some(Value::Array(setups.clone()));
                    s.next_front_wing = next_fw;
                    let player_setup = setups.get(player_idx).cloned().unwrap_or(Value::Null);
                    let mut ps = player_setup.clone();
                    if let Value::Object(ref mut m) = ps {
                        m.insert("nextFrontWingValue".into(), json!(next_fw));
                    }
                    let all = Value::Array(setups.clone());
                    drop(s);
                    let _ = app.emit("setup-update", ps);
                    let _ = app.emit("allsetup-update", all);
                }
            }
        }
        6 => {
            if let Some(tel) = parser::parse_car_telemetry(data) {
                let player_idx = s.player_car_index;
                let player_tel = tel.as_array()
                    .and_then(|a| a.get(player_idx))
                    .cloned()
                    .unwrap_or(Value::Null);
                s.car_telemetry = Some(tel.clone());
                drop(s);
                let _ = app.emit("telemetry-update", player_tel);
                let _ = app.emit("alltelemetry-update", tel);
            }
        }
        7 => {
            if let Some(status) = parser::parse_car_status(data) {
                let player_idx = s.player_car_index;
                let player_status = status.as_array()
                    .and_then(|a| a.get(player_idx))
                    .cloned()
                    .unwrap_or(Value::Null);
                s.car_status = Some(status.clone());
                drop(s);
                let _ = app.emit("status-update", player_status);
                let _ = app.emit("allstatus-update", status);
            }
        }
        3 => {
            if let Some(event) = parser::parse_event(data) {
                if event["type"] == "FTLP" {
                    let v_idx = event["vehicleIdx"].as_u64().unwrap_or(0) as usize;
                    let ms = event["lapTimeMs"].as_u64().unwrap_or(0) as u32;
                    s.fastest_lap = Some(json!({ "vehicleIdx": v_idx, "lapTimeMs": ms }));
                    let fl = s.fastest_lap.clone().unwrap();
                    drop(s);
                    let _ = app.emit("fastest-lap-update", fl);
                } else {
                    drop(s);
                }
                let _ = app.emit("event-update", event);
            }
        }
        10 => {
            if let Some(damage) = parser::parse_car_damage(data) {
                let player_idx = s.player_car_index;
                let player_dmg = damage.as_array()
                    .and_then(|a| a.get(player_idx))
                    .cloned()
                    .unwrap_or(Value::Null);
                s.car_damage = Some(damage);
                drop(s);
                let _ = app.emit("damage-update", player_dmg);
            }
        }
        11 => {
            if let Some(hist) = parser::parse_session_history(data) {
                if hist.best_lap_time_ms > 0 {
                    s.best_lap_times.insert(hist.car_idx, hist.best_lap_time_ms);
                    let best_laps: HashMap<String, u32> = s.best_lap_times
                        .iter()
                        .map(|(k, v)| (k.to_string(), *v))
                        .collect();
                    drop(s);
                    let _ = app.emit("best-laps-update", best_laps);
                }
            }
        }
        _ => {}
    }
}

/// Attach track/session names (mirrors telemetry-runtime broadcastSession)
fn enrich_session(session: &Value) -> Value {
    let track_id = session["trackId"].as_i64().unwrap_or(-1);
    let session_type = session["sessionType"].as_u64().unwrap_or(0);
    let weather = session["weather"].as_u64().unwrap_or(0);

    let track_name = track_name(track_id as i8);
    let session_type_name = session_type_name(session_type as u8);
    let weather_name = weather_name(weather as u8);

    let mut enriched = session.clone();
    if let Value::Object(ref mut m) = enriched {
        m.insert("trackName".into(), json!(track_name));
        m.insert("sessionTypeName".into(), json!(session_type_name));
        m.insert("weatherName".into(), json!(weather_name));
    }
    enriched
}

fn track_name(id: i8) -> &'static str {
    match id {
        0  => "Melbourne",     1  => "Paul Ricard",  2  => "Shanghai",
        3  => "Bahrain",       4  => "Catalunya",    5  => "Monaco",
        6  => "Montreal",      7  => "Silverstone",  8  => "Hockenheim",
        9  => "Hungaroring",   10 => "Spa",          11 => "Monza",
        12 => "Singapore",     13 => "Suzuka",       14 => "Abu Dhabi",
        15 => "Texas",         16 => "Brazil",       17 => "Austria",
        18 => "Sochi",         19 => "Mexico",       20 => "Baku",
        21 => "Sakhir Short",  22 => "Silverstone Short", 23 => "Texas Short",
        24 => "Suzuka Short",  25 => "Hanoi",        26 => "Zandvoort",
        27 => "Imola",         28 => "Portimao",     29 => "Jeddah",
        30 => "Miami",         31 => "Las Vegas",    32 => "Losail",
        _  => "Unknown Track",
    }
}

fn session_type_name(t: u8) -> &'static str {
    match t {
        0 => "Unknown", 1 => "P1", 2 => "P2", 3 => "P3", 4 => "Short Practice",
        5 => "Q1", 6 => "Q2", 7 => "Q3", 8 => "Short Q", 9 => "OSQ",
        10 => "Race", 11 => "Race 2", 12 => "Race 3", 13 => "Time Trial",
        _ => "Unknown",
    }
}

fn weather_name(w: u8) -> &'static str {
    match w {
        0 => "Clear", 1 => "Light Cloud", 2 => "Overcast",
        3 => "Light Rain", 4 => "Heavy Rain", 5 => "Storm",
        _ => "Clear",
    }
}
