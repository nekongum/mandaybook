/**
 * interactions/dropdown.js
 * Open/close the Download dropdown menu.
 */

/**
 * Wire up the toggle button and outside-click-to-close behavior.
 */
export function initDropdown() {
  const toggle = document.getElementById('downloadToggle');
  const menu = document.getElementById('downloadMenu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  document.addEventListener('click', () => menu.classList.remove('open'));
}
