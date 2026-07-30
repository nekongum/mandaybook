/**
 * render/actual.js
 * Render and manage the Actual Work Log table (Section 02).
 */

import { state, saveState } from '../state.js';
import { num, fmt, totalHrs, formatHrsMins, mandays, escapeHtml } from '../utils.js';
import { TASK_PRESETS } from '../constants.js';
import { renderSummary } from './summary.js';
import { renderQuickStats } from './quickStats.js';
import {
  onDragStart, onDragOver, onDrop, onDragLeave, onDragEnd
} from '../interactions/dragDrop.js';

/**
 * Render all actual log rows into the DOM.
 */
export function renderActual() {
  const tbody = document.getElementById('actualBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.actual.forEach((row, i) => {
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
      <td class="task-cell">
        <input type="text" value="${escapeHtml(row.task || '')}"
               placeholder="e.g. Phone Call" data-field="task" autocomplete="off">
        <button class="task-caret-btn" type="button" data-idx="${i}"
                title="Choose from list" aria-label="Choose from list">▾</button>
      </td>
      <td><input type="date" value="${row.date || ''}" data-field="date"></td>
      <td class="center-cell">
        <input type="text" inputmode="decimal"
               value="${row.hours ?? ''}" placeholder="0" data-field="hours">
      </td>
      <td class="center-cell">
        <input type="text" inputmode="numeric"
               value="${row.minutes ?? ''}" placeholder="0" data-field="minutes">
      </td>
      <td class="calc" data-actual-total="${i}">${formatHrsMins(row.hours, row.minutes)}</td>
      <td class="calc" data-actual-md="${i}">${fmt(md, 3)}</td>
      <td>
        <input type="text" value="${escapeHtml(row.stakeholder || '')}"
               placeholder="Stakeholder" data-field="stakeholder">
      </td>
      <td class="row-actions">
        <button class="action-btn note-btn" data-action="note"
                data-note="${escapeHtml(createdAtLabel(row.createdAt))}"
                aria-label="${escapeHtml(createdAtLabel(row.createdAt))}">i</button>
        <button class="action-btn dup-btn" data-action="duplicate" title="Duplicate as today">⎘</button>
        <button class="action-btn delete-btn" data-action="delete" title="Delete">×</button>
      </td>
    `;
    wireActualRow(tr, i);
    tbody.appendChild(tr);
  });

  updateActualTotals();
}

function wireActualRow(tr, i) {
  tr.querySelectorAll('input[data-field]').forEach((input) => {
    const field = input.dataset.field;
    if (field === 'hours' || field === 'minutes') {
      input.addEventListener('input', (e) => {
        e.target.value = sanitizeActualTime(field, e.target.value);
        updateActualTime(i, field, e.target.value);
      });
      input.addEventListener('blur', (e) => {
        if (e.target.value === '') {
          e.target.value = '0';
          updateActualTime(i, field, '0');
        }
      });
    } else {
      input.addEventListener('input', (e) => updateActual(i, field, e.target.value));
      if (field === 'task') {
        input.addEventListener('blur', (e) => rememberCustomTask(e.target.value));
      }
    }
  });
  tr.querySelector('.task-caret-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openTaskPopover(e.currentTarget, i);
  });
  tr.querySelector('[data-action="duplicate"]').addEventListener('click', () => duplicateActual(i));
  tr.querySelector('[data-action="delete"]').addEventListener('click', () => deleteActual(i));

  const handle = tr.querySelector('.drag-handle');
  handle.addEventListener('dragstart', (e) => onDragStart(e, 'actual', i));
  handle.addEventListener('dragend', onDragEnd);

  tr.addEventListener('dragover', (e) => onDragOver(e, 'actual'));
  tr.addEventListener('drop', (e) => onDrop(e, 'actual', i, renderActual));
  tr.addEventListener('dragleave', onDragLeave);
}

export function updateActualTotals() {
  const sumMins = state.actual.reduce((sum, r) => sum + num(r.minutes), 0);
  const sumHrs = state.actual.reduce((sum, r) => sum + num(r.hours), 0) + Math.floor(sumMins / 60);
  const mins = sumMins % 60;
  const totalH = sumHrs + mins / 60;
  document.getElementById('actualTotalHours').textContent = formatHrsMins(sumHrs, mins);
  document.getElementById('actualTotalMandays').textContent = `${fmt(mandays(totalH))} md`;
  renderQuickStats();
}

/**
 * Text-field updater (task / date / stakeholder).
 * Date changes also refresh Quick Stats (might shift today/week buckets).
 */
export function updateActual(i, key, value) {
  state.actual[i][key] = value;
  if (key === 'date') renderQuickStats();
  saveState();
}

/**
 * Numeric updater (hours/minutes) — refresh only this row's calc cells.
 */
export function updateActualTime(i, key, value) {
  state.actual[i][key] = value;
  const tH = totalHrs(state.actual[i]);
  const totalCell = document.querySelector(`[data-actual-total="${i}"]`);
  const mdCell = document.querySelector(`[data-actual-md="${i}"]`);
  if (totalCell) totalCell.textContent = formatHrsMins(state.actual[i].hours, state.actual[i].minutes);
  if (mdCell) mdCell.textContent = fmt(mandays(tH), 3);
  updateActualTotals();
  renderSummary();
  saveState();
}

export function deleteActual(i) {
  state.actual.splice(i, 1);
  renderActual();
  renderSummary();
  saveState();
}

/**
 * Insert a copy below — new entry takes today's date.
 */
export function duplicateActual(i) {
  const original = state.actual[i];
  const today = new Date().toISOString().slice(0, 10);
  state.actual.splice(i + 1, 0, {
    task: original.task || '',
    date: today,
    hours: original.hours,
    minutes: original.minutes,
    stakeholder: original.stakeholder || '',
    createdAt: new Date().toISOString()
  });
  renderActual();
  renderSummary();
  saveState();
}

export function addActualRow() {
  const today = new Date().toISOString().slice(0, 10);
  state.actual.push({
    task: '',
    date: today,
    hours: 0,
    minutes: 0,
    stakeholder: '',
    createdAt: new Date().toISOString()
  });
  renderActual();
  renderSummary();
  saveState();
  setTimeout(() => {
    const last = document.querySelectorAll('#actualBody tr:last-child input');
    if (last[0]) last[0].focus();
  }, 0);
}

/**
 * Refresh calc cells without rebuilding inputs (used by global settings change).
 */
export function refreshActualCalcCells() {
  state.actual.forEach((row, i) => {
    const tH = totalHrs(row);
    const totalCell = document.querySelector(`[data-actual-total="${i}"]`);
    const mdCell = document.querySelector(`[data-actual-md="${i}"]`);
    if (totalCell) totalCell.textContent = formatHrsMins(row.hours, row.minutes);
    if (mdCell) mdCell.textContent = fmt(mandays(tH), 3);
  });
  updateActualTotals();
}

// ── Task picker popover ───────────────────────────────────────────────────────

let _taskPopover = null;
let _taskCloseHandler = null;
let _taskScrollHandler = null;

/**
 * Preset tasks plus any custom ones the user has typed before (deduped, case-insensitive).
 */
function getTaskOptions() {
  const seen = new Set(TASK_PRESETS.map(s => s.toLowerCase()));
  const customs = (state.customTasks || []).filter((v) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...TASK_PRESETS, ...customs];
}

/**
 * If the typed value isn't already in the list, save it so it shows up in the picker next time.
 */
function rememberCustomTask(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return;
  const exists = getTaskOptions().some((v) => v.toLowerCase() === trimmed.toLowerCase());
  if (exists) return;
  if (!Array.isArray(state.customTasks)) state.customTasks = [];
  state.customTasks.push(trimmed);
  saveState();
}

/**
 * Remove a previously-learned custom task from the picker (presets are not removable).
 */
function removeCustomTask(name) {
  if (!Array.isArray(state.customTasks)) return;
  const key = name.toLowerCase();
  state.customTasks = state.customTasks.filter((v) => v.toLowerCase() !== key);
  saveState();
}

function openTaskPopover(btn, i) {
  closeTaskPopover();

  const options = getTaskOptions();
  const presetCount = TASK_PRESETS.length;

  const pop = document.createElement('div');
  pop.className = 'task-popover';

  const list = document.createElement('div');
  list.className = 'task-pop-list';

  options.forEach((name, idx) => {
    const row = document.createElement('div');
    row.className = 'task-option-row' + (idx === presetCount ? ' task-option-custom-first' : '');

    const optBtn = document.createElement('button');
    optBtn.type = 'button';
    optBtn.className = 'task-option';
    optBtn.textContent = name;
    optBtn.addEventListener('click', () => {
      const currentIdx = parseInt(btn.dataset.idx, 10);
      updateActual(currentIdx, 'task', name);
      const input = document.querySelector(`#actualBody tr[data-idx="${currentIdx}"] input[data-field="task"]`);
      if (input) input.value = name;
      closeTaskPopover();
    });
    row.appendChild(optBtn);

    if (idx >= presetCount) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'task-option-delete';
      delBtn.title = 'Remove from list';
      delBtn.setAttribute('aria-label', 'Remove from list');
      delBtn.textContent = '×';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCustomTask(name);
        openTaskPopover(btn, i);
      });
      row.appendChild(delBtn);
    }

    list.appendChild(row);
  });
  pop.appendChild(list);

  const hint = document.createElement('div');
  hint.className = 'task-pop-hint';
  hint.textContent = 'Or type your own in the field';
  pop.appendChild(hint);

  document.body.appendChild(pop);
  _taskPopover = pop;

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
  _taskScrollHandler = repositionPop;

  _taskCloseHandler = (e) => { if (!pop.contains(e.target) && e.target !== btn) closeTaskPopover(); };
  setTimeout(() => document.addEventListener('mousedown', _taskCloseHandler), 0);
}

function closeTaskPopover() {
  if (_taskPopover) { _taskPopover.remove(); _taskPopover = null; }
  if (_taskCloseHandler) { document.removeEventListener('mousedown', _taskCloseHandler); _taskCloseHandler = null; }
  if (_taskScrollHandler) { window.removeEventListener('scroll', _taskScrollHandler, true); _taskScrollHandler = null; }
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

function sanitizeActualTime(field, value) {
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
