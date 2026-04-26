/// F1 25 UDP packet parser — ported from src/main/telemetry-parser.js
use serde_json::{json, Value};

pub const HEADER_SIZE: usize = 29;
pub const MAX_CARS: usize = 22;
const LAP_SIZE: usize = 57;
const TELEMETRY_SIZE: usize = 60;
const STATUS_SIZE: usize = 55;
const DAMAGE_SIZE: usize = 46;
const SETUP_SIZE: usize = 50;
const PARTICIPANT_SIZE: usize = 57;
const LAP_HISTORY_SIZE: usize = 14;
const MOTION_SIZE: usize = 60;

// ── Read helpers ───────────────────────────────────────────────────────────────
#[inline] fn ru8(d: &[u8], o: usize) -> u8 { d.get(o).copied().unwrap_or(0) }
#[inline] fn ri8(d: &[u8], o: usize) -> i8 { ru8(d, o) as i8 }
#[inline] fn ru16(d: &[u8], o: usize) -> u16 {
    if o + 2 > d.len() { return 0; }
    u16::from_le_bytes([d[o], d[o + 1]])
}
#[inline] fn ru32(d: &[u8], o: usize) -> u32 {
    if o + 4 > d.len() { return 0; }
    u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
}
#[inline] fn rf32(d: &[u8], o: usize) -> f32 {
    if o + 4 > d.len() { return 0.0; }
    f32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
}
fn read_str(d: &[u8], start: usize, len: usize) -> String {
    let end = (start + len).min(d.len());
    let slice = &d[start..end];
    let null_pos = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
    String::from_utf8_lossy(&slice[..null_pos]).into_owned()
}

// ── Header ────────────────────────────────────────────────────────────────────
pub struct Header {
    pub packet_id: u8,
    pub player_car_index: u8,
}

pub fn parse_header(d: &[u8]) -> Option<Header> {
    if d.len() < HEADER_SIZE { return None; }
    Some(Header {
        packet_id: ru8(d, 6),
        player_car_index: ru8(d, 27),
    })
}

// ── Motion (packet id 0) ──────────────────────────────────────────────────────
// Each car entry is 60 bytes: worldPos XYZ (12), worldVel XYZ (12), world
// forward/right dirs as int16 (12), lateral/long/vertical G (12), yaw/pitch/
// roll as f32 (12). We only need XYZ position for the track map, so we
// extract just that and drop the rest.
pub fn parse_motion(d: &[u8]) -> Option<Value> {
    let h = HEADER_SIZE;
    let mut cars = Vec::with_capacity(MAX_CARS);
    for i in 0..MAX_CARS {
        let o = h + i * MOTION_SIZE;
        if o + 12 > d.len() { break; }
        cars.push(json!({
            "x": rf32(d, o),
            "y": rf32(d, o + 4),
            "z": rf32(d, o + 8),
        }));
    }
    if cars.is_empty() { None } else { Some(Value::Array(cars)) }
}

