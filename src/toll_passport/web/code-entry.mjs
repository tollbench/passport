// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Six boxes, one digit each, with the number pad on phones. Typing, paste and
// autofill all work. The digits stay in this isolated page.

export function mountCodeEntry(root, {label = 'Your 6-digit code', onComplete = () => {}} = {}) {
  if (!root || typeof onComplete !== 'function') throw Error('invalid');
  const doc = root.ownerDocument;
  const group = doc.createElement('div');
  group.className = 'code-entry';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const boxes = [];
  for (let i = 0; i < 6; i++) {
    const box = doc.createElement('input');
    box.type = 'text';
    box.inputMode = 'numeric';
    box.pattern = '[0-9]*';
    box.maxLength = 6;
    box.autocomplete = i === 0 ? 'one-time-code' : 'off';
    box.spellcheck = false;
    box.className = 'code-digit';
    box.setAttribute('aria-label', `Digit ${i + 1} of 6`);
    boxes.push(box);
    group.append(box);
  }
  const value = () => boxes.map(box => box.value).join('');
  const done = () => { const code = value(); if (/^[0-9]{6}$/.test(code)) onComplete(code); };
  function fill(from, digits) {
    let at = from;
    for (const digit of digits) { if (at > 5) break; boxes[at].value = digit; at++; }
    boxes[Math.min(at, 5)].focus();
    done();
  }
  boxes.forEach((box, index) => {
    box.addEventListener('input', () => {
      const digits = box.value.replace(/[^0-9]/g, '');
      box.value = '';
      if (digits) fill(index, digits);
    });
    box.addEventListener('keydown', event => {
      if (event.key === 'Backspace' && !box.value && index > 0) {
        event.preventDefault(); boxes[index - 1].value = ''; boxes[index - 1].focus();
      } else if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); boxes[index - 1].focus(); }
      else if (event.key === 'ArrowRight' && index < 5) { event.preventDefault(); boxes[index + 1].focus(); }
      else if (event.key === 'Enter') { event.preventDefault(); done(); }
    });
    box.addEventListener('paste', event => {
      const digits = (event.clipboardData?.getData('text') || '').replace(/[^0-9]/g, '');
      if (!digits) return;
      event.preventDefault();
      fill(index, digits);
    });
    box.addEventListener('focus', () => box.select());
  });
  root.replaceChildren(group);
  return {
    element: group,
    value,
    clear() { for (const box of boxes) box.value = ''; },
    focus() { (boxes.find(box => !box.value) || boxes[0]).focus({preventScroll: true}); },
    setDisabled(disabled) { for (const box of boxes) box.disabled = !!disabled; },
    shake() { group.classList.remove('code-wrong'); void group.offsetWidth; group.classList.add('code-wrong'); }
  };
}
