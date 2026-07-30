/**
 * interactions/dragDrop.js
 * Drag-to-reorder rows in both Plan and Actual tables.
 *
 * Uses HTML5 Drag and Drop API:
 *  1. The drag handle (⋮⋮) is `draggable="true"`; its dragstart sets context.
 *  2. Each <tr> is a drop target. On dragover we compute whether the cursor
 *     is in the top or bottom half and show a colored edge indicator.
 *  3. On drop, splice the array and re-render.
 */

import { state, saveState } from '../state.js';
import { renderSummary } from '../render/summary.js';

/** Per-drag context: which table and which row started the drag. */
const dragState = { table: null, fromIdx: null };

export function onDragStart(event, table, idx) {
  dragState.table = table;
  dragState.fromIdx = idx;
  event.dataTransfer.effectAllowed = 'move';

  const tr = event.target.closest('tr');
  if (tr) {
    tr.classList.add('row-dragging');
    try { event.dataTransfer.setDragImage(tr, 20, 20); } catch (e) { /* ignore */ }
  }
  try { event.dataTransfer.setData('text/plain', String(idx)); } catch (e) { /* ignore */ }
}

export function onDragOver(event, table) {
  if (dragState.table !== table) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';

  const tr = event.currentTarget;
  const rect = tr.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;

  // Clear any other drop indicators in this tbody
  tr.parentElement.querySelectorAll('tr.drop-above, tr.drop-below').forEach((el) => {
    if (el !== tr) el.classList.remove('drop-above', 'drop-below');
  });

  if (event.clientY < midY) {
    tr.classList.add('drop-above');
    tr.classList.remove('drop-below');
  } else {
    tr.classList.add('drop-below');
    tr.classList.remove('drop-above');
  }
}

export function onDragLeave(event) {
  const tr = event.currentTarget;
  if (!tr.contains(event.relatedTarget)) {
    tr.classList.remove('drop-above', 'drop-below');
  }
}

/**
 * @param {DragEvent} event
 * @param {'plan'|'actual'} table
 * @param {number} toIdx        Index of the row being hovered.
 * @param {Function} reRender   Callback to re-render the affected table.
 */
export function onDrop(event, table, toIdx, reRender) {
  if (dragState.table !== table || dragState.fromIdx === null) return;
  event.preventDefault();

  const tr = event.currentTarget;
  const rect = tr.getBoundingClientRect();
  const dropBelow = event.clientY >= rect.top + rect.height / 2;
  let targetIdx = dropBelow ? toIdx + 1 : toIdx;

  const fromIdx = dragState.fromIdx;
  const arr = table === 'plan' ? state.plan : state.actual;

  if (targetIdx === fromIdx || targetIdx === fromIdx + 1) {
    cleanupDragState();
    return;
  }

  const [moved] = arr.splice(fromIdx, 1);
  if (targetIdx > fromIdx) targetIdx -= 1;
  arr.splice(targetIdx, 0, moved);

  cleanupDragState();
  reRender();
  renderSummary();
  saveState();
}

export function onDragEnd() {
  cleanupDragState();
}

function cleanupDragState() {
  document.querySelectorAll('tr.row-dragging, tr.drop-above, tr.drop-below').forEach((el) => {
    el.classList.remove('row-dragging', 'drop-above', 'drop-below');
  });
  dragState.table = null;
  dragState.fromIdx = null;
}
