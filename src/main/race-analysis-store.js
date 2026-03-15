function createJsonReader(fs) {
  return function readJson(filePath, fallbackValue) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return fallbackValue;
    }
  };
}

function sanitizeSupabaseUrl(rawUrl) {
  return String(rawUrl || '').trim().replace(/\/+$/, '');
}

export function createRaceAnalysisStore({ app, fs, path }) {
  const readJson = createJsonReader(fs);

  function draftPath() {
    return path.join(app.getPath('userData'), 'race-analysis-draft.json');
  }

  function snapshotsPath() {
    return path.join(app.getPath('userData'), 'race-analysis-snapshots.json');
  }

  function writeJson(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  }

  function buildSnapshotMeta(record) {
    return {
      id: record.id,
      savedAt: record.savedAt,
      sessionSignature: record.sessionSignature,
      sessionLabel: record.sessionLabel,
      trackName: record.trackName,
      sessionTypeName: record.sessionTypeName,
      lapCount: record.lapCount,
      remoteSynced: record.remoteSynced === true,
      remoteError: record.remoteError || '',
    };
  }

  function loadDraft() {
    return readJson(draftPath(), null);
  }

  function saveDraft(draftPayload) {
    const savedAt = new Date().toISOString();
    const payload = {
      savedAt,
      analysis: draftPayload?.analysis || null,
    };
    writeJson(draftPath(), payload);
    return { success: true, savedAt };
  }

  function listSnapshots() {
    const records = readJson(snapshotsPath(), []);
    if (!Array.isArray(records)) return [];
    return records.map(buildSnapshotMeta);
  }

  async function syncSnapshotToSupabase(config, record) {
    if (!config?.remoteSyncEnabled) {
      return { skipped: true };
    }

    const supabaseUrl = sanitizeSupabaseUrl(config.supabaseUrl);
    const supabaseKey = String(config.supabaseKey || '').trim();
    const supabaseTable = String(config.supabaseTable || 'race_analysis_snapshots').trim();

    if (!supabaseUrl || !supabaseKey || !supabaseTable) {
      return { error: 'Supabase sync is enabled but the URL, key, or table is missing.' };
    }

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(supabaseTable)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify([{
          snapshot_id: record.id,
          session_signature: record.sessionSignature,
          session_label: record.sessionLabel,
          track_name: record.trackName,
          session_type_name: record.sessionTypeName,
          lap_count: record.lapCount,
          saved_at: record.savedAt,
          snapshot_json: record.snapshot,
        }]),
      });

      if (!response.ok) {
        const detail = await response.text();
        return { error: `Supabase sync failed (${response.status}): ${detail || response.statusText}` };
      }

      return { success: true };
    } catch (error) {
      return { error: error.message || 'Supabase sync failed.' };
    }
  }

  async function saveSnapshot(snapshotPayload, storageConfig) {
    const savedAt = new Date().toISOString();
    const records = readJson(snapshotsPath(), []);
    const list = Array.isArray(records) ? records : [];
    const record = {
      id: `snapshot-${Date.now()}`,
      savedAt,
      sessionSignature: snapshotPayload?.sessionSignature || null,
      sessionLabel: snapshotPayload?.sessionLabel || 'Race Analysis',
      trackName: snapshotPayload?.trackName || '',
      sessionTypeName: snapshotPayload?.sessionTypeName || '',
      lapCount: Array.isArray(snapshotPayload?.completedLaps) ? snapshotPayload.completedLaps.length : 0,
      snapshot: snapshotPayload,
      remoteSynced: false,
      remoteError: '',
    };

    const remoteResult = await syncSnapshotToSupabase(storageConfig, record);
    if (remoteResult?.success) {
      record.remoteSynced = true;
    }
    if (remoteResult?.error) {
      record.remoteError = remoteResult.error;
    }

    list.unshift(record);
    writeJson(snapshotsPath(), list.slice(0, 25));

    const remoteLabel = record.remoteSynced
      ? ' Supabase sync complete.'
      : record.remoteError
        ? ` Remote sync skipped: ${record.remoteError}`
        : '';

    return {
      success: true,
      savedAt,
      message: `Snapshot saved locally.${remoteLabel}`.trim(),
      snapshots: listSnapshots(),
    };
  }

  return {
    loadDraft,
    saveDraft,
    listSnapshots,
    saveSnapshot,
  };
}
