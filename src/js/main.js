/**
 * main.js
 * App entry point. Loads saved state, renders everything, and wires up
 * all top-level event listeners. This file should stay small — the heavy
 * lifting lives in render/ and export/ modules.
 */

import { state, loadState, saveState, resetState, setStateStorageKey, setSaveHook } from './state.js';
import { num, fmt, totalHrs, mandays, escapeHtml, formatDate } from './utils.js';

import { renderPlan, addPlanRow, refreshPlanCalcCells } from './render/plan_v2.js';
import { renderActual, addActualRow, refreshActualCalcCells } from './render/actual.js';
import { renderSummary } from './render/summary.js';
import { renderQuickStats } from './render/quickStats.js';
import { renderLogo, handleLogoUpload, removeLogo } from './render/logo.js';
import { renderReportSettings, updateDocSetting } from './render/settings.js';

import { initDropdown } from './interactions/dropdown.js';
import { createEmployeePicker } from './interactions/employeePicker.js';
import {
  getLatestVenioCustomerContext,
  importVenioCallTime,
  importVenioMeetingTime
} from './integrations/venioCallImport.js';

import { exportPDF } from './export/pdf.js';
import { exportXLSX } from './export/excel.js';
import { exportJSON, importJSON } from './export/json.js';

import { showToast } from './ui/toast.js';
import { initFirestore, pullUserData, pushCompanies, pushProject } from './firestore.js';
import { getUserDisplayName, initAuth, logout, updateCurrentUserProfile } from './auth.js';
import {
  createCompany,
  deleteCompany,
  getCompaniesStorageKey,
  getCompanyStateStorageKey,
  loadCompanies,
  saveCompanies,
  setCompaniesSaveHook,
  migrateLegacyUserState,
  renameCompany,
  DEFAULT_CARD_WALLPAPERS,
  DEFAULT_WALLPAPERS
} from './companies.js';

// ============================================================================
// Init
// ============================================================================

document.addEventListener('DOMContentLoaded', init);

let createWorkspaceEmployeePicker;
let projectInfoEmployeePicker;

let appEventsBound = false;
let dashboardEventsBound = false;
let currentUser = null;
let currentCompany = null;
let companySearchQuery = '';
let companySortMode = 'default';
let venioImportKind = 'call';

// Drag and drop state
let dragSrcId = null;

// Multi-select state
let selectMode = false;
let selectedIds = new Set();

function init() {
  initAuth({
    onSignedIn: (user, details) => startApp(user, details).catch(console.error),
    onSignedOut: stopApp
  });
  hideLoadingOverlay();
  initRowTooltip();
}

function initRowTooltip() {
  const tip = document.getElementById('row-tooltip');
  if (!tip) return;
  document.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.note-btn');
    if (!btn) return;
    tip.textContent = btn.dataset.note || '';
    tip.classList.add('visible');
  });
  document.addEventListener('mousemove', (e) => {
    if (!tip.classList.contains('visible')) return;
    const rect = tip.getBoundingClientRect();
    let x = e.clientX - rect.width / 2;
    let y = e.clientY - rect.height - 12;
    // keep within viewport
    x = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    y = Math.max(8, y);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('.note-btn')) tip.classList.remove('visible');
  });
}

async function startApp(user, details = {}) {
  currentUser = user;

  // Init Firestore and pull cloud data into localStorage before rendering
  // Falls back gracefully if Firestore is not yet enabled
  try {
    initFirestore();
    const companiesKey = getCompaniesStorageKey(user);
    await pullUserData(user.id, companiesKey);
  } catch (e) {
    console.warn('Firestore not available, using localStorage only:', e);
  }

  // Wire save hooks so every save also pushes to Firestore
  setSaveHook((storageKey, data) => {
    pushProject(user.id, storageKey, data).catch(console.warn);
  });
  setCompaniesSaveHook((uid, storageKey, companies) => {
    pushCompanies(uid, storageKey, companies).catch(console.warn);
  });

  showDashboard();
  if (!appEventsBound) {
    bindEvents();
    appEventsBound = true;
  }
  if (!dashboardEventsBound) {
    bindDashboardEvents();
    dashboardEventsBound = true;
  }
  if (!details.restored) {
    showToast(details.mode === 'signup' ? 'Account created' : 'Logged in');
  }
}

function stopApp() {
  currentUser = null;
  currentCompany = null;
  document.body.classList.remove('client-mode');
}

function showDashboard() {
  if (!currentUser) return;
  const migrated = migrateLegacyUserState(currentUser);
  const app = document.getElementById('appView');
  const dash = document.getElementById('dashboardView');
  document.getElementById('authView').hidden = true;
  updateProfileLabels();
  document.body.classList.remove('client-mode');
  renderCompanyGrid();

  dash.hidden = false;

  if (!app.hidden) {
    app.style.transition = 'opacity 0.22s ease';
    app.style.opacity = '0';
    setTimeout(() => {
      app.hidden = true;
      app.style.opacity = '';
      app.style.transition = '';
    }, 220);
  }

  if (migrated) showToast('Existing workspace moved into Projects');
}

function openCompany(company) {
  currentCompany = company;
  const stateKey = getCompanyStateStorageKey(currentUser, company);
  setStateStorageKey(stateKey);
  const loaded = loadState();
  if (!loaded) {
    state.project.customer = company.name;
    saveState();
  }
  renderAll();
  syncVenioCallImportControls();
  updateProfileLabels();
  document.getElementById('currentCompanyName').textContent = company.name;

  const dash = document.getElementById('dashboardView');
  const app = document.getElementById('appView');

  app.hidden = false;
  app.style.opacity = '0';
  app.style.transition = 'opacity 0.28s ease';
  requestAnimationFrame(() => { app.style.opacity = '1'; });

  dash.style.transition = 'opacity 0.18s ease';
  dash.style.opacity = '0';
  setTimeout(() => {
    dash.hidden = true;
    dash.style.opacity = '';
    dash.style.transition = '';
    app.style.transition = '';
  }, 280);


}

