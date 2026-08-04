const STORAGE_KEY = 'venioCallCapturesByCustomerId';
const MAX_CUSTOMERS = 100;
const MAX_ACTIVITIES_PER_CUSTOMER = 5000;

function validPositiveInteger(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function sanitizeCapture(payload) {
  const customerId = Number(payload?.customerId);
  if (!validPositiveInteger(customerId) || !Array.isArray(payload?.activities)) return null;

  const seen = new Set();
  const activities = payload.activities.reduce((result, item) => {
    const activityId = Number(item?.activityId);
    const durationMinutes = Number(item?.durationMinutes);
    const implementorUserId = typeof item?.implementorUserId === 'string'
      ? item.implementorUserId.trim()
      : '';
    if (
      !validPositiveInteger(activityId) ||
      seen.has(activityId) ||
      Number(item?.customerId) !== customerId ||
      !implementorUserId ||
      !Number.isFinite(durationMinutes) || durationMinutes < 0 || durationMinutes > 1440
    ) return result;
    seen.add(activityId);
    result.push({
      customerId,
      implementorUserId,
      activityId,
      activityDate: typeof item.activityDate === 'string' ? item.activityDate : '',
      durationMinutes
    });
    return result;
  }, []);

  return {
    customerId,
    activities,
    capturedAt: Date.now()
  };
}

async function storeCapture(payload) {
  const capture = sanitizeCapture(payload);
  if (!capture) return { ok: false };

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const cache = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === 'object'
    ? stored[STORAGE_KEY]
    : {};
  const existing = cache[capture.customerId]?.activities || [];
  const byActivityId = new Map(existing.map((activity) => [activity.activityId, activity]));
  capture.activities.forEach((activity) => byActivityId.set(activity.activityId, activity));
  capture.activities = [...byActivityId.values()].slice(-MAX_ACTIVITIES_PER_CUSTOMER);
  cache[capture.customerId] = capture;

  const retained = Object.entries(cache)
    .sort(([, a], [, b]) => (b.capturedAt || 0) - (a.capturedAt || 0))
    .slice(0, MAX_CUSTOMERS);
  await chrome.storage.local.set({ [STORAGE_KEY]: Object.fromEntries(retained) });
  return { ok: true };
}

async function getLatestContext() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const captures = Object.values(stored[STORAGE_KEY] || {});
  const latest = captures.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0))[0];
  if (!latest) return null;
  return { customerId: latest.customerId };
}

async function getCallData(customerId, implementorUserId) {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const capture = stored[STORAGE_KEY]?.[Number(customerId)];
  if (!capture) return null;

  const activities = capture.activities.filter(
    (activity) => activity.implementorUserId === implementorUserId
  );
  return {
    customerId: Number(customerId),
    implementorUserId,
    totalCallMinutes: activities.reduce((sum, activity) => sum + activity.durationMinutes, 0),
    activities
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === 'STORE_VENIO_CALL_CAPTURE') {
      sendResponse(await storeCapture(message.payload));
      return;
    }
    if (message?.type === 'GET_LATEST_VENIO_CUSTOMER') {
      sendResponse({ ok: true, payload: await getLatestContext() });
      return;
    }
    if (message?.type === 'GET_VENIO_CALL_DATA') {
      const customerId = Number(message.customerId);
      const implementorUserId = typeof message.implementorUserId === 'string'
        ? message.implementorUserId.trim()
        : '';
      if (!validPositiveInteger(customerId) || !implementorUserId) {
        sendResponse({ ok: false, error: 'Invalid import request.' });
        return;
      }
      sendResponse({ ok: true, payload: await getCallData(customerId, implementorUserId) });
      return;
    }
    sendResponse({ ok: false, error: 'Unsupported request.' });
  })().catch(() => sendResponse({ ok: false, error: 'Extension storage is unavailable.' }));
  return true;
});
