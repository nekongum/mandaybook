/**
 * utils.js
 * Pure helper functions — no side effects, no DOM access.
 * These can be tested in isolation and reused anywhere.
 */

import { state } from './state.js';

/**
 * Parse a string to a number, returning a fallback if invalid.
 * @param {*} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function num(value, fallback = 0) {
  const n = parseFloat(value);
  return isNaN(n) ? fallback : n;
}

/**
 * Format a number to a fixed number of decimals.
 * @param {number} n
 * @param {number} [decimals=2]
 * @returns {string}
 */
export function fmt(n, decimals = 2) {
  return Number(n).toFixed(decimals);
}

/**
 * Convert an actual log row (with hours and minutes) into decimal hours.
 * @param {{hours: any, minutes: any}} row
 * @returns {number}
 */
export function totalHrs(row) {
  return num(row.hours) + num(row.minutes) / 60;
}

/**
 * Format hours and minutes into a standard string like "2h 30m" or "0h".
 * Also supports legacy decimal hour entries.
 * @param {any} hours
 * @param {any} minutes
 * @returns {string}
 */
export function formatHrsMins(hours, minutes) {
  const totalMins = Math.round(num(hours) * 60 + num(minutes));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) {
    return `${h} hr. ${m} min.`;
  } else if (h > 0) {
    return `${h} hr.`;
  } else if (m > 0) {
    return `${m} min.`;
  } else {
    return '0 hr.';
  }
}

/**
 * Convert hours into mandays using the current project setting.
 * @param {number} hours
 * @returns {number}
 */
export function mandays(hours) {
  const hpm = num(state.project.hoursPerManday, 8);
  return hpm > 0 ? hours / hpm : 0;
}

/**
 * Escape HTML special characters before inserting into innerHTML.
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

/**
 * Format an ISO date string ("2026-01-15") to "15 Jan 26" for display.
 * @param {string} d
 * @returns {string}
 */
export function formatDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit'
    });
  } catch {
    return d;
  }
}

/**
 * Return the human-readable status word for a utilization ratio.
 * Thresholds match those used in the UI and PDF report.
 * @param {number} pct  Utilization ratio (0..1+).
 * @returns {string}
 */
export function getStatusText(pct) {
  if (pct >= 1) return 'Over Budget';
  if (pct >= 0.9) return 'Near Limit';
  if (pct >= 0.7) return 'On Track';
  return 'Healthy';
}

/**
 * Build a safe filename base from project name + today's date.
 * @returns {string}
 */
export function fileBase() {
  const name = (state.project.name || 'project')
    .replace(/[^a-z0-9ก-๙]/gi, '_')
    .toLowerCase();
  return `mandaybook_${name}_${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Convert a hex color (#rrggbb) to an [r, g, b] tuple.
 * @param {string} hex
 * @returns {number[]}
 */
export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/**
 * Lighten an [r, g, b] tuple by mixing with white.
 * @param {number[]} rgb
 * @param {number} amount  0..1 — amount of white to mix in.
 * @returns {number[]}
 */
export function lighten(rgb, amount) {
  return rgb.map((c) => Math.min(255, Math.round(c + (255 - c) * amount)));
}

/**
 * Darken an [r, g, b] tuple by multiplying each channel.
 * @param {number[]} rgb
 * @param {number} amount  0..1 — survival ratio (0.8 = 20% darker).
 * @returns {number[]}
 */
export function darken(rgb, amount) {
  return rgb.map((c) => Math.round(c * amount));
}
