(function exposeVenioCallParser(root) {
  'use strict';

  const CALL_TYPE_CODE = 110011;

  function recordsFromPayload(payload) {
    const data = payload?.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.value)) return data.value;
    if (data && typeof data === 'object') return [data];
    if (Array.isArray(payload)) return payload;
    return [];
  }

  function sanitizeRecord(record, requestedCustomerId) {
    if (!record || typeof record !== 'object') return null;
    const isCall = record.type === CALL_TYPE_CODE ||
      (record.type === null || record.type === undefined) && record.typeName === 'Call';
    if (!isCall) return null;

    const activityId = Number(record.conversationId);
    const customerId = Number(record.customerId ?? record.customer?.customerId ?? requestedCustomerId);
    const implementorUserId = typeof record.createdByUserId === 'string'
      ? record.createdByUserId.trim()
      : '';
    const durationMinutes = Number(record.callMinutes);
    if (
      !Number.isSafeInteger(activityId) || activityId <= 0 ||
      !Number.isSafeInteger(customerId) || customerId <= 0 ||
      customerId !== requestedCustomerId ||
      !implementorUserId ||
      !Number.isFinite(durationMinutes) || durationMinutes < 0
    ) return null;

    return {
      customerId,
      implementorUserId,
      activityId,
      activityDate: typeof record.dateConversation === 'string' ? record.dateConversation : '',
      durationMinutes
    };
  }

  function sanitizeResponse(payload, requestedCustomerId) {
    const records = recordsFromPayload(payload);
    const seen = new Set();
    const activities = records
      .map((record) => sanitizeRecord(record, requestedCustomerId))
      .filter((activity) => {
        if (!activity || seen.has(activity.activityId)) return false;
        seen.add(activity.activityId);
        return true;
      });
    return {
      customerId: requestedCustomerId,
      activities
    };
  }

  const api = { recordsFromPayload, sanitizeRecord, sanitizeResponse };
  root.VenioCallParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