/**
 * Render every part of the UI from current state.
 */
function renderAll() {
  document.getElementById('customer').value = state.project.customer || '';
  document.getElementById('mandayPurchased').value = state.project.mandayPurchased ?? '';
  document.getElementById('hoursPerManday').value = state.project.hoursPerManday ?? 8;

  renderLogo();
  renderReportSettings();
  renderPlan();
  renderActual();
  renderSummary();
  renderClientView();
}

function hideLoadingOverlay() {
  setTimeout(() => {
    const overlay = document.getElementById('loading');
    if (overlay) overlay.classList.add('hidden');
  }, 200);
}

// ============================================================================
// Event wiring
// ============================================================================

function bindEvents() {
  // Top-level project inputs
  document.getElementById('customer').addEventListener('input', onProjectInputChange);
  document.getElementById('mandayPurchased').addEventListener('input', onProjectInputChange);
  document.getElementById('hoursPerManday').addEventListener('input', onProjectInputChange);
  document.getElementById('mandayPurchased').addEventListener('blur', normalizeProjectNumberInput);
  document.getElementById('hoursPerManday').addEventListener('blur', normalizeProjectNumberInput);

  // Report Settings inputs
  document.getElementById('docTitle').addEventListener('input', (e) =>
    updateDocSetting('docTitle', e.target.value));
  document.getElementById('docSubtitle').addEventListener('input', (e) =>
    updateDocSetting('docSubtitle', e.target.value));
  document.getElementById('customColor').addEventListener('input', (e) =>
    updateDocSetting('themeColor', e.target.value));

  // Logo
  document.getElementById('logoSlot').addEventListener('click', () =>
    document.getElementById('logoUpload').click());
  document.getElementById('logoUpload').addEventListener('change', handleLogoUpload);
  document.getElementById('logoRemove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeLogo();
  });

  // Add row buttons
  document.getElementById('addPlanBtn').addEventListener('click', addPlanRow);
  document.getElementById('addActualBtn').addEventListener('click', addActualRow);
  document.getElementById('importVenioActivityBtn').addEventListener('click', handleVenioActivityImport);
  document.querySelectorAll('[data-venio-import-kind]').forEach((tab) => {
    tab.addEventListener('click', () => setVenioImportKind(tab.dataset.venioImportKind));
  });


  // Download dropdown + actions
  initDropdown();
  document.querySelectorAll('.dropdown-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'export-pdf') exportPDF();
      if (action === 'export-xlsx') exportXLSX();
      if (action === 'export-json') exportJSON();
    });
  });

  document.getElementById('backToCompaniesBtn').addEventListener('click', showDashboard);
  document.getElementById('clientViewBtn').addEventListener('click', showClientView);
  document.getElementById('editViewBtn').addEventListener('click', showEditView);
  document.getElementById('projectInfoBtn').addEventListener('click', openProjectInfoModal);
  document.getElementById('projectInfoCloseBtn').addEventListener('click', closeProjectInfoModal);
  document.getElementById('projectInfoCancelBtn').addEventListener('click', closeProjectInfoModal);
  document.getElementById('projectInfoModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeProjectInfoModal();
  });
  document.getElementById('projectInfoSaveBtn').addEventListener('click', saveProjectInfo);
  clampEmployeeInput(document.getElementById('piEmployeeCount'));
}

function openProjectInfoModal() {
  const companies = loadCompanies(currentUser);
  const company = companies.find(c => c.id === currentCompany?.id);
  if (!company) return;
  clearWorkspaceValidation('pi');
  document.getElementById('piCompanyName').value = company.name || '';
  document.getElementById('piEmployeeCount').value = company.employeeCount || '';
  document.getElementById('piNotes').value = company.notes || '';
  projectInfoEmployeePicker.reset(company.members || []);
  document.querySelectorAll('input[name="piPackage"]').forEach(r => {
    r.checked = r.value === (company.package || '');
  });
  document.getElementById('projectInfoModal').removeAttribute('hidden');
}

function closeProjectInfoModal() {
  projectInfoEmployeePicker.reset();
  clearWorkspaceValidation('pi');
  document.getElementById('projectInfoModal').setAttribute('hidden', '');
}

function saveProjectInfo() {
  const companies = loadCompanies(currentUser);
  const company = companies.find(c => c.id === currentCompany?.id);
  if (!company) return;
  const validation = validateWorkspaceRequiredFields('pi', projectInfoEmployeePicker);
  if (!validation.valid) return;
  const name = validation.name;
  company.name = name;
  company.employeeCount = Number(document.getElementById('piEmployeeCount').value) || undefined;
  company.notes = document.getElementById('piNotes').value.trim() || undefined;
  company.package = document.querySelector('input[name="piPackage"]:checked')?.value || undefined;
  company.members = validation.members;
  company.updatedAt = new Date().toISOString();
  saveCompanies(currentUser, companies);
  currentCompany = company;
  syncVenioCallImportControls();
  document.getElementById('currentCompanyName').textContent = company.name;
  // Sync name into project state so PDF export uses the updated name
  if (state.project) {
    state.project.customer = name;
    saveState();
  }
  closeProjectInfoModal();
  showToast('Project info saved');
}

