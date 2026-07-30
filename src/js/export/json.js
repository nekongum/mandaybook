/**
 * export/json.js
 * JSON backup export and import.
 */

import { state, replaceState } from '../state.js';
import { fileBase } from '../utils.js';
import { showToast } from '../ui/toast.js';

/**
 * Download current state as a .json file.
 */
export function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON backup downloaded');
}

/**
 * Prompt user to pick a JSON file and load it into state.
 * @param {Function} onLoaded  Called after successful import (e.g., re-render).
 */
export function importJSON(onLoaded) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.project && Array.isArray(data.plan) && Array.isArray(data.actual)) {
          replaceState(data);
          onLoaded && onLoaded();
          showToast('Data imported');
        } else {
          showToast('Invalid file format');
        }
      } catch (err) {
        showToast('Could not parse JSON');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
