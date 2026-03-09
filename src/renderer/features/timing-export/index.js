import { csvEscape, safeFilePart, fmt, fmtSector, computeSector3Time } from '../../shared/formatting.js';

export function createTimingExportFeature(deps) {
  const {
    state,
    TRACK_NAMES,
    getClassificationCars,
    tyreCompoundLabel,
    raceStatusLabel,
    windowApi,
    getCurrentListenPort,
    setStatusText,
  } = deps;

  function buildTimingExportRows() {
    const lapData = state.lapData;
    const participants = state.participants?.participants;
    const statuses = state.allCarStatus;
    if (!Array.isArray(lapData) || lapData.length === 0) return [];

    const cars = getClassificationCars(lapData);
    return cars.map((car) => {
      const participant = participants?.[car.idx];
      const status = statuses?.[car.idx];
      return {
        position: car.carPosition || '',
        driver: participant?.name || `Car ${car.idx + 1}`,
        teamId: participant?.teamId ?? '',
        aiControlled: participant?.aiControlled ?? '',
        lastLap: fmt(car.lastLapTimeMs),
        bestLap: fmt(state.bestLapTimes?.[car.idx] || 0),
        sector1: fmtSector(car.sector1TimeMs),
        sector2: fmtSector(car.sector2TimeMs),
        sector3: fmtSector(computeSector3Time(car)),
        gapToLeaderSec: car.carPosition === 1 ? 0 : +((car.deltaToLeaderMs || 0) / 1000).toFixed(3),
        intervalSec: car.carPosition === 1 ? 0 : +((car.deltaToCarAheadMs || 0) / 1000).toFixed(3),
        tyre: tyreCompoundLabel(status),
        tyreAgeLaps: status?.tyresAgeLaps ?? '',
        pitStops: car.numPitStops ?? '',
        status: raceStatusLabel(car),
        lap: car.currentLapNum ?? '',
        resultStatus: car.resultStatus ?? '',
      };
    });
  }

  function buildTimingExportCsv() {
    const rows = buildTimingExportRows();
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.map(csvEscape).join(','),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
    ];
    return lines.join('\n');
  }

  function buildTimingExportJson() {
    const rows = buildTimingExportRows();
    const session = state.session || {};
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      trackId: session.trackId ?? null,
      trackName: session.trackName || TRACK_NAMES[session.trackId] || null,
      sessionType: session.sessionTypeName || null,
      listenPort: getCurrentListenPort(),
      rows,
    }, null, 2);
  }

  async function exportTimingData(format = 'csv') {
    const session = state.session || {};
    const trackPart = safeFilePart(session.trackName || TRACK_NAMES[session.trackId], 'track');
    const sessionPart = safeFilePart(session.sessionTypeName, 'session');
    const baseName = `race-engineer-${trackPart}-${sessionPart}-timing`;
    const content = format === 'json' ? buildTimingExportJson() : buildTimingExportCsv();
    if (!content) {
      setStatusText('No timing data to export.');
      return;
    }

    const result = await windowApi.saveExportFile({
      content,
      defaultName: `${baseName}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });

    if (result?.success) setStatusText(`Exported to ${result.filePath}`);
    else if (result?.cancelled) setStatusText('Export cancelled.');
    else setStatusText(result?.error || 'Export failed.');

    setTimeout(() => {
      setStatusText('');
    }, 4000);
  }

  return {
    buildTimingExportRows,
    buildTimingExportCsv,
    buildTimingExportJson,
    exportTimingData,
  };
}