// ── Session (packet id 1) ─────────────────────────────────────────────────────
pub fn parse_session(d: &[u8]) -> Option<Value> {
    let h = HEADER_SIZE;
    if d.len() < h + 20 { return None; }

    let safety_car_status = if d.len() > h + 124 { ru8(d, h + 124) } else { 0 };
    let pit_ideal  = if d.len() > h + 653 { ru8(d, h + 653) } else { 0 };
    let pit_latest = if d.len() > h + 654 { ru8(d, h + 654) } else { 0 };
    let forecast_accuracy = if d.len() > h + 639 { ru8(d, h + 639) } else { 0 };

    let mut weather_forecast = Vec::new();
    if d.len() > h + 127 {
        let num = ru8(d, h + 126) as usize;
        for i in 0..num.min(64) {
            let fo = h + 127 + i * 8;
            if fo + 8 > d.len() { break; }
            weather_forecast.push(json!({
                "sessionType":    ru8(d, fo),
                "timeOffset":     ru8(d, fo + 1),
                "weather":        ru8(d, fo + 2),
                "trackTemp":      ri8(d, fo + 3),
                "trackTempChange":ri8(d, fo + 4),
                "airTemp":        ri8(d, fo + 5),
                "airTempChange":  ri8(d, fo + 6),
                "rainPercentage": ru8(d, fo + 7),
            }));
        }
    }

    Some(json!({
        "weather":               ru8(d, h),
        "trackTemperature":      ri8(d, h + 1),
        "airTemperature":        ri8(d, h + 2),
        "totalLaps":             ru8(d, h + 3),
        "trackLength":           ru16(d, h + 4),
        "sessionType":           ru8(d, h + 6),
        "trackId":               ri8(d, h + 7),
        "formula":               ru8(d, h + 8),
        "sessionTimeLeft":       ru16(d, h + 9),
        "sessionDuration":       ru16(d, h + 11),
        "pitSpeedLimit":         ru8(d, h + 13),
        "gamePaused":            ru8(d, h + 14),
        "isSpectating":          ru8(d, h + 15),
        "spectatorCarIndex":     ru8(d, h + 16),
        "safetyCarStatus":       safety_car_status,
        "numRedFlagPeriods":     if d.len() > h + 678 { ru8(d, h + 678) } else { 0 },
        "pitStopWindowIdealLap": pit_ideal,
        "pitStopWindowLatestLap":pit_latest,
        "weatherForecast":       weather_forecast,
        "forecastAccuracy":      forecast_accuracy,
    }))
}

// ── Lap Data (packet id 2) ────────────────────────────────────────────────────
pub fn parse_lap_data(d: &[u8]) -> Option<Value> {
    let h = HEADER_SIZE;
    let mut cars = Vec::new();
    for i in 0..MAX_CARS {
        let o = h + i * LAP_SIZE;
        if o + LAP_SIZE > d.len() { break; }
        let s1 = ru16(d, o + 8) as u32 + ru8(d, o + 10) as u32 * 60_000;
        let s2 = ru16(d, o + 11) as u32 + ru8(d, o + 13) as u32 * 60_000;
        cars.push(json!({
            "lastLapTimeMs":      ru32(d, o),
            "currentLapTimeMs":   ru32(d, o + 4),
            "sector1TimeMs":      s1,
            "sector2TimeMs":      s2,
            "deltaToCarAheadMs":  ru16(d, o + 14) as u32 + ru8(d, o + 16) as u32 * 60_000,
            "deltaToLeaderMs":    ru16(d, o + 17) as u32 + ru8(d, o + 19) as u32 * 60_000,
            "lapDistance":        rf32(d, o + 20),
            "totalDistance":      rf32(d, o + 24),
            "safetyCarDelta":     rf32(d, o + 28),
            "carPosition":        ru8(d, o + 32),
            "currentLapNum":      ru8(d, o + 33),
            "pitStatus":          ru8(d, o + 34),
            "numPitStops":        ru8(d, o + 35),
            "sector":             ru8(d, o + 36),
            "currentLapInvalid":  ru8(d, o + 37),
            "penalties":               ru8(d, o + 38),
            "totalWarnings":          ru8(d, o + 39),
            "cornerCuttingWarnings":  ru8(d, o + 40),
            "numUnservedDriveThroughPens": ru8(d, o + 41),
            "numUnservedStopGoPens":  ru8(d, o + 42),
            "gridPosition":           ru8(d, o + 43),
            "driverStatus":       ru8(d, o + 44),
            "resultStatus":       ru8(d, o + 45),
            "pitLaneTimerActive": ru8(d, o + 46),
        }));
    }
    if cars.is_empty() { None } else { Some(Value::Array(cars)) }
}

// ── Participants (packet id 4) ────────────────────────────────────────────────
pub fn parse_participants(d: &[u8]) -> Option<Value> {
    let h = HEADER_SIZE;
    if d.len() < h + 1 { return None; }
    let num = ru8(d, h) as usize;
    let mut list = Vec::new();
    for i in 0..num.min(MAX_CARS) {
        let o = h + 1 + i * PARTICIPANT_SIZE;
        if o + PARTICIPANT_SIZE > d.len() { break; }
        let name = {
            let raw = read_str(d, o + 7, 32);
            if raw.is_empty() { format!("Car {}", i + 1) } else { raw }
        };
        list.push(json!({
            "aiControlled": ru8(d, o),
            "driverId":     ru8(d, o + 1),
            "networkId":    ru8(d, o + 2),
            "teamId":       ru8(d, o + 3),
            "myTeam":       ru8(d, o + 4),
            "raceNumber":   ru8(d, o + 5),
            "nationality":  ru8(d, o + 6),
            "name":         name,
        }));
    }
    Some(json!({ "numActiveCars": num, "participants": list }))
}

