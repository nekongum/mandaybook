/**
 * integrations/yeastar.js
 * Yeastar P-Series PBX integration — fetch CDR and convert to actual work rows.
 */

const CONFIG_KEY = 'yeastarConfig';
const SYNCED_IDS_KEY = 'yeastarSyncedIds';

export function getYeastarConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveYeastarConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function getSyncedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SYNCED_IDS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markSynced(ids) {
  const existing = getSyncedIds();
  ids.forEach(id => existing.add(id));
  // Keep only the last 2000 IDs to avoid unbounded growth
  const arr = [...existing].slice(-2000);
  localStorage.setItem(SYNCED_IDS_KEY, JSON.stringify(arr));
}

/**
 * Authenticate with Yeastar P-Series PBX.
 * Returns the auth token on success.
 */
export async function yeastarLogin(config) {
  const url = `${config.pbxUrl.replace(/\/$/, '')}/api/v1.0/user/login`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: config.username, password: config.password })
    });
  } catch (e) {
    throw new Error(`Cannot reach PBX (${e.message}). Check URL and network access.`);
  }
  if (!res.ok) throw new Error(`PBX returned HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'Success') throw new Error(data.message || 'Login failed');
  return data.token;
}

/**
 * Fetch CDR from Yeastar for the given extension and date range.
 */
export async function fetchCDR(config, token, dateFrom, dateTo) {
  const base = config.pbxUrl.replace(/\/$/, '');
  const url = `${base}/api/v1.0/cdr/search?token=${encodeURIComponent(token)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        num: config.extension,
        call_start_time_from: `${dateFrom} 00:00:00`,
        call_start_time_to: `${dateTo} 23:59:59`,
        call_status: 'Answered',
        page: 1,
        page_size: 500
      })
    });
  } catch (e) {
    throw new Error(`CDR fetch failed (${e.message})`);
  }
  if (!res.ok) throw new Error(`CDR API returned HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'Success') throw new Error(data.message || 'CDR fetch failed');
  return data.data?.cdr_list || [];
}

/**
 * Return true if the other party's name or number matches any configured contact.
 * contacts = [{name, phone}, ...]. If empty, allow all calls.
 */
function matchesContacts(other, contacts) {
  if (!contacts || contacts.length === 0) return true;
  const otherLower = (other || '').toLowerCase().replace(/\D/g, '') || (other || '').toLowerCase();
  return contacts.some(c => {
    if (c.name && (other || '').toLowerCase().includes(c.name.toLowerCase())) return true;
    if (c.phone) {
      const phone = c.phone.replace(/\D/g, '');
      if (phone && otherLower.includes(phone)) return true;
    }
    return false;
  });
}

/**
 * Convert CDR records to actual-work row objects.
 * Skips records that have already been synced (by ID).
 * Returns { rows, newIds, skipped }.
 */
export function convertCDRToRows(calls, extension, contacts) {
  const synced = getSyncedIds();
  const rows = [];
  const newIds = [];
  let skipped = 0;

  for (const c of calls) {
    const duration = parseInt(c.talk_duration ?? c.duration ?? 0, 10);
    if (duration <= 0) continue;

    const callId = c.cdr_id
      || `${c.call_start_time || c.time_start}_${c.caller}_${c.callee}`;

    if (synced.has(callId)) {
      skipped++;
      continue;
    }

    const isOutgoing = String(c.caller || '').replace(/[^0-9]/g, '')
                        === String(extension || '').replace(/[^0-9]/g, '');
    const other = isOutgoing
      ? (c.callee_name || c.callee || '')
      : (c.caller_name || c.caller || '');

    if (!matchesContacts(other, contacts)) continue;

    const dateStr = (c.call_start_time || c.time_start || '').slice(0, 10);
    const hours = Math.floor(duration / 3600);
    const minutes = Math.round((duration % 3600) / 60);

    rows.push({
      task: 'Phone Call',
      date: dateStr,
      hours,
      minutes: minutes || 0,
      stakeholder: other,
      createdAt: new Date().toISOString(),
      _yeastarId: callId
    });
    newIds.push(callId);
  }

  return { rows, newIds, skipped };
}

/**
 * Full sync flow: login → fetch CDR → convert → return new rows.
 * Call this from main.js. Caller is responsible for adding rows to state.
 */
export async function syncYeastarCalls(config, dateFrom, dateTo, contacts = []) {
  const token = await yeastarLogin(config);
  const calls = await fetchCDR(config, token, dateFrom, dateTo);
  const { rows, newIds, skipped } = convertCDRToRows(calls, config.extension, contacts);
  if (newIds.length > 0) markSynced(newIds);
  return { rows, skipped, total: calls.length };
}