function setVenioCallImportStatus(message = '', { error = false } = {}) {
  const status = document.getElementById('venioCallImportStatus');
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

function syncVenioCallImportControls() {
  const select = document.getElementById('venioCallImplementor');
  if (!select) return;
  const members = Array.isArray(currentCompany?.members) ? currentCompany.members : [];
  const previousValue = select.value;
  select.innerHTML = members.map((member) => `
    <option value="${escapeHtml(member.userId)}">${escapeHtml(member.fullname)}</option>
  `).join('');
  if (members.some((member) => member.userId === previousValue)) select.value = previousValue;
  select.hidden = members.length <= 1;
  document.getElementById('importVenioActivityBtn').disabled = members.length === 0;
  setVenioImportKind(venioImportKind);
  setVenioCallImportStatus('');
}

function setVenioImportKind(kind) {
  venioImportKind = kind === 'meeting' ? 'meeting' : 'call';
  document.querySelectorAll('[data-venio-import-kind]').forEach((tab) => {
    const selected = tab.dataset.venioImportKind === venioImportKind;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  const button = document.getElementById('importVenioActivityBtn');
  if (button) button.textContent = venioImportKind === 'meeting'
    ? 'Import Meetings'
    : 'Import Calls';
  setVenioCallImportStatus('');
}

function linkCurrentCompanyToVenio(context) {
  const companies = loadCompanies(currentUser);
  const company = companies.find((item) => item.id === currentCompany?.id);
  if (!company) throw new Error('Current project could not be found.');
  company.venioCustomerId = context.customerId;
  company.updatedAt = new Date().toISOString();
  saveCompanies(currentUser, companies);
  currentCompany = company;
}

function importedVenioActivityKeys() {
  return new Set(state.actual.flatMap((row) => {
    const keys = Array.isArray(row._venioActivityKeys) ? row._venioActivityKeys : [];
    const legacyCallKeys = Array.isArray(row._venioActivityIds)
      ? row._venioActivityIds.map((activityId) => `call:${Number(activityId)}`)
      : [];
    return [...keys, ...legacyCallKeys];
  }));
}

async function ensureVenioCustomerLink() {
  if (Number.isSafeInteger(Number(currentCompany?.venioCustomerId))) {
    return Number(currentCompany.venioCustomerId);
  }

  setVenioCallImportStatus('Finding the current Venio customer...');
  const context = await getLatestVenioCustomerContext();
  if (!context) {
    throw new Error('Open this customer’s activity page in Venio first, then try again.');
  }
  if (!confirm(`Link this Manday Project to Venio Customer ID ${context.customerId}?`)) {
    throw new Error('Venio customer was not linked.');
  }
  linkCurrentCompanyToVenio(context);
  return context.customerId;
}

async function handleVenioActivityImport() {
  const button = document.getElementById('importVenioActivityBtn');
  const select = document.getElementById('venioCallImplementor');
  const members = Array.isArray(currentCompany?.members) ? currentCompany.members : [];
  const config = venioImportKind === 'meeting'
    ? {
        kind: 'meeting',
        task: 'Meeting',
        noun: 'meeting',
        importer: importVenioMeetingTime
      }
    : {
        kind: 'call',
        task: 'Phone Call',
        noun: 'call',
        importer: importVenioCallTime
      };
  const selectedUserId = select.value || members[0]?.userId || '';
  if (!selectedUserId || !members.some((member) => member.userId === selectedUserId)) {
    setVenioCallImportStatus('Select an implementor before importing.', { error: true });
    return;
  }

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setVenioCallImportStatus(`Importing ${config.noun} activity from Venio...`);
  try {
    const customerId = await ensureVenioCustomerLink();
    const result = await config.importer(customerId, selectedUserId);
    const importedKeys = importedVenioActivityKeys();
    const activities = result.activities.filter(
      (activity) => !importedKeys.has(`${config.kind}:${activity.activityId}`)
    );
    if (!activities.length) {
      setVenioCallImportStatus(
        result.activities.length
          ? `No new ${config.noun} activity found for this implementor.`
          : `No ${config.noun} activity found for this implementor.`
      );
      return;
    }

    const importableActivities = activities
      .map((activity) => ({
        ...activity,
        durationMinutes: Math.round(activity.durationMinutes)
      }))
      .filter((activity) => activity.durationMinutes > 0)
      .sort((a, b) => (a.activityDate || '').localeCompare(b.activityDate || ''));
    if (!importableActivities.length) {
      setVenioCallImportStatus(`No ${config.noun} activity found for this implementor.`);
      return;
    }
    const fallbackDate = new Date().toISOString().slice(0, 10);
    const importedAt = new Date().toISOString();
    importableActivities.forEach((activity) => {
      state.actual.push({
        task: config.task,
        date: activity.activityDate.slice(0, 10) || fallbackDate,
        hours: Math.floor(activity.durationMinutes / 60),
        minutes: activity.durationMinutes % 60,
        stakeholder: '',
        createdAt: importedAt,
        _venioCustomerId: customerId,
        _venioImplementorUserId: selectedUserId,
        _venioActivityKeys: [`${config.kind}:${activity.activityId}`],
        ...(config.kind === 'call' ? { _venioActivityIds: [activity.activityId] } : {})
      });
    });
    const totalMinutes = importableActivities.reduce(
      (sum, activity) => sum + activity.durationMinutes,
      0
    );
    renderActual();
    renderSummary();
    renderClientView();
    saveState();
    setVenioCallImportStatus(
      `Imported ${importableActivities.length} ${config.noun} activities (${totalMinutes} minutes).`
    );
  } catch (error) {
    setVenioCallImportStatus(
      error.message || 'Unable to import from Venio. Make sure Venio is open and you are signed in.',
      { error: true }
    );
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

function openCreateWorkspaceModal() {
  clearWorkspaceValidation('cw');
  document.getElementById('cwCompanyName').value = '';
  document.getElementById('cwEmployeeCount').value = '';
  document.getElementById('cwNotes').value = '';
  createWorkspaceEmployeePicker.reset();
  document.querySelectorAll('input[name="cwPackage"]').forEach(r => r.checked = false);
  document.getElementById('createWorkspaceModal').removeAttribute('hidden');
  document.getElementById('cwEmployeeSearch').focus();
}

function closeCreateWorkspaceModal() {
  createWorkspaceEmployeePicker.reset();
  clearWorkspaceValidation('cw');
  document.getElementById('createWorkspaceModal').setAttribute('hidden', '');
}

function setWorkspaceFieldError(input, error, message = '') {
  const invalid = Boolean(message);
  input.classList.toggle('workspace-field-invalid', invalid);
  input.setAttribute('aria-invalid', String(invalid));
  error.textContent = message;
  error.hidden = !invalid;
}

function clearWorkspaceValidation(prefix) {
  const companyInput = document.getElementById(`${prefix}CompanyName`);
  const implementorInput = document.getElementById(`${prefix}EmployeeSearch`);
  const companyError = document.getElementById(`${prefix}CompanyNameError`);
  const implementorError = document.getElementById(`${prefix}ImplementorError`);
  setWorkspaceFieldError(companyInput, companyError);
  setWorkspaceFieldError(implementorInput, implementorError);
}

function validateWorkspaceRequiredFields(prefix, employeePicker) {
  const companyInput = document.getElementById(`${prefix}CompanyName`);
  const implementorInput = document.getElementById(`${prefix}EmployeeSearch`);
  const companyError = document.getElementById(`${prefix}CompanyNameError`);
  const implementorError = document.getElementById(`${prefix}ImplementorError`);
  const name = companyInput.value.trim();
  const members = employeePicker.getValue();

  setWorkspaceFieldError(
    implementorInput,
    implementorError,
    members.length ? '' : 'Please select at least one implementor.'
  );
  setWorkspaceFieldError(
    companyInput,
    companyError,
    name ? '' : 'Company name is required.'
  );

  if (!members.length) implementorInput.focus();
  else if (!name) companyInput.focus();

  return { valid: Boolean(members.length && name), name, members };
}

function bindWorkspaceValidation(prefix, employeePicker) {
  const companyInput = document.getElementById(`${prefix}CompanyName`);
  const implementorPicker = document.getElementById(`${prefix}EmployeePicker`);
  companyInput.addEventListener('input', () => {
    if (companyInput.value.trim()) {
      setWorkspaceFieldError(
        companyInput,
        document.getElementById(`${prefix}CompanyNameError`)
      );
    }
  });
  implementorPicker.addEventListener('employeechange', () => {
    if (employeePicker.getValue().length) {
      setWorkspaceFieldError(
        document.getElementById(`${prefix}EmployeeSearch`),
        document.getElementById(`${prefix}ImplementorError`)
      );
    }
  });
}

function clampEmployeeInput(el) {
  el.addEventListener('input', () => {
    const v = parseInt(el.value, 10);
    if (el.value !== '' && (isNaN(v) || v < 1)) el.value = 1;
  });
}

function bindDashboardEvents() {
  createWorkspaceEmployeePicker = createEmployeePicker(
    document.getElementById('cwEmployeePicker')
  );
  projectInfoEmployeePicker = createEmployeePicker(
    document.getElementById('piEmployeePicker')
  );
  bindWorkspaceValidation('cw', createWorkspaceEmployeePicker);
  bindWorkspaceValidation('pi', projectInfoEmployeePicker);
  clampEmployeeInput(document.getElementById('cwEmployeeCount'));
  document.getElementById('openCreateWorkspaceBtn').addEventListener('click', openCreateWorkspaceModal);
  document.getElementById('createWorkspaceCloseBtn').addEventListener('click', closeCreateWorkspaceModal);
  document.getElementById('createWorkspaceCancelBtn').addEventListener('click', closeCreateWorkspaceModal);
  document.getElementById('createWorkspaceModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCreateWorkspaceModal();
  });
  document.getElementById('createWorkspaceConfirmBtn').addEventListener('click', () => {
    const validation = validateWorkspaceRequiredFields('cw', createWorkspaceEmployeePicker);
    if (!validation.valid) return;
    const employeeCount = document.getElementById('cwEmployeeCount').value;
    const notes = document.getElementById('cwNotes').value;
    const pkg = document.querySelector('input[name="cwPackage"]:checked')?.value || '';
    try {
      createCompany(currentUser, validation.name, {
        employeeCount,
        package: pkg,
        notes,
        members: validation.members
      });
      closeCreateWorkspaceModal();
      renderCompanyGrid();
      showToast('Workspace created');
    } catch (error) {
      showToast(error.message || 'Could not create workspace');
    }
  });

  document.getElementById('companyGrid').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-card-menu-trigger]');
    if (trigger) {
      event.stopPropagation();
      const card = trigger.closest('[data-company-id]');
      if (!card) return;
      const company = loadCompanies(currentUser).find(c => c.id === card.dataset.companyId);
      if (!company) return;
      openCardActionModal(company);
      return;
    }

    const card = event.target.closest('[data-company-id]');
    if (!card) return;

    const company = loadCompanies(currentUser).find((item) => item.id === card.dataset.companyId);
    if (!company) return;

    if (selectMode) {
      if (selectedIds.has(company.id)) {
        selectedIds.delete(company.id);
        card.classList.remove('selected');
        card.querySelector('.card-checkbox')?.classList.remove('checked');
      } else {
        selectedIds.add(company.id);
        card.classList.add('selected');
        card.querySelector('.card-checkbox')?.classList.add('checked');
      }
      updateSelectCount();
      return;
    }

    openCompany(company);
  });

  document.getElementById('companyGrid').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-company-id]');
    if (!card || event.target.closest('[data-company-action]')) return;
    event.preventDefault();
    const company = loadCompanies(currentUser).find((item) => item.id === card.dataset.companyId);
    if (company) openCompany(company);
  });

  document.getElementById('companySearch').addEventListener('input', (event) => {
    companySearchQuery = event.target.value.trim().toLowerCase();
    renderCompanyGrid();
  });

  const sortMenuBtn = document.getElementById('sortMenuBtn');
  const sortMenu = document.getElementById('sortMenu');
  sortMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortMenu.hidden = !sortMenu.hidden;
  });
  sortMenu.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      companySortMode = btn.dataset.sort;
      sortMenu.hidden = true;
      sortMenu.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCompanyGrid();
    });
  });
  document.addEventListener('click', () => { sortMenu.hidden = true; });

  // Select mode
  document.getElementById('selectModeBtn').addEventListener('click', () => {
    document.getElementById('sortMenu').hidden = true;
    selectMode = true;
    selectedIds.clear();
    document.getElementById('selectActionBar').hidden = false;
    renderCompanyGrid();
  });

  document.getElementById('cancelSelectBtn').addEventListener('click', exitSelectMode);

  document.getElementById('selectAllBtn').addEventListener('click', () => {
    const companies = loadCompanies(currentUser);
    const visible = companySearchQuery
      ? companies.filter(c => c.name.toLowerCase().includes(companySearchQuery))
      : companies;
    visible.forEach(c => selectedIds.add(c.id));
    renderCompanyGrid();
    updateSelectCount();
  });

  document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
    if (!selectedIds.size) return;
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} card${count > 1 ? 's' : ''}?`)) return;
    selectedIds.forEach(id => {
      try { deleteCompany(currentUser, id); } catch (_) {}
    });
    exitSelectMode();
    renderCompanyGrid();
    showToast(`${count} card${count > 1 ? 's' : ''} deleted`);
  });

  bindProfileEvents();
}

function exitSelectMode() {
  selectMode = false;
  selectedIds.clear();
  document.getElementById('selectActionBar').hidden = true;
  renderCompanyGrid();
}

function updateSelectCount() {
  document.getElementById('selectCount').textContent =
    selectedIds.size === 0 ? 'No cards selected' : `${selectedIds.size} selected`;
}

function bindProfileEvents() {
  document.querySelectorAll('[data-profile-menu]').forEach((menu) => {
    const trigger = menu.querySelector('.profile-trigger');
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const dropdown = menu.querySelector('.profile-dropdown');
      const isOpen = dropdown.classList.contains('open');
      if (isOpen) {
        closeProfileDropdown(dropdown, trigger);
        return;
      }
      closeProfileMenus(menu);
      openProfileDropdown(dropdown, trigger);
    });
  });

  document.addEventListener('click', () => {
    closeProfileMenus();
    document.querySelectorAll('.card-menu').forEach(m => { m.hidden = true; });
  });

  document.querySelectorAll('[data-profile-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const action = button.dataset.profileAction;
      closeProfileMenus();
      if (action === 'edit') {
        openProfileModal();
        return;
      }
      if (action === 'logout') {
        logout();
        showToast('Logged out');
      }
    });
  });

  document.getElementById('profileCloseBtn').addEventListener('click', closeProfileModal);
  document.getElementById('profileCancelBtn').addEventListener('click', closeProfileModal);
  document.getElementById('profileModal').addEventListener('click', (event) => {
    if (event.target.id === 'profileModal') closeProfileModal();
  });
  document.getElementById('profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveBtn = document.getElementById('profileSaveBtn');
    const errorEl = document.getElementById('profileError');
    errorEl.hidden = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      currentUser = await updateCurrentUserProfile({
        firstName: document.getElementById('profileFirstName').value.trim(),
        lastName: document.getElementById('profileLastName').value.trim(),
      });
      updateProfileLabels();
      closeProfileModal();
      showToast('Profile updated');
    } catch (error) {
      errorEl.textContent = error.message || 'Could not update profile';
      errorEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
}

function closeProfileMenus(exceptMenu = null) {
  document.querySelectorAll('[data-profile-menu]').forEach((menu) => {
    if (menu === exceptMenu) return;
    const dropdown = menu.querySelector('.profile-dropdown');
    const trigger = menu.querySelector('.profile-trigger');
    closeProfileDropdown(dropdown, trigger);
  });
}

function openProfileDropdown(dropdown, trigger) {
  clearTimeout(dropdown.hideTimer);
  dropdown.hidden = false;
  requestAnimationFrame(() => {
    dropdown.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  });
}

function closeProfileDropdown(dropdown, trigger) {
  dropdown.classList.remove('open');
  trigger.setAttribute('aria-expanded', 'false');
  clearTimeout(dropdown.hideTimer);
  dropdown.hideTimer = setTimeout(() => {
    if (!dropdown.classList.contains('open')) dropdown.hidden = true;
  }, 240);
}

function openProfileModal() {
  if (!currentUser) return;
  document.getElementById('profileFirstName').value = currentUser.firstName || '';
  document.getElementById('profileLastName').value = currentUser.lastName || '';
  document.getElementById('profileEmail').value = currentUser.email || '';
  document.getElementById('profileModal').hidden = false;
  document.getElementById('profileFirstName').focus();
}

function closeProfileModal() {
  document.getElementById('profileModal').hidden = true;
}

function updateProfileLabels() {
  const name = getUserDisplayName(currentUser);
  document.getElementById('dashboardUserName').textContent = name;
  document.getElementById('currentUserName').textContent = name;

  const firstName = currentUser?.firstName || name.split(' ')[0];
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greetingText').textContent = `${greeting}, ${firstName} 👋`;
}

function renderCompanyGrid() {
  const grid = document.getElementById('companyGrid');
  const companies = loadCompanies(currentUser);
  let summaries = companies.map((company) => ({
    company,
    summary: getCompanySummary(company)
  }));

  // Apply sort
  if (companySortMode === 'az') {
    summaries.sort((a, b) => a.company.name.localeCompare(b.company.name));
  } else if (companySortMode === 'za') {
    summaries.sort((a, b) => b.company.name.localeCompare(a.company.name));
  } else if (companySortMode === 'most-used') {
    summaries.sort((a, b) => b.summary.used - a.summary.used);
  } else if (companySortMode === 'least-used') {
    summaries.sort((a, b) => a.summary.used - b.summary.used);
  }

  const filtered = companySearchQuery
    ? summaries.filter(({ company }) => company.name.toLowerCase().includes(companySearchQuery))
    : summaries;

  renderCompanyListHint();

  if (!companies.length) {
    grid.innerHTML = `
      <div class="company-empty">
        <h3>No companies yet</h3>
        <p>Add your first company to create its own mandaybook workspace.</p>
      </div>
    `;
    return;
  }

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="company-empty">
        <h3>No matching companies</h3>
        <p>Try a different search term or add a new company.</p>
      </div>
    `;
    return;
  }

  const CARD_COLORS = ['#c0192b', '#01579b', '#ffa726'];
  grid.innerHTML = filtered.map(({ company, summary }, i) => {
    const hasBgImage = !!company.bgImage;
    const bgStyle = hasBgImage
      ? `background-image:url('${company.bgImage}');background-size:cover;background-position:center;`
      : company.bgColor
        ? `background:${company.bgColor};`
        : '';
    const txtColor = !hasBgImage && company.bgColor ? cardTextColor(company.bgColor) : null;
    const txtStyle = txtColor ? `color:${txtColor};` : '';
    const isSelected = selectedIds.has(company.id);
    const cardClass = `company-card${hasBgImage ? ' has-bg-image' : ''}${selectMode ? ' selectable' : ''}${isSelected ? ' selected' : ''}`;
    const markHtml = company.logoImage
      ? `<img class="company-card-logo-img" src="${company.logoImage}" alt="${escapeHtml(company.name)}">`
      : `<span class="company-card-mark" style="background:${company.color || CARD_COLORS[i % CARD_COLORS.length]}">${escapeHtml(company.name.slice(0, 1).toUpperCase())}</span>`;
    const checkHtml = selectMode
      ? `<div class="card-check-overlay"><span class="card-checkbox${isSelected ? ' checked' : ''}"></span></div>`
      : '';
    return `
    <article class="${cardClass}" data-company-id="${company.id}" tabindex="0" role="button" aria-label="Open ${escapeHtml(company.name)} mandaybook" draggable="${!selectMode}" style="${bgStyle}${txtStyle}">
      ${checkHtml}
      <div class="company-card-top">
        ${markHtml}
        <div class="company-card-title">
          <strong style="${txtStyle}">${escapeHtml(company.name)}</strong>
          <small style="${txtStyle}">${escapeHtml(summary.status)}</small>
        </div>
      </div>
      <div class="company-card-metrics">
        <span style="${txtStyle}"><b>${fmt(summary.purchased)}</b> md bought</span>
        <span style="${txtStyle}"><b>${fmt(summary.used)}</b> md used</span>
        <span style="${txtStyle}"><b>${fmt(summary.remaining)}</b> md left</span>
      </div>
      <div class="company-progress" aria-label="Manday utilization">
        <span style="width: ${summary.progress}%"></span>
      </div>
      <div class="company-card-footer">
        <small>${escapeHtml(summary.lastActivity)}</small>
        <div class="company-actions">
          <button type="button" class="card-menu-btn" data-card-menu-trigger aria-label="More options">⋯</button>
          <div class="card-menu" hidden>
            <button type="button" data-company-action="customize">Customize</button>
            <button type="button" data-company-action="rename">Rename</button>
            <button type="button" class="danger-link" data-company-action="delete">Delete</button>
          </div>
        </div>
      </div>
    </article>
  `;
  }).join('');

  // Bind drag-and-drop events
  grid.querySelectorAll('.company-card[draggable]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragSrcId = card.dataset.companyId;
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      grid.querySelectorAll('.company-card').forEach(c => c.classList.remove('drag-over'));
      if (card.dataset.companyId !== dragSrcId) card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetId = card.dataset.companyId;
      if (!dragSrcId || dragSrcId === targetId) return;
      const allCompanies = loadCompanies(currentUser);
      const srcIdx = allCompanies.findIndex(c => c.id === dragSrcId);
      const tgtIdx = allCompanies.findIndex(c => c.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return;
      const [moved] = allCompanies.splice(srcIdx, 1);
      allCompanies.splice(tgtIdx, 0, moved);
      saveCompanies(currentUser, allCompanies);
      renderCompanyGrid();
    });
    card.addEventListener('dragend', () => {
      grid.querySelectorAll('.company-card').forEach(c => c.classList.remove('drag-over'));
      dragSrcId = null;
    });
  });
}

