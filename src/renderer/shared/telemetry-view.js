export function getRaceStatusMeta(car) {
  if (!car) return null;
  if (car.driverStatus === 0 && car.resultStatus <= 2) {
    return { label: 'GAR', title: 'Garage', className: 'out' };
  }
  switch (car.resultStatus) {
    case 3: return { label: 'FIN', title: 'Finished', className: 'finished' };
    case 4: return { label: 'DNF', title: 'Did Not Finish', className: 'dnf' };
    case 5: return { label: 'DSQ', title: 'Disqualified', className: 'out' };
    case 6: return { label: 'NC', title: 'Not Classified', className: 'out' };
    case 7: return { label: 'RET', title: 'Retired', className: 'dnf' };
    default: return null;
  }
}

export function renderRaceStatusBadge(car) {
  const meta = getRaceStatusMeta(car);
  return meta ? `<span class="status-badge ${meta.className}" title="${meta.title}">${meta.label}</span>` : '';
}

export function controlLabel(participant, isPlayer) {
  if (isPlayer) return 'YOU';
  return participant?.aiControlled ? 'AI' : 'HUM';
}

export function renderControlBadge(participant, isPlayer) {
  const label = controlLabel(participant, isPlayer).toLowerCase();
  return `<span class="mini-badge ${label}">${controlLabel(participant, isPlayer)}</span>`;
}

export function getClassificationCars(lapData) {
  if (!Array.isArray(lapData)) return [];
  return lapData
    .map((car, idx) => ({ ...car, idx }))
    .filter((car) => car && car.carPosition > 0)
    .sort((a, b) => (a.carPosition || 99) - (b.carPosition || 99));
}

export function getTrackMapVisibleCars(lapData) {
  if (!Array.isArray(lapData)) return [];
  return lapData
    .map((car, idx) => ({ ...car, idx }))
    .filter((car) => car && car.carPosition > 0 && Number.isFinite(car.lapDistance))
    .sort((a, b) => (a.carPosition || 99) - (b.carPosition || 99));
}
