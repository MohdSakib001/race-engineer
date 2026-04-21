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
    premium: bool,
    usage_input_tokens: u64,
    usage_cached_input_tokens: u64,
    usage_output_tokens: u64,
    usage_cache_creation_tokens: u64,
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

#[tauri::command]
fn set_premium(enabled: bool, state: State<'_, SafeAppState>) -> Result<(), String> {
    let mut s = state.lock().map_err(|_| "Lock error")?;
    s.premium = enabled;
    Ok(())
}

#[tauri::command]
fn get_premium(state: State<'_, SafeAppState>) -> Result<Value, String> {
    let s = state.lock().map_err(|_| "Lock error")?;
    Ok(json!({
        "premium": s.premium,
        "hasApiKey": s.api_key.is_some(),
    }))
}

#[tauri::command]
fn get_usage(state: State<'_, SafeAppState>) -> Result<Value, String> {
    let s = state.lock().map_err(|_| "Lock error")?;
    // Haiku 4.5 pricing: $1/M input, $0.10/M cached, $1.25/M cache-write, $5/M output
    let cost = (s.usage_input_tokens as f64) / 1_000_000.0 * 1.0
        + (s.usage_cached_input_tokens as f64) / 1_000_000.0 * 0.10
        + (s.usage_cache_creation_tokens as f64) / 1_000_000.0 * 1.25
        + (s.usage_output_tokens as f64) / 1_000_000.0 * 5.0;
    Ok(json!({
        "inputTokens": s.usage_input_tokens,
        "cachedInputTokens": s.usage_cached_input_tokens,
        "cacheCreationTokens": s.usage_cache_creation_tokens,
        "outputTokens": s.usage_output_tokens,
        "costUsd": (cost * 10000.0).round() / 10000.0,
    }))
}

#[tauri::command]
fn reset_usage(state: State<'_, SafeAppState>) -> Result<(), String> {
    let mut s = state.lock().map_err(|_| "Lock error")?;
    s.usage_input_tokens = 0;
    s.usage_cached_input_tokens = 0;
    s.usage_output_tokens = 0;
    s.usage_cache_creation_tokens = 0;
    Ok(())
}

