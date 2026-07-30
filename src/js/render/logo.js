/**
 * render/logo.js
 * Company logo upload, preview, and removal.
 */

import { state, saveState } from '../state.js';
import { showToast } from '../ui/toast.js';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Sync the logo slot with current state.
 */
export function renderLogo() {
  const slot = document.getElementById('logoSlot');
  const img = document.getElementById('logoImg');
  const placeholder = document.getElementById('logoPlaceholder');
  if (!slot) return;

  if (state.project.logo) {
    img.src = state.project.logo;
    img.style.display = 'block';
    placeholder.style.display = 'none';
    slot.classList.add('has-logo');
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'block';
    slot.classList.remove('has-logo');
  }
}

/**
 * Handle file input change — read as data URL, store in state.
 */
export function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > MAX_LOGO_BYTES) {
    showToast('Logo too large (max 2MB)');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    state.project.logo = e.target.result;
    renderLogo();
    saveState();
    showToast('Logo uploaded');
  };
  reader.readAsDataURL(file);
}

/**
 * Remove the stored logo.
 */
export function removeLogo() {
  state.project.logo = null;
  renderLogo();
  saveState();
  const input = document.getElementById('logoUpload');
  if (input) input.value = '';
}
