const RESPONSE_TYPE = 'VENIO_EXTENSION_RESPONSE';
const REQUEST_TIMEOUT_MS = 6000;
const pendingRequests = new Map();

function handleExtensionResponse(event) {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    event.data?.type !== RESPONSE_TYPE
  ) return;

  const pending = pendingRequests.get(event.data.requestId);
  if (!pending) return;
  pendingRequests.delete(event.data.requestId);
  clearTimeout(pending.timeoutId);
  if (!event.data.ok) {
    pending.reject(new Error(event.data.error || 'Venio extension is unavailable.'));
    return;
  }
  pending.resolve(event.data.payload);
}

window.addEventListener('message', handleExtensionResponse);

function requestExtension(type, payload = null) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Venio extension did not respond.'));
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(requestId, { resolve, reject, timeoutId });
    window.postMessage({ type, requestId, payload }, window.location.origin);
  });
}

function positiveInteger(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

export async function getLatestVenioCustomerContext() {
  const payload = await requestExtension('VENIO_CUSTOMER_CONTEXT_REQUEST');
  const customerId = Number(payload?.customerId);
  if (!positiveInteger(customerId)) return null;
  return { customerId };
}

export async function importVenioCallTime(customerId, implementorUserId) {
  const expectedCustomerId = Number(customerId);
  const expectedUserId = typeof implementorUserId === 'string' ? implementorUserId.trim() : '';
  if (!positiveInteger(expectedCustomerId) || !expectedUserId) {
    throw new Error('Select a linked Venio customer and implementor first.');
  }

  const payload = await requestExtension('VENIO_CALL_TIME_IMPORT_REQUEST', {
    customerId: expectedCustomerId,
    implementorUserId: expectedUserId
  });
  if (!payload) return { totalCallMinutes: 0, activities: [] };
  return validateVenioCallPayload(payload, expectedCustomerId, expectedUserId);
}

export function validateVenioCallPayload(payload, expectedCustomerId, expectedUserId) {
  if (
    Number(payload.customerId) !== expectedCustomerId ||
    payload.implementorUserId !== expectedUserId ||
    !Array.isArray(payload.activities)
  ) {
    throw new Error('Venio extension returned mismatched data.');
  }

  const seen = new Set();
  const activities = payload.activities.reduce((result, activity) => {
    const activityId = Number(activity?.activityId);
    const durationMinutes = Number(activity?.durationMinutes);
    if (
      !positiveInteger(activityId) ||
      seen.has(activityId) ||
      Number(activity?.customerId) !== expectedCustomerId ||
      activity?.implementorUserId !== expectedUserId ||
      !Number.isFinite(durationMinutes) || durationMinutes < 0 || durationMinutes > 1440
    ) return result;
    seen.add(activityId);
    result.push({
      activityId,
      activityDate: typeof activity.activityDate === 'string' ? activity.activityDate : '',
      durationMinutes
    });
    return result;
  }, []);

  return {
    totalCallMinutes: activities.reduce((sum, activity) => sum + activity.durationMinutes, 0),
    activities
  };
}