fn record_usage(app_state: &SafeAppState, usage: &Value) {
    if let Ok(mut s) = app_state.lock() {
        s.usage_input_tokens += usage["input_tokens"].as_u64().unwrap_or(0);
        s.usage_cached_input_tokens += usage["cache_read_input_tokens"].as_u64().unwrap_or(0);
        s.usage_cache_creation_tokens += usage["cache_creation_input_tokens"].as_u64().unwrap_or(0);
        s.usage_output_tokens += usage["output_tokens"].as_u64().unwrap_or(0);
    }
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

// ── Ask Engineer / Strategy (Claude API) ──────────────────────────────────────

const STRATEGY_MODEL: &str = "claude-haiku-4-5-20251001";

// Static engineer doctrine — cached via prompt caching (90% token discount on re-use).
// Written as one large block so Anthropic's cache sees a stable prefix across calls.
const ENGINEER_DOCTRINE: &str = r#"You are a Formula 1 race engineer embedded with a driver during a live session. You speak over the radio: short, calm, precise. Never generic — always grounded in the exact telemetry you are given.

Guiding principles:
• Safety first. Call out imminent hazards (SC, puncture risk, heavy damage, rain onset) before performance calls.
• Never invent data. If something isn't in the snapshot, don't claim it.
• Be specific. Lap numbers, gap seconds, compound names, wear percentages.
• British pitwall cadence. Under 12 words for normal calls, under 6 for emergencies.

Pit strategy doctrine:
• PIT LOSS per circuit (seconds): Monaco 19, Singapore 23, Melbourne 21, Silverstone 22, Spa 22, Monza 20, Austin 21, default 22.
• TYRE WEAR ZONES: 0-35% safe, 35-50% early degradation, 50-65% cliff incoming, 65-75% danger, 75%+ critical pit now.
• UNDERCUT window: when rival ahead gap 1.5-3.5s AND tyres are 2+ laps newer AND pit window open. Typically 1.5-2s gain per lap on fresh tyres.
• OVERCUT window: when rival ahead just pitted AND your tyres still in a healthy zone AND track position lap time delta < 1s to out-lap from pits.
• SC OPPORTUNITY: a full safety car pit costs ~50% of normal pit loss. Always call pit if SC deployed + pit window open + tyre age > 6 laps.
• FREE STOP (VSC): VSC pit loss is ~half of normal. Call pit if VSC active AND tyre age > 8 laps AND no fresh rubber already mounted.
• WEATHER CROSSOVER: Slick→Inter crossover roughly when track wetness 30-40%. Inter→Wet when rainPercentage > 60%. Dry→Inter: pit immediately if lap pace loss > 4s on slicks.
• DAMAGE STOP: front wing > 40%, or >2 corners damaged, or engine/gearbox >25% — call pit this lap regardless of window.
• STRATEGIC STAY: if tyres < 30% wear AND no damage AND pit window still open for 8+ laps, prefer extending the stint.
• FUEL TARGETING: if fuelInTank < lapsRemaining * estFuelPerLap * 1.02, call fuel saving. If > 1.2x, call push.
• ERS: defend/attack with ERS only within the last 3 laps of a stint or final 5 laps of race, else bank.

Response style:
• Use the structured tool output — do not answer in free prose unless explicitly asked for a chat reply.
• reasoning ≤ 2 sentences, British engineer tone.
• radioMessage is what the driver hears. Short. No preamble like "Copy" or "Right Lewis."
"#;

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
    let (api_key, premium) = {
        let s = state.lock().map_err(|_| "Lock error")?;
        let key = s.api_key.clone();
        (key, s.premium)
    };

    if !premium {
        return Ok(json!({
            "error": "premium_required",
            "message": "AI engineer responses are a Premium feature. Upgrade in Settings or use Free mode's predefined radio calls."
        }));
    }

    let api_key = match api_key {
        Some(k) => k,
        None => return Ok(json!({ "error": "No API key set. Go to Settings and enter your Anthropic API key." })),
    };

    let ctx_value = payload.context.as_ref().filter(|v| !v.is_null()).cloned();
    let ctx_str = ctx_value
        .as_ref()
        .map(|v| format!("\nLIVE TELEMETRY CONTEXT:\n{}\n", serde_json::to_string_pretty(v).unwrap_or_default()))
        .unwrap_or_default();

    let mode_suffix = if payload.mode.as_deref() == Some("ENGINEER_DECISION") {
        "\n\nOUTPUT MODE: ENGINEER_DECISION\nRespond in EXACTLY this format:\nspeak: yes/no\nurgency: low/medium/high/critical\ncategory: <type>\nreason: <one sentence>\nradio: <max 2 short sentences>"
    } else { "" };

    let user_content = format!("{}{}\n\n{}", ctx_str, mode_suffix, payload.question);

    // System block uses caching — the doctrine is identical across calls.
    let system_blocks = json!([
        {
            "type": "text",
            "text": ENGINEER_DOCTRINE,
            "cache_control": { "type": "ephemeral" }
        }
    ]);

    let client = reqwest::Client::new();
    let body = json!({
        "model": STRATEGY_MODEL,
        "max_tokens": 512,
        "system": system_blocks,
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

    if let Some(usage) = resp_json.get("usage") {
        let app_state = state.inner().clone();
        record_usage(&app_state, usage);
    }

    let text = resp_json["content"][0]["text"].as_str().unwrap_or("").to_string();
    Ok(json!({ "response": text }))
}

// ── Strategy call — structured JSON output via tool use ──────────────────────

#[derive(Deserialize)]
struct StrategyPayload {
    /// Full telemetry snapshot — player car + rivals + session + history
    snapshot: Value,
    /// What triggered this call: e.g. "lap_complete", "sc_deployed", "rain_onset", "user_ask"
    trigger: String,
    /// Optional explicit driver question to steer the call
    question: Option<String>,
}

#[tauri::command]
async fn call_strategy(
    payload: StrategyPayload,
    state: State<'_, SafeAppState>,
) -> Result<Value, String> {
    let (api_key, premium) = {
        let s = state.lock().map_err(|_| "Lock error")?;
        (s.api_key.clone(), s.premium)
    };

    if !premium {
        return Ok(json!({
            "error": "premium_required",
            "message": "Strategy calls require Premium. Using rule-based fallback."
        }));
    }
    let api_key = match api_key {
        Some(k) => k,
        None => return Ok(json!({ "error": "No API key set." })),
    };

    let snapshot_str = serde_json::to_string(&payload.snapshot).unwrap_or_default();
    let question = payload.question.unwrap_or_else(|| {
        "Given the telemetry snapshot and trigger, decide the best strategic call NOW.".into()
    });

    let user_text = format!(
        "TRIGGER: {}\n\nSNAPSHOT:\n{}\n\nQUESTION: {}",
        payload.trigger, snapshot_str, question
    );

    // Tool definition forces structured output.
    let strategy_tool = json!({
        "name": "strategy_call",
        "description": "Return the single best strategic call for the driver right now.",
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "pit_now", "pit_next_lap", "pit_in_n_laps", "stay_out",
                        "push", "save_tyres", "save_fuel", "manage_ers",
                        "defend", "attack_undercut", "attack_overcut", "hold_position"
                    ]
                },
                "targetLap": { "type": ["integer", "null"] },
                "targetCompound": {
                    "type": ["string", "null"],
                    "enum": ["soft", "medium", "hard", "inter", "wet", null]
                },
                "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
                "urgency": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
                "reasoning": { "type": "string", "maxLength": 300 },
                "radioMessage": { "type": "string", "maxLength": 140 },
                "alternativeAction": { "type": ["string", "null"] },
                "triggerConditions": {
                    "type": "array",
                    "items": { "type": "string" },
                    "maxItems": 3
                }
            },
            "required": ["action", "confidence", "urgency", "reasoning", "radioMessage"]
        }
    });

    let system_blocks = json!([
        {
            "type": "text",
            "text": ENGINEER_DOCTRINE,
            "cache_control": { "type": "ephemeral" }
        }
    ]);

    let body = json!({
        "model": STRATEGY_MODEL,
        "max_tokens": 600,
        "system": system_blocks,
        "tools": [strategy_tool],
        "tool_choice": { "type": "tool", "name": "strategy_call" },
        "messages": [{ "role": "user", "content": user_text }]
    });

    let client = reqwest::Client::new();
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

    if let Some(usage) = resp_json.get("usage") {
        let app_state = state.inner().clone();
        record_usage(&app_state, usage);
    }

    // Extract tool_use block
    let decision = resp_json["content"]
        .as_array()
        .and_then(|blocks| blocks.iter().find(|b| b["type"] == "tool_use"))
        .and_then(|b| b.get("input").cloned())
        .unwrap_or(Value::Null);

    if decision.is_null() {
        return Ok(json!({ "error": "Model did not return a structured decision" }));
    }

    Ok(json!({ "decision": decision, "trigger": payload.trigger }))
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
        premium: false,
        usage_input_tokens: 0,
        usage_cached_input_tokens: 0,
        usage_output_tokens: 0,
        usage_cache_creation_tokens: 0,
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
            set_premium,
            get_premium,
            get_usage,
            reset_usage,
            load_settings,
            save_settings,
            save_export_file,
            get_lookups,
            ask_engineer,
            call_strategy,
            tts_speak,
        ])
        .setup(|app| {
            // Load API key + premium flag from saved settings on startup
            if let Ok(settings_path) = app.path().app_data_dir()
                .map(|p| p.join("race-engineer-settings.json"))
            {
                if let Ok(raw) = std::fs::read_to_string(&settings_path) {
                    if let Ok(settings) = serde_json::from_str::<Value>(&raw) {
                        let key = settings["apiKey"].as_str().unwrap_or("").to_string();
                        let premium = settings["premium"].as_bool().unwrap_or(false);
                        let state_handle = app.state::<SafeAppState>();
                        let app_state: SafeAppState = Arc::clone(&state_handle);
                        drop(state_handle);
                        let lock_result = app_state.lock();
                        if let Ok(mut s) = lock_result {
                            if !key.is_empty() {
                                s.api_key = Some(key);
                            }
                            s.premium = premium;
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Apex Engineer");
}
