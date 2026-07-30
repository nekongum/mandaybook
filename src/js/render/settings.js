/**
 * render/settings.js
 * Report Settings panel — title, subtitle, theme color.
 */

import { state, saveState } from '../state.js';
import { THEMES } from '../constants.js';

/**
 * Sync the settings panel with current state and bind the swatch buttons.
 */
export function renderReportSettings() {
  setValue('docTitle', state.project.docTitle || '');
  setValue('docSubtitle', state.project.docSubtitle || '');

  const color = state.project.themeColor || '#2d4a3e';
  setValue('customColor', color);
  setText('customColorHex', color.toUpperCase());

  const container = document.getElementById('themeSwatches');
  if (container) {
    container.innerHTML = '';
    THEMES.forEach((theme) => {
      const sw = document.createElement('div');
      sw.className = 'swatch' + (theme.value.toLowerCase() === color.toLowerCase() ? ' active' : '');
      sw.style.background = theme.value;
      sw.title = theme.name;
      sw.addEventListener('click', () => updateDocSetting('themeColor', theme.value));

      const name = document.createElement('span');
      name.className = 'swatch-name';
      name.textContent = theme.name;
      sw.appendChild(name);
      container.appendChild(sw);
    });
  }

  // Live-preview accent on the page itself
  document.documentElement.style.setProperty('--accent', color);
}

/**
 * Write a doc setting to state and refresh dependent UI.
 */
export function updateDocSetting(key, value) {
  state.project[key] = value;

  if (key === 'themeColor') {
    document.documentElement.style.setProperty('--accent', value);
    setValue('customColor', value);
    setText('customColorHex', value.toUpperCase());

    // Update active swatch
    document.querySelectorAll('.swatch').forEach((sw) => {
      const hex = rgbToHex(sw.style.background);
      sw.classList.toggle('active', hex.toLowerCase() === value.toLowerCase());
    });
  }

  saveState();
}

function rgbToHex(rgb) {
  if (rgb.startsWith('#')) return rgb;
  const match = rgb.match(/\d+/g);
  if (!match) return rgb;
  return '#' + match.slice(0, 3).map((x) => parseInt(x).toString(16).padStart(2, '0')).join('');
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