// ── Car Telemetry (packet id 6) ───────────────────────────────────────────────
pub fn parse_car_telemetry(d: &[u8]) -> Option<Value> {
    let h = HEADER_SIZE;
    let mut cars = Vec::new();
    for i in 0..MAX_CARS {
        let o = h + i * TELEMETRY_SIZE;
        if o + TELEMETRY_SIZE > d.len() { break; }
        cars.push(json!({
            "speed":           ru16(d, o),
            "throttle":        rf32(d, o + 2),
            "steer":           rf32(d, o + 6),
            "brake":           rf32(d, o + 10),
            "clutch":          ru8(d, o + 14),
            "gear":            ri8(d, o + 15),
            "engineRPM":       ru16(d, o + 16),
            "drs":             ru8(d, o + 18),
            "revLightsPercent":ru8(d, o + 19),
            "brakesTemp":      [ru16(d,o+22),ru16(d,o+24),ru16(d,o+26),ru16(d,o+28)],
            "tyreSurfaceTemp": [ru8(d,o+30),ru8(d,o+31),ru8(d,o+32),ru8(d,o+33)],
            "tyreInnerTemp":   [ru8(d,o+34),ru8(d,o+35),ru8(d,o+36),ru8(d,o+37)],
            "engineTemp":      ru16(d, o + 38),
            "tyrePressure":    [rf32(d,o+40),rf32(d,o+44),rf32(d,o+48),rf32(d,o+52)],
            "surfaceType":     [ru8(d,o+56),ru8(d,o+57),ru8(d,o+58),ru8(d,o+59)],
        }));
    }
    if cars.is_empty() { None } else { Some(Value::Array(cars)) }
}

// ── Car Setup (packet id 5) ───────────────────────────────────────────────────
pub fn parse_car_setup(d: &[u8]) -> Option<Value> {
    let h = HEADER_SIZE;
    let mut cars = Vec::new();
    for i in 0..MAX_CARS {
        let o = h + i * SETUP_SIZE;
        if o + SETUP_SIZE > d.len() { break; }
        cars.push(json!({
            "frontWing":              ru8(d, o),
            "rearWing":               ru8(d, o + 1),
            "onThrottle":             ru8(d, o + 2),
            "offThrottle":            ru8(d, o + 3),
            "frontCamber":            rf32(d, o + 4),
            "rearCamber":             rf32(d, o + 8),
            "frontToe":               rf32(d, o + 12),
            "rearToe":                rf32(d, o + 16),
            "frontSuspension":        ru8(d, o + 20),
            "rearSuspension":         ru8(d, o + 21),
            "frontAntiRollBar":       ru8(d, o + 22),
            "rearAntiRollBar":        ru8(d, o + 23),
            "frontSuspensionHeight":  ru8(d, o + 24),
            "rearSuspensionHeight":   ru8(d, o + 25),
            "brakePressure":          ru8(d, o + 26),
            "brakeBias":              ru8(d, o + 27),
            "engineBraking":          ru8(d, o + 28),
            "rearLeftTyrePressure":   rf32(d, o + 29),
            "rearRightTyrePressure":  rf32(d, o + 33),
            "frontLeftTyrePressure":  rf32(d, o + 37),
            "frontRightTyrePressure": rf32(d, o + 41),
            "ballast":                ru8(d, o + 45),
            "fuelLoad":               rf32(d, o + 46),
        }));
    }
    let next_fw_off = h + MAX_CARS * SETUP_SIZE;
    let next_fw = if d.len() >= next_fw_off + 4 { rf32(d, next_fw_off) } else { 0.0 };
    Some(json!({ "carSetups": cars, "nextFrontWingValue": next_fw }))
}

