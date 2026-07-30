/**
 * toast.js
 * Bottom-center toast notification.
 */

let toastTimer;

/**
 * Show a transient message at the bottom of the screen.
 * @param {string} message
 */
export function showToast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
