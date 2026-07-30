/**
 * render/summary.js
 * Update the Summary & Progress section (Section 03).
 */

import { state } from '../state.js';
import { num, fmt, totalHrs, mandays, formatHrsMins } from '../utils.js';

/**
 * Recompute summary values and write them into the DOM.
 * Called whenever any underlying number changes.
 */
export function renderSummary() {
  const purchased = num(state.project.mandayPurchased);
  const hpm = num(state.project.hoursPerManday, 8);
  const available = purchased * hpm;
  const planHours = state.plan.reduce((s, r) => s + totalHrs(r), 0);
  const planMd = mandays(planHours);
  const actualHours = state.actual.reduce((s, r) => s + totalHrs(r), 0);
  const actualMd = mandays(actualHours);
  const remainingMd = purchased - actualMd;
  const pct = purchased > 0 ? actualMd / purchased : 0;
  const planVs = planMd - purchased;

  // Document header
  setText('docCustomer', state.project.customer || '—');
  const today = new Date();
  setText('docDate', today.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric'
  }));
  setText('generatedNote', `Generated ${today.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric'
  })} at ${today.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit'
  })}`);

  // Statement rows
  setText('sumPurchased', `${fmt(purchased)} md`);
  setText('sumAvailable', formatHrsMins(available, 0));
  setText('sumPlanned',   `${fmt(planMd)} md`);
  setText('sumUsed',      `${fmt(actualMd)} md`);

  const remEl = document.getElementById('sumRemaining');
  if (remEl) {
    remEl.textContent = `${fmt(remainingMd)} md`;
    remEl.className = 'statement-cell statement-value statement-emphasis'
      + (remainingMd < 0 ? ' negative' : '');
  }
  // Utilization total + status
  const pctDisplay = Math.round(pct * 1000) / 10;
  setText('progressPercent', `${pctDisplay}%`);

  const status = getUtilizationStatus(pct);
  const statusEl = document.getElementById('utilizationStatus');
  if (statusEl) {
    statusEl.textContent = status.label;
    statusEl.className = `utilization-status ${status.className}`;
  }

  const fill = document.getElementById('progressFill');
  if (fill) {
    fill.style.width = Math.min(pct * 100, 100) + '%';
    fill.className = 'progress-bar-fill';
    if (pct >= 1) fill.classList.add('over');
    else if (pct >= 0.85) fill.classList.add('alert');
  }

  // Plan-vs-Budget alert above the Plan table
  const alertDiv = document.getElementById('planAlert');
  if (alertDiv) {
    if (purchased > 0 && planMd > purchased) {
      alertDiv.innerHTML = `<div class="alert alert-warn"><span class="alert-icon">!</span><div>Plan total (${fmt(planMd)} md) exceeds purchased (${fmt(purchased)} md) by <strong>${fmt(planVs)} md</strong>. Consider trimming or upselling.</div></div>`;
    } else if (purchased > 0 && planMd > 0 && planMd < purchased * 0.5) {
      alertDiv.innerHTML = `<div class="alert alert-info"><span class="alert-icon">i</span><div>Plan uses only ${fmt(planMd)} md of ${fmt(purchased)} md purchased. You may have room to plan more activities.</div></div>`;
    } else {
      alertDiv.innerHTML = '';
    }
  }

  // Plan-vs-Budget footnote
  const pvb = document.getElementById('planVsBudget');
  if (pvb) {
    if (purchased > 0) {
      const sign = planVs > 0 ? '+' : '';
      pvb.textContent = `Plan vs Purchased: ${sign}${fmt(planVs)} md`;
    } else {
      pvb.textContent = '';
    }
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getUtilizationStatus(pct) {
  if (pct >= 1) {
    return { label: 'Over Budget', className: 'status-over' };
  }
  if (pct >= 0.85) {
    return { label: 'Near Limit', className: 'status-near' };
  }
  if (pct >= 0.5) {
    return { label: 'On Track', className: 'status-track' };
  }
  return { label: 'Available', className: 'status-available' };
}