// ── Car Status (packet id 7) ──────────────────────────────────────────────────
pub fn parse_car_status(d: &[u8]) -> Option<Value> {
    let h = HEADER_SIZE;
    let mut cars = Vec::new();
    for i in 0..MAX_CARS {
        let o = h + i * STATUS_SIZE;
        if o + STATUS_SIZE > d.len() { break; }
        cars.push(json!({
            "tractionControl":    ru8(d, o),
            "antiLockBrakes":     ru8(d, o + 1),
            "fuelMix":            ru8(d, o + 2),
            "frontBrakeBias":     ru8(d, o + 3),
            "pitLimiterStatus":   ru8(d, o + 4),
            "fuelInTank":         rf32(d, o + 5),
            "fuelCapacity":       rf32(d, o + 9),
            "fuelRemainingLaps":  rf32(d, o + 13),
            "maxRPM":             ru16(d, o + 17),
            "idleRPM":            ru16(d, o + 19),
            "maxGears":           ru8(d, o + 21),
            "drsAllowed":         ru8(d, o + 22),
            "drsActivationDist":  ru16(d, o + 23),
            "actualTyreCompound": ru8(d, o + 25),
            "visualTyreCompound": ru8(d, o + 26),
            "tyresAgeLaps":       ru8(d, o + 27),
            "vehicleFiaFlags":    ri8(d, o + 28),
            "enginePowerICE":     rf32(d, o + 29),
            "enginePowerMGUK":    rf32(d, o + 33),
            "ersStoreEnergy":     rf32(d, o + 37),
            "ersDeployMode":      ru8(d, o + 41),
            "ersHarvestedMGUK":   rf32(d, o + 42),
            "ersHarvestedMGUH":   rf32(d, o + 46),
            "ersDeployedThisLap": rf32(d, o + 50),
            "networkPaused":      ru8(d, o + 54),
        }));
    }
    if cars.is_empty() { None } else { Some(Value::Array(cars)) }
}

// ── Car Damage (packet id 10) ─────────────────────────────────────────────────
pub fn parse_car_damage(d: &[u8]) -> Option<Value> {
    let h = HEADER_SIZE;
    let mut cars = Vec::new();
    for i in 0..MAX_CARS {
        let o = h + i * DAMAGE_SIZE;
        if o + DAMAGE_SIZE > d.len() { break; }
        cars.push(json!({
            "tyresWear":           [rf32(d,o),rf32(d,o+4),rf32(d,o+8),rf32(d,o+12)],
            "tyresDamage":         [ru8(d,o+16),ru8(d,o+17),ru8(d,o+18),ru8(d,o+19)],
            "brakesDamage":        [ru8(d,o+20),ru8(d,o+21),ru8(d,o+22),ru8(d,o+23)],
            "tyreBlisters":        [ru8(d,o+24),ru8(d,o+25),ru8(d,o+26),ru8(d,o+27)],
            "frontLeftWingDamage": ru8(d, o + 28),
            "frontRightWingDamage":ru8(d, o + 29),
            "rearWingDamage":      ru8(d, o + 30),
            "floorDamage":         ru8(d, o + 31),
            "diffuserDamage":      ru8(d, o + 32),
            "sidepodDamage":       ru8(d, o + 33),
            "drsFault":            ru8(d, o + 34),
            "ersFault":            ru8(d, o + 35),
            "gearBoxDamage":       ru8(d, o + 36),
            "engineDamage":        ru8(d, o + 37),
            "engineMGUHWear":      ru8(d, o + 38),
            "engineESWear":        ru8(d, o + 39),
            "engineCEWear":        ru8(d, o + 40),
            "engineICEWear":       ru8(d, o + 41),
            "engineMGUKWear":      ru8(d, o + 42),
            "engineTCWear":        ru8(d, o + 43),
            "engineBlown":         ru8(d, o + 44),
            "engineSeized":        ru8(d, o + 45),
        }));
    }
    if cars.is_empty() { None } else { Some(Value::Array(cars)) }
}