const CUSTOMIZE_SWATCHES = ['#FFCCCC', '#99CCCC', '#FFF8DC', '#F0FFFF', '#FFF0F5', '#D8BFD8', '#ffffff', '#1b2a4a'];

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const toLinear = c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4);
  return 0.2126*toLinear(r) + 0.7152*toLinear(g) + 0.0722*toLinear(b);
}

function cardTextColor(bgHex) {
  if (!bgHex) return null;
  const lum = hexLuminance(bgHex);
  if (lum > 0.18) {
    // Light bg: darken by 75% (multiply RGB by 0.25)
    const r = Math.round(parseInt(bgHex.slice(1,3),16)*0.25).toString(16).padStart(2,'0');
    const g = Math.round(parseInt(bgHex.slice(3,5),16)*0.25).toString(16).padStart(2,'0');
    const b = Math.round(parseInt(bgHex.slice(5,7),16)*0.25).toString(16).padStart(2,'0');
    return `#${r}${g}${b}`;
  }
  return '#ffffff';
}

function openCardActionModal(company) {
  const modal = document.getElementById('cardActionModal');
  document.getElementById('cardActionName').textContent = company.name;
  modal.hidden = false;

  const close = () => { modal.hidden = true; };

  document.getElementById('cardActionCancel').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  document.getElementById('cardActionCustomize').onclick = () => {
    close();
    openCustomizeModal(company);
  };

  document.getElementById('cardActionRename').onclick = () => {
    close();
    openRenameModal(company);
  };

  document.getElementById('cardActionDelete').onclick = () => {
    close();
    if (!confirm(`Delete "${company.name}" and all its data?`)) return;
    try {
      deleteCompany(currentUser, company.id);
      renderCompanyGrid();
      showToast('Company deleted');
    } catch (error) {
      showToast(error.message || 'Could not delete company');
    }
  };
}

