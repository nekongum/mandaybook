const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('./parser.js');

function call(overrides = {}) {
  return {
    createdByUserId: 'user-1',
    typeName: 'Call',
    type: 110011,
    customerName: 'Example Company',
    conversationId: 1002819,
    dateConversation: '2026-07-31T18:10:12',
    callMinutes: 4,
    customerId: 1718464,
    description: 'must not leave the Venio page',
    contact: { mobile: 'secret' },
    ...overrides
  };
}

test('extracts only confirmed call fields from a single CustomerConversation response', () => {
  assert.deepEqual(parser.sanitizeResponse({ data: call() }, 1718464), {
    customerId: 1718464,
    activities: [{
      customerId: 1718464,
      implementorUserId: 'user-1',
      activityId: 1002819,
      activityKind: 'call',
      activityDate: '2026-07-31T18:10:12',
      durationMinutes: 4
    }]
  });
});

test('filters non-call, mismatched customer, negative duration, and duplicate activity records', () => {
  const result = parser.sanitizeResponse({ data: [
    call(),
    call(),
    call({ conversationId: 2, type: 999, typeName: 'Meeting' }),
    call({ conversationId: 3, customerId: 999 }),
    call({ conversationId: 4, callMinutes: -1 })
  ] }, 1718464);
  assert.equal(result.activities.length, 1);
});

test('supports data.value pagination envelopes without forwarding notes or contacts', () => {
  const result = parser.sanitizeResponse({ data: { value: [call()] } }, 1718464);
  assert.equal(result.activities.length, 1);
  assert.equal('description' in result.activities[0], false);
  assert.equal('contact' in result.activities[0], false);
  assert.equal('customerName' in result, false);
});

test('extracts a call nested inside a Conversation Followup task', () => {
  const result = parser.sanitizeResponse({
    data: {
      taskId: 600768,
      subject: 'Conversation Followup',
      customerId: 1718464,
      conversation: call({ conversationId: 1002657, callMinutes: 2 })
    }
  }, 1718464);

  assert.deepEqual(result.activities.map(({ activityId, durationMinutes }) => ({
    activityId,
    durationMinutes
  })), [{ activityId: 1002657, durationMinutes: 2 }]);
});

test('groups captures by the customer ID in each call instead of an API URL ID', () => {
  const captures = parser.sanitizeResponses([
    call({
      createdByUserId: '01a4fa05-8e5d-4494-af3c-f8a99e5eb57b',
      conversationId: 924472,
      customerId: 1612636,
      callMinutes: 12
    }),
    call({ conversationId: 2000001, customerId: 1718464 }),
    call({ conversationId: 2000001, customerId: 1718464 })
  ]);

  assert.deepEqual(captures.map((capture) => ({
    customerId: capture.customerId,
    activityIds: capture.activities.map((activity) => activity.activityId)
  })), [
    { customerId: 1612636, activityIds: [924472] },
    { customerId: 1718464, activityIds: [2000001] }
  ]);
});

test('calculates meeting duration from feed start and end timestamps', () => {
  const captures = parser.sanitizeResponses({
    data: [{
      type: 210016,
      refId: '3104988',
      userId: '5587e171-cacf-4d5e-95cc-d7c51d54004b',
      customerId: 1766750,
      description: 'must not leave the Venio page',
      feedItem: {
        title: 'Customer onboarding',
        dateStart: '2026-06-29T14:00:00+0700',
        dateEnd: '2026-06-29T15:30:00+0700'
      }
    }]
  });

  assert.deepEqual(captures, [{
    customerId: 1766750,
    activities: [{
      customerId: 1766750,
      implementorUserId: '5587e171-cacf-4d5e-95cc-d7c51d54004b',
      activityId: 3104988,
      activityKind: 'meeting',
      activityDate: '2026-06-29T14:00:00+0700',
      durationMinutes: 90
    }]
  }]);
});

test('rejects meetings with missing or reversed timestamps', () => {
  const meeting = {
    type: 210016,
    refId: '3104988',
    userId: 'user-1',
    customerId: 1766750,
    feedItem: {
      dateStart: '2026-06-29T15:30:00+0700',
      dateEnd: '2026-06-29T14:00:00+0700'
    }
  };
  assert.deepEqual(parser.sanitizeResponses([meeting]), []);
  assert.deepEqual(parser.sanitizeResponses([{ ...meeting, feedItem: {} }]), []);
});

test('imports only completed meeting reports and ignores plans', () => {
  const planned = {
    type: 210001,
    refId: '3096671',
    userId: '5587e171-cacf-4d5e-95cc-d7c51d54004b',
    customerId: 1766750,
    feedItem: {
      statusName: 'PendingReport',
      dateStart: '2026-06-22T15:00:00+0700',
      dateEnd: '2026-06-22T16:00:00+0700'
    }
  };
  const assignedPlan = { ...planned, type: 210002, refId: '3092603' };
  const reported = {
    ...planned,
    type: 210016,
    feedItem: {
      statusName: 'Create Activity Report',
      dateStart: '2026-06-22T15:00:00+0700',
      dateEnd: '2026-06-22T16:30:00+0700'
    }
  };

  const captures = parser.sanitizeResponses({ data: [planned, assignedPlan, reported] });
  assert.deepEqual(captures[0].activities.map((activity) => ({
    activityId: activity.activityId,
    durationMinutes: activity.durationMinutes
  })), [{ activityId: 3096671, durationMinutes: 90 }]);
});
