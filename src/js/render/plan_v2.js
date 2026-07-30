/**
 * render/plan.js
 * Render and manage the Planned Activities table (Section 01).
 */

import { state, saveState } from '../state.js';
import { num, fmt, totalHrs, formatHrsMins, mandays, escapeHtml } from '../utils.js';
import { ACTIVITY_PRESETS } from '../constants.js';
import { renderSummary } from './summary.js';
import {
  onDragStart, onDragOver, onDrop, onDragLeave, onDragEnd
} from '../interactions/dragDrop.js';

/**
 * Render all plan rows into the DOM.
 */
export function renderPlan() {
  const tbody = document.getElementById('planBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.plan.forEach((row, i) => {
    const tH = totalHrs(row);
    const md = mandays(tH);

    const tr = document.createElement('tr');
    tr.dataset.idx = i;
    tr.draggable = false;
    tr.innerHTML = `
      <td class="drag-cell">
        <span class="drag-handle" draggable="true" title="Drag to reorder">⋮⋮</span>
      </td>
      <td><div class="row-num">${i + 1}</div></td>
      <td class="activity-cell">
        <input type="text" value="${escapeHtml(row.activity || '')}"
               placeholder="e.g. Training" data-field="activity" autocomplete="off">
        <button class="activity-caret-btn" type="button" data-idx="${i}"
                title="Choose from list" aria-label="Choose from list">▾</button>
      </td>
      <td class="desc-cell" data-idx="${i}">
        <button class="desc-display" type="button" data-idx="${i}">${escapeHtml(row.desc || '') || '<span class="desc-placeholder">date or note</span>'}</button>
      </td>
      <td class="center-cell">
        <input type="text" inputmode="decimal"
               value="${row.hours ?? ''}" placeholder="0" data-field="hours">
      </td>
      <td class="center-cell">
        <input type="text" inputmode="numeric"
               value="${row.minutes ?? ''}" placeholder="0" data-field="minutes">
      </td>
      <td class="calc" data-plan-total="${i}">${formatHrsMins(row.hours, row.minutes)}</td>
      <td class="calc" data-plan-md="${i}">${fmt(md)}</td>
      <td class="row-actions">
        <button class="action-btn note-btn" data-action="note"
                data-note="${escapeHtml(createdAtLabel(row.createdAt))}"
                aria-label="${escapeHtml(createdAtLabel(row.createdAt))}">i</button>
        <button class="action-btn dup-btn" data-action="duplicate" title="Duplicate">⎘</button>
        <button class="action-btn delete-btn" data-action="delete" title="Delete">×</button>
      </td>
    `;
    wirePlanRow(tr, i);
    tbody.appendChild(tr);
  });

  updatePlanTotals();
}

/**
 * Attach event listeners to a single plan row.
 */
function wirePlanRow(tr, i) {
  // Field inputs
  tr.querySelectorAll('input[data-field]').forEach((input) => {
    const field = input.dataset.field;
    if (field === 'hours' || field === 'minutes') {
      input.addEventListener('input', (e) => {
        e.target.value = sanitizePlanTime(field, e.target.value);
        updatePlanTime(i, field, e.target.value);
      });
      input.addEventListener('blur', (e) => {
        if (e.target.value === '') {
          e.target.value = '0';
          updatePlanTime(i, field, '0');
        }
      });
    } else {
      input.addEventListener('input', (e) => updatePlan(i, field, e.target.value));
      if (field === 'activity') {
        input.addEventListener('blur', (e) => rememberCustomActivity(e.target.value));
      }
    }
  });
  // Activity picker
  tr.querySelector('.activity-caret-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openActivityPopover(e.currentTarget, i);
  });
  // Desc cell popover
  tr.querySelector('.desc-display').addEventListener('click', (e) => openDescPopover(e.currentTarget, i));
  // Action buttons
  tr.querySelector('[data-action="duplicate"]').addEventListener('click', () => duplicatePlan(i));
  tr.querySelector('[data-action="delete"]').addEventListener('click', () => deletePlan(i));
  // Drag handle
  const handle = tr.querySelector('.drag-handle');
  handle.addEventListener('dragstart', (e) => onDragStart(e, 'plan', i));
  handle.addEventListener('dragend', onDragEnd);
  // Drop target
  tr.addEventListener('dragover', (e) => onDragOver(e, 'plan'));
  tr.addEventListener('drop', (e) => onDrop(e, 'plan', i, renderPlan));
  tr.addEventListener('dragleave', onDragLeave);
}

