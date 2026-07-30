import { searchVenioEmployees } from '../integrations/venio.js';
import { escapeHtml } from '../utils.js';

const SEARCH_DELAY_MS = 400;

export function createEmployeePicker(root) {
  const input = root.querySelector('[data-employee-search]');
  const results = root.querySelector('[data-employee-results]');
  const selectedList = root.querySelector('[data-selected-employees]');
  let selected = [];
  let options = [];
  let activeIndex = -1;
  let timer = null;
  let controller = null;
  let requestSequence = 0;

  function closeResults() {
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
    renderOptions();
  }

  function cancelSearch() {
    clearTimeout(timer);
    controller?.abort();
    requestSequence++;
    input.removeAttribute('aria-busy');
    closeResults();
  }

  function openResults() {
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function renderSelected() {
    selectedList.innerHTML = selected.map((employee) => `
      <li>
        <span>${escapeHtml(employee.fullname)}</span>
        <button type="button" data-remove-employee="${escapeHtml(employee.userId)}"
          aria-label="Remove ${escapeHtml(employee.fullname)}">&times;</button>
      </li>
    `).join('');
    selectedList.hidden = selected.length === 0;
  }

  function renderOptions() {
    results.innerHTML = options.map((employee, index) => `
      <button type="button" role="option" aria-selected="${index === activeIndex}"
        class="${index === activeIndex ? 'is-active' : ''}"
        data-employee-id="${escapeHtml(employee.userId)}">
        ${escapeHtml(employee.fullname)}
      </button>
    `).join('');
  }

  function showStatus(message, { retry = false } = {}) {
    options = [];
    activeIndex = -1;
    results.innerHTML = `
      <div class="employee-picker-status">
        <span>${escapeHtml(message)}</span>
        ${retry ? '<button type="button" data-employee-retry>Try again</button>' : ''}
      </div>
    `;
    openResults();
  }

  function choose(employee) {
    if (!employee || selected.some((item) => item.userId === employee.userId)) return;
    selected = [...selected, employee];
    input.value = '';
    options = [];
    renderSelected();
    closeResults();
    input.focus();
  }

  async function runSearch() {
    const keyword = input.value.trim();
    if (keyword.length < 2) {
      cancelSearch();
      return;
    }

    controller?.abort();
    controller = new AbortController();
    const sequence = ++requestSequence;
    showStatus('Loading employees...');
    input.setAttribute('aria-busy', 'true');

    try {
      const employees = await searchVenioEmployees(keyword, { signal: controller.signal });
      if (sequence !== requestSequence) return;
      options = employees.filter(
        (employee) => !selected.some((item) => item.userId === employee.userId)
      );
      if (!options.length) {
        showStatus('No employees found.');
      } else {
        activeIndex = -1;
        renderOptions();
        openResults();
      }
    } catch (error) {
      if (error.name !== 'AbortError' && sequence === requestSequence) {
        showStatus('Unable to load employees. Please try again.', { retry: true });
      }
    } finally {
      if (sequence === requestSequence) input.removeAttribute('aria-busy');
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    if (input.value.trim().length < 2) {
      cancelSearch();
      return;
    }
    timer = setTimeout(runSearch, SEARCH_DELAY_MS);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      cancelSearch();
      return;
    }
    if (results.hidden || !options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + direction + options.length) % options.length;
      renderOptions();
      results.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(options[activeIndex]);
    }
  });

  results.addEventListener('mousedown', (event) => event.preventDefault());
  results.addEventListener('click', (event) => {
    const option = event.target.closest('[data-employee-id]');
    if (option) choose(options.find((item) => item.userId === option.dataset.employeeId));
    if (event.target.closest('[data-employee-retry]')) runSearch();
  });

  selectedList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-employee]');
    if (!button) return;
    selected = selected.filter((item) => item.userId !== button.dataset.removeEmployee);
    renderSelected();
  });

  document.addEventListener('click', (event) => {
    if (!root.contains(event.target)) cancelSearch();
  });

  return {
    getValue: () => selected.map(({ userId, staffCode, fullname }) => ({
      userId,
      staffCode,
      fullname
    })),
    reset(members = []) {
      cancelSearch();
      selected = members.filter(
        (employee, index, list) =>
          employee?.userId &&
          employee?.fullname &&
          list.findIndex((item) => item.userId === employee.userId) === index
      ).map(({ userId, staffCode = '', fullname }) => ({ userId, staffCode, fullname }));
      input.value = '';
      options = [];
      renderSelected();
      closeResults();
    }
  };
}
