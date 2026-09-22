import { makeDesignRecord, readDesignRecord, runRecord } from './designfile.js';

export const HISTORY_KEY = 'evtol_design_history';
export const MAX_HISTORY = 20;

/* Each entry now carries a full design record (lib/designfile.js). The
   headline numbers on the timeline are taken from the run behind that
   record, not from the on-screen result, which can lag the inputs.
   Returns { ok, error } — the old version swallowed every failure, so a full
   localStorage (quota) looked exactly like a successful save. */
export function saveVersionToHistory(params, SR, customAirfoil = null) {
  try {
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const design = makeDesignRecord({ params, customAirfoil, name: `v${hist.length+1}` });
    let R = null;
    try { R = runRecord(design); } catch { R = SR || null; }
    const entry = {
      id: Date.now(),
      ts: design.savedAt,
      label: `v${hist.length+1}`,
      MTOW: Number(R?.MTOW||0).toFixed(0),
      range: Number(R?.range_km||params.range||0).toFixed(0),
      bWing: Number(R?.bWing||0).toFixed(2),
      SM: Number((R?.SM_vt||R?.SM||0)*100).toFixed(1),
      Etot: Number(R?.Etot||0).toFixed(1),
      payload: params.payload,
      note: '',
      params: JSON.stringify(design.inputs),
      design,
    };
    hist.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, MAX_HISTORY)));
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/* Entries written before design records carry only `params`. */
export function recordFromHistoryEntry(entry) {
  if (entry?.design) return readDesignRecord(entry.design);
  return readDesignRecord(JSON.parse(entry?.params || '{}'));
}