/**
 * Update plan total hours/mandays footer cells.
 */
export function updatePlanTotals() {
  const sumMins = state.plan.reduce((sum, r) => sum + num(r.minutes), 0);
  const sumHrs = state.plan.reduce((sum, r) => sum + num(r.hours), 0) + Math.floor(sumMins / 60);
  const mins = sumMins % 60;
  const totalHours = sumHrs + mins / 60;
  const totalMd = mandays(totalHours);
  document.getElementById('planTotalHours').textContent = formatHrsMins(sumHrs, mins);
  document.getElementById('planTotalMandays').textContent = `${fmt(totalMd)} md`;
}

/**
 * Text-only update: change value in state and persist (no re-render needed).
 */
export function updatePlan(i, key, value) {
  state.plan[i][key] = value;
  saveState();
}

/**
 * Numeric updater (hours/minutes) — refresh only this row's calc cells.
 */
export function updatePlanTime(i, key, value) {
  state.plan[i][key] = value;
  const tH = totalHrs(state.plan[i]);
  const totalCell = document.querySelector(`[data-plan-total="${i}"]`);
  const mdCell = document.querySelector(`[data-plan-md="${i}"]`);
  if (totalCell) totalCell.textContent = formatHrsMins(state.plan[i].hours, state.plan[i].minutes);
  if (mdCell) mdCell.textContent = fmt(mandays(tH));
  updatePlanTotals();
  renderSummary();
  saveState();
}

/**
 * Remove a row.
 */
export function deletePlan(i) {
  state.plan.splice(i, 1);
  renderPlan();
  renderSummary();
  saveState();
}

/**
 * Insert a copy of row i below it.
 */
export function duplicatePlan(i) {
  const original = state.plan[i];
  state.plan.splice(i + 1, 0, {
    activity: original.activity || '',
    desc: original.desc || '',
    hours: original.hours,
    minutes: original.minutes,
    createdAt: new Date().toISOString()
  });
  renderPlan();
  renderSummary();
  saveState();
}

/**
 * Append a new empty row and focus its first input.
 */
export function addPlanRow() {
  state.plan.push({ activity: '', desc: '', hours: 0, minutes: 0, createdAt: new Date().toISOString() });
  renderPlan();
  saveState();
  setTimeout(() => {
    const last = document.querySelectorAll('#planBody tr:last-child input');
    if (last[0]) last[0].focus();
  }, 0);
}

/**
 * Refresh the calculated cells without rebuilding inputs.
 * Used when global settings (hours per manday) change.
 */
export function refreshPlanCalcCells() {
  state.plan.forEach((row, i) => {
    const tH = totalHrs(row);
    const totalCell = document.querySelector(`[data-plan-total="${i}"]`);
    const mdCell = document.querySelector(`[data-plan-md="${i}"]`);
    if (totalCell) totalCell.textContent = formatHrsMins(row.hours, row.minutes);
    if (mdCell) mdCell.textContent = fmt(mandays(tH));
  });
  updatePlanTotals();
}

// ── Activity picker popover ─────────────────────────────────────────────────────

let _activityPopover = null;
let _activityCloseHandler = null;
let _activityScrollHandler = null;

/**
 * Preset activities plus any custom ones the user has typed before (deduped, case-insensitive).
 */
function getActivityOptions() {
  const seen = new Set(ACTIVITY_PRESETS.map(s => s.toLowerCase()));
  const customs = (state.customActivities || []).filter((v) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...ACTIVITY_PRESETS, ...customs];
}

/**
 * If the typed value isn't already in the list, save it so it shows up in the picker next time.
 */
function rememberCustomActivity(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return;
  const exists = getActivityOptions().some((v) => v.toLowerCase() === trimmed.toLowerCase());
  if (exists) return;
  if (!Array.isArray(state.customActivities)) state.customActivities = [];
  state.customActivities.push(trimmed);
  saveState();
}

/**
 * Remove a previously-learned custom activity from the picker (presets are not removable).
 */
function removeCustomActivity(name) {
  if (!Array.isArray(state.customActivities)) return;
  const key = name.toLowerCase();
  state.customActivities = state.customActivities.filter((v) => v.toLowerCase() !== key);
  saveState();
}

