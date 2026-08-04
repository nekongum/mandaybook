import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = {
  location: { origin: 'http://127.0.0.1:3000' },
  addEventListener() {},
  postMessage() {}
};

const source = await readFile(new URL('./venioCallImport.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { validateVenioCallPayload } = await import(moduleUrl);

test('validates customer and implementor and recomputes total minutes', () => {
  const result = validateVenioCallPayload({
    customerId: 1718464,
    implementorUserId: 'user-1',
    totalCallMinutes: 999,
    activities: [
      { customerId: 1718464, implementorUserId: 'user-1', activityId: 1, durationMinutes: 2 },
      { customerId: 1718464, implementorUserId: 'user-1', activityId: 2, durationMinutes: 10 },
      { customerId: 1718464, implementorUserId: 'user-1', activityId: 2, durationMinutes: 10 }
    ]
  }, 1718464, 'user-1');
  assert.equal(result.totalCallMinutes, 12);
  assert.equal(result.activities.length, 2);
});

test('rejects a mismatched customer or implementor payload', () => {
  assert.throws(() => validateVenioCallPayload({
    customerId: 999,
    implementorUserId: 'user-1',
    activities: []
  }, 1718464, 'user-1'), /mismatched data/);
  assert.throws(() => validateVenioCallPayload({
    customerId: 1718464,
    implementorUserId: 'user-2',
    activities: []
  }, 1718464, 'user-1'), /mismatched data/);
});

test('rejects negative duration and ignores invalid activity records', () => {
  const result = validateVenioCallPayload({
    customerId: 1718464,
    implementorUserId: 'user-1',
    activities: [
      { customerId: 1718464, implementorUserId: 'user-1', activityId: 1, durationMinutes: -2 },
      { customerId: 1718464, implementorUserId: 'user-1', activityId: 2, durationMinutes: 5 }
    ]
  }, 1718464, 'user-1');
  assert.deepEqual(result.activities.map((item) => item.activityId), [2]);
  assert.equal(result.totalCallMinutes, 5);
});