function openRenameModal(company) {
  const input = document.getElementById('renameInput');
  input.value = company.name;
  document.getElementById('renameModal').hidden = false;
  input.focus(); input.select();
  const close = () => { document.getElementById('renameModal').hidden = true; };
  const doRename = () => {
    const nextName = input.value.trim();
    if (!nextName) return;
    try {
      renameCompany(currentUser, company.id, nextName);
      renderCompanyGrid();
      showToast('Company renamed');
    } catch (error) {
      showToast(error.message || 'Could not rename company');
    }
    close();
  };
  document.getElementById('renameConfirmBtn').onclick = doRename;
  document.getElementById('renameCancelBtn').onclick = close;
  document.getElementById('renameCloseBtn').onclick = close;
  input.onkeydown = (e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') close(); };
}


function openCustomizeModal(company) {
  const modal = document.getElementById('customizeModal');
  let pendingBgColor = company.bgColor || null;
  let pendingBgImage = company.bgImage || null;
  let pendingLogoImage = company.logoImage || null;

  // ── Live preview ──────────────────────────────────────────────────────────
  function updatePreview() {
    const preview = document.getElementById('customizePreview');
    const badge = document.getElementById('previewBadge');
    const nameEl = document.getElementById('previewName');

    // Background
    if (pendingBgImage) {
      preview.style.backgroundImage = `url('${pendingBgImage}')`;
      preview.style.backgroundSize = 'cover';
      preview.style.backgroundPosition = 'center';
      preview.style.backgroundColor = '';
    } else {
      preview.style.backgroundImage = '';
      preview.style.backgroundColor = pendingBgColor || '#ffffff';
    }

    // Badge / logo
    if (pendingLogoImage) {
      badge.innerHTML = `<img src="${pendingLogoImage}" class="preview-badge-img" alt="">`;
    } else {
      const initial = (company.name || '?').slice(0, 1).toUpperCase();
      badge.innerHTML = `<span class="preview-badge-mark" style="background:${company.color || '#c0192b'}">${escapeHtml(initial)}</span>`;
    }

    const onImage = !!pendingBgImage;
    nameEl.textContent = company.name || 'Company name';
    nameEl.style.color = onImage ? '#000' : '';
  }

  // ── Color swatches ────────────────────────────────────────────────────────
  const swatchContainer = document.getElementById('customizeSwatches');

  function renderSwatches() {
    swatchContainer.innerHTML = CUSTOMIZE_SWATCHES.map(color => `
      <div class="customize-swatch${pendingBgColor === color && !pendingBgImage ? ' active' : ''}"
           data-color="${color}"
           style="background:${color};"
           title="${color}">
      </div>
    `).join('');
    swatchContainer.querySelectorAll('.customize-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        // Color and image are mutually exclusive
        pendingBgColor = swatch.dataset.color;
        pendingBgImage = null;
        renderSwatches();
        renderWallpapers();
        updatePreview();
      });
    });
  }

  // ── Wallpaper presets ─────────────────────────────────────────────────────
  const wallpaperContainer = document.getElementById('customizeWallpapers');

  function renderWallpapers() {
    wallpaperContainer.innerHTML = DEFAULT_CARD_WALLPAPERS.map(url => `
      <div class="customize-wallpaper${pendingBgImage === url ? ' active' : ''}"
           data-url="${url}"
           style="background-image:url('${url}');background-size:cover;background-position:center;">
      </div>
    `).join('');
    wallpaperContainer.querySelectorAll('.customize-wallpaper').forEach(tile => {
      tile.addEventListener('click', () => {
        if (pendingBgImage === tile.dataset.url) {
          // Tap again to deselect
          pendingBgImage = null;
        } else {
          pendingBgImage = tile.dataset.url;
          pendingBgColor = null; // image overrides color
        }
        renderWallpapers();
        renderSwatches();
        updatePreview();
      });
    });
  }

  renderSwatches();
  renderWallpapers();
  updatePreview();

  // ── File inputs ───────────────────────────────────────────────────────────
  const bgInput = document.getElementById('customizeBgInput');
  const logoInput = document.getElementById('customizeLogoInput');

  document.getElementById('customizeBgUploadBtn').onclick = () => bgInput.click();
  document.getElementById('customizeLogoUploadBtn').onclick = () => logoInput.click();

  bgInput.onchange = () => {
    const file = bgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      pendingBgImage = e.target.result;
      pendingBgColor = null;
      bgInput.value = '';
      renderSwatches();
      renderWallpapers();
      updatePreview();
    };
    reader.readAsDataURL(file);
  };

  logoInput.onchange = () => {
    const file = logoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      pendingLogoImage = e.target.result;
      logoInput.value = '';
      updatePreview();
    };
    reader.readAsDataURL(file);
  };

  document.getElementById('customizeBgRemoveBtn').onclick = () => {
    pendingBgImage = null;
    renderSwatches();
    renderWallpapers();
    updatePreview();
  };

  document.getElementById('customizeLogoRemoveBtn').onclick = () => {
    pendingLogoImage = null;
    updatePreview();
  };

  // ── Modal controls ────────────────────────────────────────────────────────
  const close = () => { modal.hidden = true; };
  document.getElementById('customizeCloseBtn').onclick = close;
  document.getElementById('customizeCancelBtn').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  document.getElementById('customizeSaveBtn').onclick = () => {
    const companies = loadCompanies(currentUser);
    const target = companies.find(c => c.id === company.id);
    if (target) {
      target.bgColor = pendingBgColor;
      target.bgImage = pendingBgImage;
      target.logoImage = pendingLogoImage;
      target.updatedAt = new Date().toISOString();
      saveCompanies(currentUser, companies);
      renderCompanyGrid();
      showToast('Card updated');
    }
    close();
  };

  modal.hidden = false;
}