function openActivityPopover(btn, i) {
  closeActivityPopover();
  closeDescPopover();

  const options = getActivityOptions();
  const presetCount = ACTIVITY_PRESETS.length;

  const pop = document.createElement('div');
  pop.className = 'activity-popover';

  const list = document.createElement('div');
  list.className = 'activity-pop-list';

  options.forEach((name, idx) => {
    const row = document.createElement('div');
    row.className = 'activity-option-row' + (idx === presetCount ? ' activity-option-custom-first' : '');

    const optBtn = document.createElement('button');
    optBtn.type = 'button';
    optBtn.className = 'activity-option';
    optBtn.textContent = name;
    optBtn.addEventListener('click', () => {
      const currentIdx = parseInt(btn.dataset.idx, 10);
      updatePlan(currentIdx, 'activity', name);
      const input = document.querySelector(`#planBody tr[data-idx="${currentIdx}"] input[data-field="activity"]`);
      if (input) input.value = name;
      closeActivityPopover();
    });
    row.appendChild(optBtn);

    if (idx >= presetCount) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'activity-option-delete';
      delBtn.title = 'Remove from list';
      delBtn.setAttribute('aria-label', 'Remove from list');
      delBtn.textContent = '×';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCustomActivity(name);
        openActivityPopover(btn, i);
      });
      row.appendChild(delBtn);
    }

    list.appendChild(row);
  });
  pop.appendChild(list);

  const hint = document.createElement('div');
  hint.className = 'activity-pop-hint';
  hint.textContent = 'Or type your own in the field';
  pop.appendChild(hint);

  document.body.appendChild(pop);
  _activityPopover = pop;

  const popW = 260;
  function repositionPop() {
    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px';
    let left = r.right - popW;
    if (left < 8) left = 8;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    pop.style.left = Math.max(8, left) + 'px';
  }
  pop.style.position = 'fixed';
  pop.style.width = popW + 'px';
  repositionPop();
  window.addEventListener('scroll', repositionPop, true);
  _activityScrollHandler = repositionPop;

  _activityCloseHandler = (e) => { if (!pop.contains(e.target) && e.target !== btn) closeActivityPopover(); };
  setTimeout(() => document.addEventListener('mousedown', _activityCloseHandler), 0);
}

function closeActivityPopover() {
  if (_activityPopover) { _activityPopover.remove(); _activityPopover = null; }
  if (_activityCloseHandler) { document.removeEventListener('mousedown', _activityCloseHandler); _activityCloseHandler = null; }
  if (_activityScrollHandler) { window.removeEventListener('scroll', _activityScrollHandler, true); _activityScrollHandler = null; }
}

// ── Desc popover ──────────────────────────────────────────────────────────────

let _descPopover = null;
let _descCloseHandler = null;
let _descScrollHandler = null;

function parseDesc(desc) {
  if (!desc || desc === 'N/A') return { mode: desc === 'N/A' ? 'na' : 'note', from: '', to: '', note: desc || '' };
  const rangeMatch = desc.match(/^(\d{2}\/\d{2}\/\d{4})\s*[–→-]\s*(\d{2}\/\d{2}\/\d{4})$/);
  if (rangeMatch) return { mode: 'range', from: toInputDate(rangeMatch[1]), to: toInputDate(rangeMatch[2]), note: '' };
  return { mode: 'note', from: '', to: '', note: desc };
}

function toInputDate(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}

function fromInputDate(yyyymmdd) {
  if (!yyyymmdd) return '';
  const [y, m, d] = yyyymmdd.split('-');
  return `${d}/${m}/${y}`;
}