// ── Events (packet id 3) ──────────────────────────────────────────────────────
pub fn parse_event(d: &[u8]) -> Option<Value> {
    let h = HEADER_SIZE;
    if d.len() < h + 4 { return None; }
    let code = std::str::from_utf8(&d[h..h + 4]).unwrap_or("????");
    match code {
        "FTLP" => Some(json!({
            "type": "FTLP",
            "vehicleIdx": ru8(d, h + 4),
            "lapTimeMs": (rf32(d, h + 5) * 1000.0).round() as u32,
        })),
        "SCAR" => Some(json!({
            "type": "SCAR",
            "safetyCarType": ru8(d, h + 4),
            "eventType": ru8(d, h + 5),
        })),
        "OVTK" => Some(json!({
            "type": "OVTK",
            "overtakingVehicleIdx": ru8(d, h + 4),
            "beingOvertakenVehicleIdx": ru8(d, h + 5),
        })),
        "PENA" => Some(json!({
            "type": "PENA",
            "penaltyType":     ru8(d, h + 4),
            "infringementType":ru8(d, h + 5),
            "vehicleIdx":      ru8(d, h + 6),
            "otherVehicleIdx": ru8(d, h + 7),
            "time":            ru8(d, h + 8),
            "lapNum":          ru8(d, h + 9),
            "placesGained":    ru8(d, h + 10),
        })),
        "RCMG" => Some(json!({
            "type": "RCMG",
            "vehicleIdx": ru8(d, h + 4),
            "flagType":   ru8(d, h + 5),
        })),
        "STLG" => Some(json!({
            "type": "STLG",
            "numLights": ru8(d, h + 4),
        })),
        "LGOT" => Some(json!({ "type": "LGOT" })),
        "CHQF" => Some(json!({ "type": "CHQF" })),
        "DRSE" => Some(json!({ "type": "DRSE" })),
        "DRSD" => Some(json!({ "type": "DRSD" })),
        "SSTA" => Some(json!({ "type": "SSTA" })),
        "SEND" => Some(json!({ "type": "SEND" })),
        c => Some(json!({ "type": c })),
    }
}

// ── Session History (packet id 11) ────────────────────────────────────────────
pub struct SessionHistory {
    pub car_idx: usize,
    pub best_lap_time_ms: u32,
    pub laps: Value, // array of lap entries
}

pub fn parse_session_history(d: &[u8]) -> Option<SessionHistory> {
    let h = HEADER_SIZE;
    if d.len() < h + 7 { return None; }
    let car_idx = ru8(d, h) as usize;
    let num_laps = ru8(d, h + 1) as usize;
    let best_lap_num = ru8(d, h + 3) as usize;
    let laps_start = h + 7;
    let mut best_ms = 0u32;
    let mut laps_arr: Vec<Value> = Vec::with_capacity(num_laps);
    for i in 0..num_laps.min(100) {
        let lap_off = laps_start + i * LAP_HISTORY_SIZE;
        if lap_off + LAP_HISTORY_SIZE > d.len() { break; }
        let lt = ru32(d, lap_off);
        let s1_ms = ru16(d, lap_off + 4) as u32;
        let s1_mins = ru8(d, lap_off + 6) as u32;
        let s2_ms = ru16(d, lap_off + 7) as u32;
        let s2_mins = ru8(d, lap_off + 9) as u32;
        let s3_ms = ru16(d, lap_off + 10) as u32;
        let s3_mins = ru8(d, lap_off + 12) as u32;
        let flags = ru8(d, lap_off + 13);
        laps_arr.push(json!({
            "lapNumber":    i + 1,
            "lapTimeMs":    lt,
            "sector1TimeMs": s1_ms + s1_mins * 60_000,
            "sector2TimeMs": s2_ms + s2_mins * 60_000,
            "sector3TimeMs": s3_ms + s3_mins * 60_000,
            "validFlags":   flags, // bit0=valid lap, 1=s1 valid, 2=s2 valid, 3=s3 valid
        }));
    }
    if best_lap_num > 0 && best_lap_num <= num_laps {
        let lap_off = laps_start + (best_lap_num - 1) * LAP_HISTORY_SIZE;
        if lap_off + 4 <= d.len() {
            best_ms = ru32(d, lap_off);
        }
    }
    Some(SessionHistory {
        car_idx,
        best_lap_time_ms: best_ms,
        laps: Value::Array(laps_arr),
    })
}