function getCompanySummary(company) {
  const raw = localStorage.getItem(getCompanyStateStorageKey(currentUser, company));
  const fallback = {
    purchased: 0,
    used: 0,
    remaining: 0,
    progress: 0,
    status: 'Ready to set up',
    lastActivity: `Created ${formatDate(company.createdAt)}`
  };

  if (!raw) return fallback;

  try {
    const data = JSON.parse(raw);
    const project = data.project || {};
    const actual = Array.isArray(data.actual) ? data.actual : [];
    const purchased = num(project.mandayPurchased);
    const hoursPerManday = num(project.hoursPerManday, 8) || 8;
    const usedHours = actual.reduce((sum, row) => sum + totalHrs(row), 0);
    const used = usedHours / hoursPerManday;
    const remaining = purchased - used;
    const ratio = purchased > 0 ? used / purchased : 0;
    const latestDate = actual
      .map((row) => row.date || row.createdAt)
      .filter(Boolean)
      .sort()
      .pop();

    return {
      purchased,
      used,
      remaining,
      progress: Math.min(Math.max(ratio * 100, 0), 100),
      status: getDashboardStatus(ratio, purchased),
      lastActivity: latestDate ? `Last log ${formatDate(latestDate)}` : `Created ${formatDate(company.createdAt)}`
    };
  } catch (error) {
    console.warn('Could not read company summary:', error);
    return fallback;
  }
}

