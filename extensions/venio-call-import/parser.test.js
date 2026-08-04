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
