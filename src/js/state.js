/**
 * state.js
 * The single source of truth for app data.
 * Persists to localStorage automatically.
 */

import {
  DEFAULT_PROJECT,
  DEFAULT_PLAN,
  DEFAULT_ACTUAL,
  STORAGE_KEY
} from './constants.js';

let activeStorageKey = STORAGE_KEY;

/**
 * Application state. Other modules import this object and read/write it directly.
 * After mutating, call saveState() to persist.
 */
export const state = {
  project: { ...DEFAULT_PROJECT },
  plan: [],
  actual: [],
  customActivities: [],
  customTasks: []
};

export function setStateStorageKey(storageKey) {
  activeStorageKey = storageKey || STORAGE_KEY;
}

/**
 * Load state from localStorage. Falls back to seed defaults if missing.
 * @returns {boolean} true if loaded from storage, false if seeded fresh.
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(activeStorageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.project && Array.isArray(parsed.plan) && Array.isArray(parsed.actual)) {
        Object.assign(state.project, DEFAULT_PROJECT, parsed.project);
        state.plan = parsed.plan.map(normalizeRowTime);
        state.actual = parsed.actual.map(normalizeRowTime);
        state.customActivities = Array.isArray(parsed.customActivities) ? parsed.customActivities : [];
        state.customTasks = Array.isArray(parsed.customTasks) ? parsed.customTasks : [];
        return true;
      }
    }
  } catch (e) {
    console.warn('Could not load saved state:', e);
  }
  // Fall back to defaults
  state.project = { ...DEFAULT_PROJECT };
  state.plan = [];
  state.actual = [];
  state.customActivities = [];
  state.customTasks = [];
  return false;
}

let _saveHook = null;
export function setSaveHook(fn) { _saveHook = fn; }

/**
 * Persist current state to localStorage. Safe to call frequently.
 */
export function saveState() {
  try {
    localStorage.setItem(activeStorageKey, JSON.stringify(state));
    _saveHook?.(activeStorageKey, state);
  } catch (e) {
    console.warn('Could not save state:', e);
  }
}

/**
 * Replace state entirely (used by JSON import and Reset).
 * @param {object} newState
 */
export function replaceState(newState) {
  state.project = { ...DEFAULT_PROJECT, ...(newState.project || {}) };
  state.plan = Array.isArray(newState.plan) ? newState.plan.map(normalizeRowTime) : [];
  state.actual = Array.isArray(newState.actual) ? newState.actual.map(normalizeRowTime) : [];
  state.customActivities = Array.isArray(newState.customActivities) ? newState.customActivities : [];
  state.customTasks = Array.isArray(newState.customTasks) ? newState.customTasks : [];
  saveState();
}

/**
 * Reset to factory defaults.
 */
export function resetState() {
  state.project = { ...DEFAULT_PROJECT };
  state.plan = JSON.parse(JSON.stringify(DEFAULT_PLAN)).map(normalizeRowTime);
  state.actual = JSON.parse(JSON.stringify(DEFAULT_ACTUAL)).map(normalizeRowTime);
  state.customActivities = [];
  state.customTasks = [];
  saveState();
}

/**
 * Helper to normalize hours and minutes into clean integers.
 * E.g., hours: 1.5, minutes: 0 -> hours: 1, minutes: 30
 */
function normalizeRowTime(row) {
  if (typeof row !== 'object' || row === null) return row;
  const hoursVal = parseFloat(row.hours) || 0;
  const minsVal = parseFloat(row.minutes) || 0;
  
  if (!Number.isInteger(hoursVal) || !Number.isInteger(minsVal)) {
    const totalMins = Math.round(hoursVal * 60 + minsVal);
    row.hours = Math.floor(totalMins / 60);
    row.minutes = totalMins % 60;
  } else {
    row.hours = Math.floor(hoursVal);
    row.minutes = Math.floor(minsVal);
  }
  return row;
}
