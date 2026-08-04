(function exposeVenioCallParser(root) {
  'use strict';

  const CALL_TYPE_CODE = 110011;

  function recordsFromPayload(payload) {
    const records = [];
    const visited = new WeakSet();

    function visit(value) {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object' || visited.has(value)) return;
      visited.add(value);

      if (
        Object.hasOwn(value, 'conversationId') ||
        Object.hasOwn(value, 'type') ||
        Object.hasOwn(value, 'typeName')
      ) records.push(value);

      // Venio returns calls both directly and nested inside Task detail payloads.
      if (Object.hasOwn(value, 'data')) visit(value.data);
      if (Object.hasOwn(value, 'value')) visit(value.value);
      if (Object.hasOwn(value, 'conversation')) visit(value.conversation);
    }

    visit(payload);
    return records;
  }

  function sanitizeRecord(record, requestedCustomerId) {
    if (!record || typeof record !== 'object') return null;
    const isCall = record.type === CALL_TYPE_CODE ||
      (record.type === null || record.type === undefined) && record.typeName === 'Call';
    if (!isCall) return null;

    const activityId = Number(record.conversationId);
    const customerId = Number(record.customerId ?? record.customer?.customerId ?? requestedCustomerId);
    const expectedCustomerId = Number(requestedCustomerId);
    const hasExpectedCustomerId = Number.isSafeInteger(expectedCustomerId) && expectedCustomerId > 0;
    const implementorUserId = typeof record.createdByUserId === 'string'
      ? record.createdByUserId.trim()
      : '';
    const durationMinutes = Number(record.callMinutes);
    if (
      !Number.isSafeInteger(activityId) || activityId <= 0 ||
      !Number.isSafeInteger(customerId) || customerId <= 0 ||
      hasExpectedCustomerId && customerId !== expectedCustomerId ||
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

  function sanitizeResponses(payload) {
    const capturesByCustomerId = new Map();
    const seenActivities = new Set();

    recordsFromPayload(payload).forEach((record) => {
      const activity = sanitizeRecord(record);
      if (!activity) return;
      const activityKey = `${activity.customerId}:${activity.activityId}`;
      if (seenActivities.has(activityKey)) return;
      seenActivities.add(activityKey);
      if (!capturesByCustomerId.has(activity.customerId)) {
        capturesByCustomerId.set(activity.customerId, {
          customerId: activity.customerId,
          activities: []
        });
      }
      capturesByCustomerId.get(activity.customerId).activities.push(activity);
    });

    return [...capturesByCustomerId.values()];
  }

  const api = { recordsFromPayload, sanitizeRecord, sanitizeResponse, sanitizeResponses };
  root.VenioCallParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
