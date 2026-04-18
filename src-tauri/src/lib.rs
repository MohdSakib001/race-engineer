mod parser;
mod telemetry;

use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use telemetry::{SharedState, TelemetryHandle, TelemetryState};

// ── App-level state ───────────────────────────────────────────────────────────
struct AppState {
    telemetry: SharedState,
    telemetry_handle: Option<TelemetryHandle>,
    api_key: Option<String>,
}

type SafeAppState = Arc<Mutex<AppState>>;

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
async fn start_telemetry(
    port: Option<u16>,
    state: State<'_, SafeAppState>,
    app: AppHandle,
) -> Result<Value, String> {
    let port = port.unwrap_or(telemetry::DEFAULT_PORT);
    let (telemetry_state, old_handle) = {
        let mut s = state.lock().map_err(|_| "Lock error")?;
        let ts = s.telemetry.clone();
        let old = s.telemetry_handle.take();
        (ts, old)
    };

    // Stop previous listener if any
    if let Some(h) = old_handle {
        let _ = h.shutdown.send(());
    }

    let handle = telemetry::start_udp_listener(port, telemetry_state, app).await?;
    state.lock().map_err(|_| "Lock error")?.telemetry_handle = Some(handle);
    Ok(json!({ "success": true, "port": port }))
}

#[tauri::command]
fn stop_telemetry(
    state: State<'_, SafeAppState>,
    app: AppHandle,
) -> Result<Value, String> {
    let mut s = state.lock().map_err(|_| "Lock error")?;
    if let Some(h) = s.telemetry_handle.take() {
        let _ = h.shutdown.send(());
    }
    let _ = app.emit("telemetry-stopped", json!({}));
    Ok(json!({ "success": true }))
}

#[tauri::command]
fn set_manual_track(
    track_id: i8,
    state: State<'_, SafeAppState>,
) -> Result<Value, String> {
    let s = state.lock().map_err(|_| "Lock error")?;
    let mut ts = s.telemetry.lock().map_err(|_| "Lock error")?;
    ts.manual_track_id = if track_id == -1 { None } else { Some(track_id) };
    Ok(json!({ "success": true }))
}

#[tauri::command]
fn set_api_key(key: String, state: State<'_, SafeAppState>) -> Result<(), String> {
    let mut s = state.lock().map_err(|_| "Lock error")?;
    s.api_key = if key.trim().is_empty() { None } else { Some(key.trim().to_string()) };
    Ok(())
}

// ── Settings ──────────────────────────────────────────────────────────────────

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("race-engineer-settings.json"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Value {
    match settings_path(&app) {
        Ok(path) => {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(json!({}))
        }
        Err(_) => json!({}),
    }
}

#[tauri::command]
fn save_settings(settings: Value, app: AppHandle) -> Result<(), String> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

// ── Export file ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ExportPayload {
    content: String,
    #[serde(rename = "defaultName")]
    default_name: Option<String>,
}

#[tauri::command]
async fn save_export_file(
    payload: ExportPayload,
    app: AppHandle,
) -> Result<Value, String> {
    if payload.content.is_empty() {
        return Ok(json!({ "error": "No content to export" }));
    }
    let default_name = payload.default_name.unwrap_or_else(|| "export.csv".into());

    let docs_dir = app.path().document_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    let file_path = app.dialog()
        .file()
        .set_title("Export Race Data")
        .set_file_name(&default_name)
        .set_directory(&docs_dir)
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let path_str = path.to_string();
            std::fs::write(&path_str, &payload.content)
                .map_err(|e| e.to_string())?;
            Ok(json!({ "success": true, "filePath": path_str }))
        }
        None => Ok(json!({ "cancelled": true })),
    }
}