function openDescPopover(btn, i) {
  closeDescPopover();
  closeActivityPopover();
  const parsed = parseDesc(state.plan[i].desc || '');

  const pop = document.createElement('div');
  pop.className = 'desc-popover';
  pop.innerHTML = `
    <div class="desc-pop-tabs">
      <button class="desc-tab${parsed.mode === 'range' ? ' active' : ''}" data-mode="range">Date Range</button>
      <button class="desc-tab${parsed.mode === 'note' ? ' active' : ''}" data-mode="note">Note</button>
      <button class="desc-tab${parsed.mode === 'na' ? ' active' : ''}" data-mode="na">N/A</button>
    </div>
    <div class="desc-pop-body">
      <div class="desc-pane" data-pane="range" ${parsed.mode !== 'range' ? 'hidden' : ''}>
        <label>From<input type="date" class="dp-from" value="${parsed.from}"></label>
        <span class="dp-arrow">→</span>
        <label>To<input type="date" class="dp-to" value="${parsed.to}"></label>
      </div>
      <div class="desc-pane" data-pane="note" ${parsed.mode !== 'note' ? 'hidden' : ''}>
        <input type="text" class="dp-note" placeholder="e.g. Multiple months" value="${escapeHtml(parsed.note)}">
      </div>
      <div class="desc-pane dp-na-pane" data-pane="na" ${parsed.mode !== 'na' ? 'hidden' : ''}>
        <span>จะแสดงเป็น N/A</span>
      </div>
    </div>
    <div class="desc-pop-actions">
      <button class="btn desc-clear-btn" type="button">Clear</button>
      <button class="btn btn-primary desc-save-btn" type="button">Save</button>
    </div>
  `;

  document.body.appendChild(pop);
  _descPopover = pop;

  // Position below button — fixed to viewport
  const popW = 300;
  function repositionPop() {
    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px';
    let left = r.left;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    pop.style.left = Math.max(8, left) + 'px';
  }
  pop.style.position = 'fixed';
  pop.style.width = popW + 'px';
  repositionPop();
  window.addEventListener('scroll', repositionPop, true); // capture: catches scroll on any ancestor
  _descScrollHandler = repositionPop;

  let activeMode = parsed.mode;

  // Tab switching
  pop.querySelectorAll('.desc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeMode = tab.dataset.mode;
      pop.querySelectorAll('.desc-tab').forEach(t => t.classList.toggle('active', t === tab));
      pop.querySelectorAll('.desc-pane').forEach(p => p.hidden = p.dataset.pane !== activeMode);
      if (activeMode === 'note') pop.querySelector('.dp-note').focus();
      if (activeMode === 'range') pop.querySelector('.dp-from').focus();
    });
  });

  // Save — read current index from DOM at save time (not closure) to handle add/delete
  pop.querySelector('.desc-save-btn').addEventListener('click', () => {
    const currentIdx = parseInt(btn.dataset.idx, 10);
    let val = '';
    if (activeMode === 'range') {
      const from = fromInputDate(pop.querySelector('.dp-from').value);
      const to   = fromInputDate(pop.querySelector('.dp-to').value);
      val = from && to ? `${from} – ${to}` : from || to;
    } else if (activeMode === 'note') {
      val = pop.querySelector('.dp-note').value.trim();
    } else {
      val = 'N/A';
    }
    updatePlan(currentIdx, 'desc', val);
    updateDescDisplay(currentIdx, val);
    closeDescPopover();
  });

  // Clear
  pop.querySelector('.desc-clear-btn').addEventListener('click', () => {
    const currentIdx = parseInt(btn.dataset.idx, 10);
    updatePlan(currentIdx, 'desc', '');
    updateDescDisplay(currentIdx, '');
    closeDescPopover();
  });

  // Close on outside click
  _descCloseHandler = (e) => { if (!pop.contains(e.target) && e.target !== btn) closeDescPopover(); };
  setTimeout(() => document.addEventListener('mousedown', _descCloseHandler), 0);
}

function closeDescPopover() {
  if (_descPopover) { _descPopover.remove(); _descPopover = null; }
  if (_descCloseHandler) { document.removeEventListener('mousedown', _descCloseHandler); _descCloseHandler = null; }
  if (_descScrollHandler) { window.removeEventListener('scroll', _descScrollHandler, true); _descScrollHandler = null; }
}

function updateDescDisplay(i, val) {
  const btn = document.querySelector(`#planBody .desc-display[data-idx="${i}"]`);
  if (btn) btn.innerHTML = val ? escapeHtml(val) : '<span class="desc-placeholder">date or note</span>';
}

function createdAtLabel(value) {
  if (!value) return 'Created time not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Created time not recorded';
  return `Created ${date.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  })} at ${date.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit'
  })}`;
}

function sanitizePlanTime(field, value) {
  if (field === 'minutes') {
    const minutes = String(value).replace(/\D/g, '');
    if (minutes === '') return '';
    return String(Math.min(parseInt(minutes, 10), 59));
  }
  if (field === 'hours') {
    const hours = String(value).replace(/\D/g, '');
    if (hours === '') return '';
    return String(parseInt(hours, 10));
  }
  return value;
}
