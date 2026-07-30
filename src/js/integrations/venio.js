import { getCurrentUserIdToken } from '../auth.js';

export async function searchVenioEmployees(keyword, { skip = 0, pageLength = 20, signal } = {}) {
  const token = await getCurrentUserIdToken();
  const query = new URLSearchParams({
    keyword: keyword.trim(),
    skip: String(skip),
    pageLength: String(pageLength)
  });
  const response = await fetch(`/api/venio/employees?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    // The public error below intentionally hides internal response details.
  }
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to load employees. Please try again.');
  }
  if (!Array.isArray(payload?.employees)) {
    throw new Error('Unable to load employees. Please try again.');
  }
  return payload.employees;
}