function renderCompanyListHint() {
  document.getElementById('companyListHint').textContent = companySearchQuery
    ? `Showing matches for "${companySearchQuery}".`
    : 'Open a workspace or manage company details.';
}

function getDashboardStatus(ratio, purchased) {
  if (!purchased) return 'Ready to set up';
  if (ratio >= 1) return 'Over budget';
  if (ratio >= 0.85) return 'Near limit';
  if (ratio > 0) return 'In progress';
  return 'Not started';
}

/**
 * Top inputs (Customer / Manday Purchased / Hours per Manday) changed.
 * We avoid re-rendering the tables (which would steal input focus while typing).
 * Instead we refresh the calculated cells in place.
 */
function onProjectInputChange() {
  state.project.customer = document.getElementById('customer').value;
  state.project.mandayPurchased = document.getElementById('mandayPurchased').value;
  state.project.hoursPerManday = document.getElementById('hoursPerManday').value;

  refreshPlanCalcCells();
  refreshActualCalcCells();
  renderSummary();
  renderQuickStats();
  renderClientView();
  saveState();
}

function normalizeProjectNumberInput(e) {
  if (e.target.value !== '') return;
  e.target.value = '0';
  onProjectInputChange();
}

function showClientView() {
  renderClientView();
  document.body.classList.add('client-mode');
  document.getElementById('clientView').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showEditView() {
  document.body.classList.remove('client-mode');
  document.getElementById('clientView').hidden = true;
}

function renderClientView() {
  const purchased = num(state.project.mandayPurchased);
  const planHours = state.plan.reduce((sum, row) => sum + totalHrs(row), 0);
  const planMd = mandays(planHours);
  const actualHours = state.actual.reduce((sum, row) => sum + totalHrs(row), 0);
  const actualMd = mandays(actualHours);
  const remainingMd = purchased - actualMd;
  const pct = purchased > 0 ? actualMd / purchased : 0;
  const pctDisplay = Math.round(pct * 1000) / 10;
  const status = clientStatus(pct);

  setClientText('clientTitle', `${state.project.customer || 'Client'} Manday Summary`);
  setClientText('clientSubtitle', 'Read-only project utilization snapshot');
  setClientText('clientPurchased', `${fmt(purchased)} md`);
  setClientText('clientUsed', `${fmt(actualMd)} md`);
  setClientText('clientRemaining', `${fmt(remainingMd)} md`);
  setClientText('clientStatus', status);
  setClientText('clientPercent', `${pctDisplay}%`);
  setClientText('clientPlannedTotal', `${fmt(planMd)} md`);
  setClientText('clientActualTotal', `${fmt(actualMd)} md`);

  const fill = document.getElementById('clientProgressFill');
  if (fill) {
    fill.style.width = `${Math.min(pct * 100, 100)}%`;
    fill.className = 'progress-bar-fill';
    if (pct >= 1) fill.classList.add('over');
    else if (pct >= 0.85) fill.classList.add('alert');
  }

  renderClientPlanTable();
  renderClientActualTable();
}

function renderClientPlanTable() {
  const body = document.getElementById('clientPlanBody');
  if (!body) return;
  if (!state.plan.length) {
    body.innerHTML = '<tr><td colspan="3" class="client-empty">No planned activities yet.</td></tr>';
    return;
  }

  body.innerHTML = state.plan.map((row) => {
    const hours = totalHrs(row);
    return `
      <tr>
        <td>
          <div class="client-table-title">${escapeHtml(row.activity || 'Untitled activity')}</div>
        </td>
        <td>${escapeHtml(row.desc || '—')}</td>
        <td class="right">${fmt(mandays(hours))} md</td>
      </tr>
    `;
  }).join('');
}

function renderClientActualTable() {
  const body = document.getElementById('clientActualBody');
  if (!body) return;
  if (!state.actual.length) {
    body.innerHTML = '<tr><td colspan="4" class="client-empty">No actual work logged yet.</td></tr>';
    return;
  }

  body.innerHTML = state.actual.map((row) => {
    const hours = totalHrs(row);
    return `
      <tr>
        <td>
          <div class="client-table-title">${escapeHtml(row.task || 'Untitled work')}</div>
          <div class="client-table-meta">${fmt(hours)} hrs</div>
        </td>
        <td>${escapeHtml(formatDate(row.date))}</td>
        <td>${escapeHtml(row.stakeholder || '—')}</td>
        <td class="right">${fmt(mandays(hours), 3)} md</td>
      </tr>
    `;
  }).join('');
}

function clientStatus(pct) {
  if (pct >= 1) return 'Over Budget';
  if (pct >= 0.85) return 'Near Limit';
  if (pct >= 0.5) return 'On Track';
  return 'Available';
}

function setClientText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