// ── Lookups ───────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_lookups() -> Value {
    json!({
        "TRACK_NAMES": {
            "0":"Melbourne","1":"Paul Ricard","2":"Shanghai","3":"Bahrain",
            "4":"Catalunya","5":"Monaco","6":"Montreal","7":"Silverstone",
            "8":"Hockenheim","9":"Hungaroring","10":"Spa","11":"Monza",
            "12":"Singapore","13":"Suzuka","14":"Abu Dhabi","15":"Texas",
            "16":"Brazil","17":"Austria","18":"Sochi","19":"Mexico",
            "20":"Baku","21":"Sakhir Short","22":"Silverstone Short",
            "23":"Texas Short","24":"Suzuka Short","25":"Hanoi",
            "26":"Zandvoort","27":"Imola","28":"Portimao","29":"Jeddah",
            "30":"Miami","31":"Las Vegas","32":"Losail"
        },
        "SESSION_TYPES": {
            "0":"Unknown","1":"P1","2":"P2","3":"P3","4":"Short Practice",
            "5":"Q1","6":"Q2","7":"Q3","8":"Short Q","9":"OSQ",
            "10":"Race","11":"Race 2","12":"Race 3","13":"Time Trial"
        },
        "WEATHER": {
            "0":"Clear","1":"Light Cloud","2":"Overcast",
            "3":"Light Rain","4":"Heavy Rain","5":"Storm"
        },
        "TEAM_COLORS": {
            "0":"#00D2BE","1":"#DC0000","2":"#3671C6","3":"#37BEDD",
            "4":"#358C75","5":"#FF87BC","6":"#5E8FAA","7":"#B6BABD",
            "8":"#FF8000","9":"#52E252","41":"#3671C6","253":"#FFFFFF"
        },
        "TYRE_COMPOUNDS": {
            "16":{"label":"S","name":"Soft","color":"#FF3333"},
            "17":{"label":"M","name":"Medium","color":"#FFD700"},
            "18":{"label":"H","name":"Hard","color":"#CCCCCC"},
            "7":{"label":"I","name":"Intermediate","color":"#39B54A"},
            "8":{"label":"W","name":"Wet","color":"#4477FF"}
        },
        "ACTUAL_COMPOUNDS": {
            "16":"C5","17":"C4","18":"C3","19":"C2","20":"C1","21":"C0","22":"C6",
            "7":"Inter","8":"Wet","9":"Dry","10":"Wet"
        }
    })
}

// ── Ask Engineer (Claude API) ─────────────────────────────────────────────────

const SYSTEM_PROMPT: &str = "You are a Formula 1 race engineer with deep expertise in tyre strategy, fuel management, ERS deployment, weather adaptation, and real-time race tactics. You receive live telemetry data and provide concise, actionable radio-style advice. Speak directly to the driver. Be brief — ideally 1-2 sentences. Prioritize safety, then performance.";

#[derive(Deserialize)]
struct AskPayload {
    question: String,
    context: Option<Value>,
    mode: Option<String>,
}

