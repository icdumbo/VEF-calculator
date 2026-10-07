'use strict';

function displayDate(value) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return iso[3] + '.' + iso[2] + '.' + iso[1];
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.slice(0, 2) + (digits.length > 2 ? '.' + digits.slice(2, 4) : '')
    + (digits.length > 4 ? '.' + digits.slice(4) : '');
}

function realDate(value) {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!parts) return false;
  const day = Number(parts[1]), month = Number(parts[2]), year = Number(parts[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function normalizeField(input) {
  if (!input || input.tagName !== 'INPUT') return;
  if (input.matches('.manual-date')) {
    const raw = input.value, cursor = input.selectionStart;
    const before = cursor === null ? null : raw.slice(0, cursor).replace(/\D/g, '').length;
    input.value = displayDate(raw);
    if (before !== null && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      let position = 0, count = 0;
      while (position < input.value.length && count < before) {
        if (/\d/.test(input.value[position])) count++;
        position++;
      }
      input.setSelectionRange(position, position);
    }
  } else if (input.matches('.port,.cargo')) {
    const start = input.selectionStart, end = input.selectionEnd, raw = input.value;
    input.value = raw.toUpperCase();
    if (start !== null) input.setSelectionRange(raw.slice(0, start).toUpperCase().length, raw.slice(0, end).toUpperCase().length);
  }
}

function dateError(input) {
  return input.value !== '' && !realDate(input.value) ? 'Enter a real date in DD.MM.YYYY format.' : '';
}

function validateDates(showValidation) {
  const issues = [];
  document.querySelectorAll('.manual-date').forEach(input => {
    const error = dateError(input);
    input.setCustomValidity(error);
    input.classList.toggle('invalid-input', !!error);
    input.setAttribute('aria-invalid', String(!!error));
    if (error) {
      const card = input.closest('.voyage');
      const label = card ? 'Voyage ' + card.querySelector('.voyage-number').textContent + ' B/L date' : 'Calculation date';
      issues.push(label + ': ' + error);
      if (card) {
        const status = card.querySelector('.row-status');
        status.textContent += ' B/L date: ' + error;
        status.className = 'row-status';
      }
    }
  });
  if (showValidation && issues.length) {
    const summary = document.getElementById('validationSummary');
    if (summary.classList.contains('has-success')) summary.textContent = '';
    summary.className = 'validation-summary has-errors';
    summary.textContent = [summary.textContent, ...issues].filter(Boolean).join(' ');
  }
  return issues.length === 0;
}

function orderedInputs() {
  return [...document.querySelectorAll('.vessel-fields input, #voyages .voyage input')]
    .filter(input => !input.disabled && input.type !== 'hidden');
}

// Shared by Android IME Next, hardware Enter and Tab. Closed voyage cards
// are opened when their first field is reached so dates cannot be skipped.
window.vefNextField = function(backwards = false) {
  const inputs = orderedInputs(), current = document.activeElement;
  const index = inputs.indexOf(current);
  if (index < 0) return false;
  normalizeField(current);
  if (!backwards && current.matches('.manual-date') && dateError(current)) {
    refresh(true);
    current.reportValidity();
    return true;
  }
  const next = inputs[index + (backwards ? -1 : 1)];
  if (next) {
    const card = next.closest('.voyage');
    if (card) card.open = true;
    next.focus();
  } else if (!backwards) document.getElementById('calculate').focus();
  return true;
};

document.addEventListener('input', event => {
  if (!event.isComposing) normalizeField(event.target);
}, true);
document.addEventListener('compositionend', event => {
  normalizeField(event.target);
  if (event.target.closest('.voyage')) refresh();
});
document.addEventListener('beforeinput', event => {
  const input = event.target;
  if (!input.matches('.manual-date') || input.selectionStart !== input.selectionEnd) return;
  const cursor = input.selectionStart;
  const backwards = event.inputType === 'deleteContentBackward';
  const forwards = event.inputType === 'deleteContentForward';
  if ((backwards && input.value[cursor - 1] === '.') || (forwards && input.value[cursor] === '.')) {
    event.preventDefault();
    const start = backwards ? cursor - 2 : cursor;
    const end = backwards ? cursor : cursor + 2;
    input.value = input.value.slice(0, start) + input.value.slice(end);
    input.setSelectionRange(start, start);
    normalizeField(input);
    input.dispatchEvent(new Event('input', {bubbles: true}));
  }
});
document.addEventListener('keydown', event => {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === 'Enter' || (event.key === 'Tab' && !(event.shiftKey && document.activeElement === orderedInputs()[0]))) {
    if (window.vefNextField(event.key === 'Tab' && event.shiftKey)) event.preventDefault();
  }
});
