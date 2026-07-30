/**
 * render/quickStats.js
 * Today / This week / This month rollups under the Actual Log table.
 */

import { state } from '../state.js';
import { fmt, totalHrs, mandays, formatHrsMins } from '../utils.js';

/**
 * Recompute and display the three quick-stat rollups.
 */
export function renderQuickStats() {
  const todayEl = document.getElementById('qsToday');
  const weekEl  = document.getElementById('qsWeek');
  const monthEl = document.getElementById('qsMonth');
  if (!todayEl || !weekEl || !monthEl) return;

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);

  // Start of this week (Monday)
  const weekStart = new Date(now);
  const dayOffset = (weekStart.getDay() + 6) % 7;   // Mon=0, Sun=6
  weekStart.setDate(weekStart.getDate() - dayOffset);
  weekStart.setHours(0, 0, 0, 0);

  // Start of this month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let todayCount = 0, todayHrs = 0;
  let weekCount = 0, weekHrs = 0;
  let monthCount = 0, monthHrs = 0;

  state.actual.forEach((row) => {
    if (!row.date) return;
    const tH = totalHrs(row);
    // Skip blank rows
    if (!row.task && tH === 0) return;

    if (row.date === todayISO) {
      todayCount++;
      todayHrs += tH;
    }
    const rowDate = new Date(row.date);
    if (!isNaN(rowDate.getTime())) {
      if (rowDate >= weekStart) {
        weekCount++;
        weekHrs += tH;
      }
      if (rowDate >= monthStart) {
        monthCount++;
        monthHrs += tH;
      }
    }
  });

  todayEl.textContent = `${todayCount} ${plural(todayCount, 'task')} · ${formatHrsMins(todayHrs, 0)}`;
  weekEl.textContent  = `${weekCount} ${plural(weekCount, 'task')} · ${formatHrsMins(weekHrs, 0)} · ${fmt(mandays(weekHrs))} md`;
  monthEl.textContent = `${monthCount} ${plural(monthCount, 'task')} · ${formatHrsMins(monthHrs, 0)} · ${fmt(mandays(monthHrs))} md`;
}

function plural(n, word) {
  return n === 1 ? word : `${word}s`;
}