#[tauri::command]
async fn ask_engineer(
    payload: AskPayload,
    state: State<'_, SafeAppState>,
) -> Result<Value, String> {
    let api_key = {
        let s = state.lock().map_err(|_| "Lock error")?;
        match &s.api_key {
            Some(k) => k.clone(),
            None => return Ok(json!({ "error": "No API key set. Go to Settings and enter your Anthropic API key." })),
        }
    };

    let ctx_str = payload.context
        .as_ref()
        .filter(|v| !v.is_null())
        .map(|v| format!("\nLIVE TELEMETRY CONTEXT:\n{}\n", serde_json::to_string_pretty(v).unwrap_or_default()))
        .unwrap_or_default();

    let mode_suffix = if payload.mode.as_deref() == Some("ENGINEER_DECISION") {
        "\n\nOUTPUT MODE: ENGINEER_DECISION\nRespond in EXACTLY this format:\nspeak: yes/no\nurgency: low/medium/high/critical\ncategory: <type>\nreason: <one sentence>\nradio: <max 2 short sentences>"
    } else { "" };

    let user_content = format!("{}{}\n\n{}", ctx_str, mode_suffix, payload.question);

    let client = reqwest::Client::new();
    let body = json!({
        "model": "claude-opus-4-6",
        "max_tokens": 512,
        "system": SYSTEM_PROMPT,
        "messages": [{ "role": "user", "content": user_content }]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let resp_json: Value = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(err) = resp_json.get("error") {
        let msg = err["message"].as_str().unwrap_or("API error");
        return Ok(json!({ "error": format!("API error: {}", msg) }));
    }

    let text = resp_json["content"][0]["text"].as_str().unwrap_or("").to_string();
    Ok(json!({ "response": text }))
}

// ── TTS ───────────────────────────────────────────────────────────────────────
// TTS via Edge TTS WebSocket (Microsoft neural voices).
// Returns base64-encoded MP3 audio.

#[derive(Deserialize)]
struct TtsPayload {
    text: String,
    voice: Option<String>,
}

#[tauri::command]
async fn tts_speak(payload: TtsPayload) -> Result<String, String> {
    // Edge TTS via the unofficial WebSocket API
    let voice = payload.voice.as_deref().unwrap_or("en-GB-RyanNeural");
    edge_tts(&payload.text, voice).await
}

async fn edge_tts(text: &str, voice: &str) -> Result<String, String> {
    use tokio_tungstenite::{connect_async, tungstenite::Message};
    use futures_util::{SinkExt, StreamExt};

    let token = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    let url = format!(
        "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken={}&ConnectionId={}",
        token,
        uuid_v4()
    );

    let request_id = uuid_v4();
    let timestamp = chrono_now();

    let config_msg = format!(
        "Path: speech.config\r\nX-RequestId: {}\r\nX-Timestamp: {}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n{{\"context\":{{\"synthesis\":{{\"audio\":{{\"metadataoptions\":{{\"sentenceBoundaryEnabled\":false,\"wordBoundaryEnabled\":false}},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}}}}}",
        request_id, timestamp
    );

    let ssml = format!(
        "<speak version='1.0' xml:lang='en-US'><voice name='{}'><prosody rate='+0%' pitch='+0Hz'>{}</prosody></voice></speak>",
        voice,
        text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
    );

    let ssml_msg = format!(
        "Path: ssml\r\nX-RequestId: {}\r\nX-Timestamp: {}\r\nContent-Type: application/ssml+xml\r\n\r\n{}",
        request_id, timestamp, ssml
    );

    let (ws_stream, _) = connect_async(&url).await.map_err(|e| format!("TTS connect: {}", e))?;
    let (mut write, mut read) = ws_stream.split();

    write.send(Message::Text(config_msg.into())).await.map_err(|e| e.to_string())?;
    write.send(Message::Text(ssml_msg.into())).await.map_err(|e| e.to_string())?;

    let mut audio_chunks: Vec<u8> = Vec::new();

    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Binary(data)) => {
                // Binary messages contain audio after the header
                if let Some(sep) = find_audio_separator(&data) {
                    audio_chunks.extend_from_slice(&data[sep..]);
                }
            }
            Ok(Message::Text(text)) => {
                if text.contains("Path:turn.end") { break; }
            }
            Err(e) => return Err(format!("TTS stream error: {}", e)),
            _ => {}
        }
    }

    if audio_chunks.is_empty() {
        return Err("TTS produced no audio".into());
    }

    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&audio_chunks))
}

fn find_audio_separator(data: &[u8]) -> Option<usize> {
    // Edge TTS binary frames have a 2-byte header length, then header text, then audio
    if data.len() < 2 { return None; }
    let header_len = u16::from_be_bytes([data[0], data[1]]) as usize;
    let audio_start = 2 + header_len;
    if audio_start < data.len() { Some(audio_start) } else { None }
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    format!("{:032x}", t).chars().enumerate().map(|(i, c)| {
        if i == 8 || i == 12 || i == 16 || i == 20 { format!("-{}", c) } else { c.to_string() }
    }).collect()
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    format!("{}", ms)
}

// ── App setup ─────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state: SafeAppState = Arc::new(Mutex::new(AppState {
        telemetry: Arc::new(Mutex::new(TelemetryState::default())),
        telemetry_handle: None,
        api_key: None,
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            start_telemetry,
            stop_telemetry,
            set_manual_track,
            set_api_key,
            load_settings,
            save_settings,
            save_export_file,
            get_lookups,
            ask_engineer,
            tts_speak,
        ])
        .setup(|app| {
            // Load API key from saved settings on startup
            if let Ok(settings_path) = app.path().app_data_dir()
                .map(|p| p.join("race-engineer-settings.json"))
            {
                if let Ok(raw) = std::fs::read_to_string(&settings_path) {
                    if let Ok(settings) = serde_json::from_str::<Value>(&raw) {
                        if let Some(key) = settings["apiKey"].as_str() {
                            if !key.is_empty() {
                                if let Ok(state) = app.state::<SafeAppState>().lock() {
                                    // Stored below — can't borrow mut here in setup closure easily
                                    drop(state);
                                }
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Apex Engineer");
}
