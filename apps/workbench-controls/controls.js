/* Shared native-control enhancement. Native values and business events stay authoritative. */
(() => {
  'use strict';
  if (window.GKXControls) { window.GKXControls.refresh(); return; }

  const scriptURL = document.currentScript?.src || document.baseURI;
  const clearImage = new URL('input-clear.svg', scriptURL).href;
  const selectMap = new WeakMap();
  const inputMap = new WeakMap();
  const selectStates = new Set();
  const inputStates = new Set();
  const errors = new Map();
  const composing = new WeakSet();
  const layoutProperties = ['width', 'min-width', 'max-width', 'flex', 'flex-basis', 'flex-grow', 'flex-shrink', 'grid-column', 'grid-row', 'grid-area', 'align-self', 'justify-self', 'order'];
  const layoutClasses = ['full', 'wide', 'context-select'];
  const relevantSelector = 'select,input,textarea,[contenteditable],option,optgroup,label';
  let serial = 0;
  let active = null;
  let pending = false;
  let positionFrame = 0;

  const uid = prefix => {
    let id;
    do { id = `${prefix}-${++serial}`; } while (document.getElementById(id));
    return id;
  };
  function attr(node, name, value) {
    if (value === null || value === undefined || value === false) {
      if (node.hasAttribute(name)) node.removeAttribute(name);
    } else if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value));
  }
  function token(node, name, enabled) {
    if (node.classList.contains(name) !== !!enabled) node.classList.toggle(name, !!enabled);
  }
  function text(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  function disabled(node) { return node.disabled || node.matches(':disabled'); }
  function focus(node, options = { preventScroll: true }) {
    if (node?.isConnected && !node.disabled) node.focus(options);
  }
  function labelText(node) {
    const explicit = node.getAttribute('aria-label');
    if (explicit) return explicit;
    const labelledBy = (node.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
    if (labelledBy) return labelledBy;
    const labels = [...(node.labels || [])].map(label => {
      const copy = label.cloneNode(true);
      copy.querySelectorAll('input,select,textarea,button,.gkx-select,.gkx-text-input,.gkx-field-error').forEach(child => child.remove());
      return copy.textContent.replace(/^[\s*＊]+|[：:]\s*$/g, '').trim();
    }).filter(Boolean);
    return labels.join(' ') || node.getAttribute('placeholder') || node.title || node.name || node.id || (node.tagName === 'SELECT' ? '选择选项' : '输入内容');
  }
  function syncLayout(state) {
    const { native, wrapper } = state;
    for (const name of layoutClasses) token(wrapper, name, native.classList.contains(name));
    attr(wrapper, 'data-control-id', native.id || null);
    for (const name of layoutProperties) {
      const value = native.style.getPropertyValue(name);
      const priority = native.style.getPropertyPriority(name);
      if (wrapper.style.getPropertyValue(name) !== value || wrapper.style.getPropertyPriority(name) !== priority) {
        if (value) wrapper.style.setProperty(name, value, priority); else wrapper.style.removeProperty(name);
      }
    }
  }
  function hookProperty(node, name, callback) {
    const own = Object.getOwnPropertyDescriptor(node, name);
    let owner = node;
    let descriptor = own;
    while (!descriptor && (owner = Object.getPrototypeOf(owner))) descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (!descriptor?.get || !descriptor?.set || own?.configurable === false) return () => {};
    const get = function () { return descriptor.get.call(this); };
    const set = function (value) { descriptor.set.call(this, value); callback(); };
    try { Object.defineProperty(node, name, { configurable: true, enumerable: descriptor.enumerable, get, set }); }
    catch { return () => {}; }
    return () => {
      if (Object.getOwnPropertyDescriptor(node, name)?.get !== get) return;
      if (own) Object.defineProperty(node, name, own); else delete node[name];
    };
  }
  function optionEntries(select) {
    return [...select.options].map(option => ({
      option, label: option.label || option.textContent || '', selected: option.selected,
      disabled: option.disabled || !!option.closest('optgroup')?.disabled, hidden: option.hidden,
    }));
  }
  function nativeFrom(node) {
    if (typeof node === 'string') node = document.querySelector(node);
    if (!(node instanceof Element)) return null;
    if (node.matches('input,select,textarea,[contenteditable]')) return node;
    return node.querySelector('select,input,textarea,[contenteditable]');
  }

  function closeMenu(restore = false) {
    if (!active) return;
    const state = active;
    active = null;
    state.menu?.remove();
    state.menu = null;
    state.optionButtons = [];
    token(state.wrapper, 'is-open', false);
    attr(state.trigger, 'aria-expanded', 'false');
    attr(state.trigger, 'aria-activedescendant', null);
    if (restore) focus(state.trigger);
  }
  function updatePosition() {
    positionFrame = 0;
    const state = active;
    if (!state) return;
    if (!state.native.isConnected || disabled(state.native) || state.wrapper.closest('[hidden],[inert]') || !state.trigger.getClientRects().length) {
      closeMenu(); return;
    }
    const rect = state.trigger.getBoundingClientRect();
    const gutter = 8, gap = 4;
    const desired = Math.min(224, state.entries.filter(entry => !entry.hidden).length * 32 + 10);
    const below = Math.max(0, innerHeight - rect.bottom - gutter - gap);
    const above = Math.max(0, rect.top - gutter - gap);
    const upward = below < Math.min(desired, 128) && above > below;
    const height = Math.min(desired, upward ? above : below);
    const width = Math.max(0, Math.min(rect.width, innerWidth - gutter * 2));
    Object.assign(state.menu.style, {
      position: 'fixed', left: `${Math.max(gutter, Math.min(rect.left, innerWidth - width - gutter))}px`,
      top: `${upward ? Math.max(gutter, rect.top - gap - height) : rect.bottom + gap}px`,
      width: `${width}px`, maxHeight: `${height}px`,
    });
    attr(state.menu, 'data-placement', upward ? 'top' : 'bottom');
  }
  function schedulePosition() {
    if (active && !positionFrame) positionFrame = requestAnimationFrame(updatePosition);
  }
  function setActive(state, index) {
    state.activeIndex = index;
    state.optionButtons.forEach((button, i) => token(button, 'is-active', i === index));
    if (active !== state) return;
    const button = state.optionButtons[index];
    attr(state.trigger, 'aria-activedescendant', button?.id || null);
    if (!button || !state.menu) return;
    const top = button.offsetTop, bottom = top + button.offsetHeight;
    if (top < state.menu.scrollTop) state.menu.scrollTop = top;
    else if (bottom > state.menu.scrollTop + state.menu.clientHeight) state.menu.scrollTop = bottom - state.menu.clientHeight;
  }
  function choose(state, index) {
    const entry = state.entries[index];
    if (!entry || entry.disabled || entry.hidden || disabled(state.native)) return;
    const before = [...state.native.options].map(option => option.selected).join(',');
    if (state.native.multiple) entry.option.selected = !entry.option.selected;
    else state.native.selectedIndex = index;
    const changed = before !== [...state.native.options].map(option => option.selected).join(',');
    if (!state.native.multiple) closeMenu();
    if (changed) {
      state.native.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      state.native.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
    if (state.native.isConnected) syncSelect(state);
    focus(state.trigger);
  }
  function renderMenu(state) {
    const menu = state.menu;
    menu.replaceChildren();
    state.optionButtons = state.entries.map((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.tabIndex = -1; button.id = `${state.listId}-option-${index}`;
      button.setAttribute('role', 'option');
      button.disabled = entry.disabled; button.hidden = entry.hidden;
      attr(button, 'aria-disabled', entry.disabled ? 'true' : null);
      attr(button, 'aria-selected', String(entry.selected));
      token(button, state.native.multiple ? 'is-selected' : 'active', entry.selected);
      text(button, entry.label);
      button.addEventListener('pointermove', () => { if (!entry.disabled && !entry.hidden) setActive(state, index); });
      button.addEventListener('click', () => choose(state, index));
      menu.append(button);
      return button;
    });
    setActive(state, state.enabled.includes(state.activeIndex) ? state.activeIndex : state.enabled[0]);
    updatePosition();
  }
  function openMenu(state, last = false) {
    syncSelect(state);
    if (disabled(state.native) || !state.enabled.length || state.wrapper.closest('[hidden],[inert]')) return;
    if (active && active !== state) closeMenu();
    if (active === state) return;
    active = state;
    const selected = state.entries.findIndex(entry => entry.selected && !entry.disabled && !entry.hidden);
    state.activeIndex = selected >= 0 ? selected : state.enabled[last ? state.enabled.length - 1 : 0];
    const menu = document.createElement('div');
    menu.className = `gkx-select-menu${state.native.multiple ? ' gkx-multiselect-menu' : ''}`;
    menu.id = state.listId; menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', labelText(state.native));
    attr(menu, 'aria-multiselectable', state.native.multiple ? 'true' : null);
    menu.addEventListener('pointerdown', event => event.preventDefault());
    menu.addEventListener('mousedown', event => event.preventDefault());
    state.menu = menu;
    token(state.wrapper, 'is-open', true);
    attr(state.trigger, 'aria-expanded', 'true');
    document.body.append(menu);
    renderMenu(state);
    focus(state.trigger);
  }
  function typeahead(state, key) {
    const now = Date.now();
    state.typed = (now - state.typedAt < 700 ? state.typed : '') + key;
    state.typedAt = now;
    const query = state.typed.toLocaleLowerCase();
    const index = state.entries.findIndex(entry => !entry.disabled && !entry.hidden && entry.label.toLocaleLowerCase().startsWith(query));
    if (index < 0) return false;
    openMenu(state); setActive(state, index); return true;
  }
  function selectKeydown(state, event) {
    if (disabled(state.native) || event.isComposing || event.keyCode === 229) return;
    const key = event.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (active !== state) openMenu(state, key === 'ArrowUp');
      else {
        const index = state.enabled.indexOf(state.activeIndex), direction = key === 'ArrowDown' ? 1 : -1;
        setActive(state, state.enabled[(index + direction + state.enabled.length) % state.enabled.length]);
      }
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault(); openMenu(state); setActive(state, state.enabled[key === 'Home' ? 0 : state.enabled.length - 1]);
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault(); if (active === state) choose(state, state.activeIndex); else openMenu(state);
    } else if (key === 'Escape' && active === state) {
      event.preventDefault(); event.stopPropagation(); closeMenu(true);
    } else if (key === 'Tab') closeMenu();
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && typeahead(state, key)) event.preventDefault();
  }
  function syncSelect(state) {
    const { native, trigger, valueNode } = state;
    if (!native.hidden) native.hidden = true;
    attr(native, 'aria-hidden', 'true');
    if (native.tabIndex !== -1) native.tabIndex = -1;
    syncLayout(state);
    const next = optionEntries(native);
    const signature = JSON.stringify(next.map(entry => [entry.label, entry.option.value, entry.selected, entry.disabled, entry.hidden]));
    const changed = signature !== state.signature;
    state.signature = signature; state.entries = next;
    state.enabled = next.flatMap((entry, index) => entry.disabled || entry.hidden ? [] : [index]);
    const selected = next.filter(entry => entry.selected);
    const label = selected.map(entry => entry.label).join('、');
    text(valueNode, label || native.getAttribute('placeholder') || '请选择');
    const firstOptionPlaceholder = native.selectedIndex === 0 && ['选择字段', '套用模板'].includes(label);
    token(valueNode, 'is-placeholder', !label || (!native.multiple && (selected[0]?.option.value === '' || firstOptionPlaceholder)));
    if (trigger.disabled !== disabled(native)) trigger.disabled = disabled(native);
    const labelledBy = native.getAttribute('aria-labelledby');
    attr(trigger, 'aria-labelledby', labelledBy);
    attr(trigger, 'aria-label', labelledBy ? null : labelText(native));
    attr(trigger, 'aria-required', native.required ? 'true' : null);
    attr(trigger, 'aria-invalid', native.getAttribute('aria-invalid'));
    attr(trigger, 'aria-describedby', native.getAttribute('aria-describedby'));
    attr(trigger, 'title', native.getAttribute('title'));
    const tabIndex = state.originalTabIndex === null ? 0 : Number(state.originalTabIndex);
    if (trigger.tabIndex !== tabIndex) trigger.tabIndex = tabIndex;
    if (active === state) {
      if (disabled(native) || !native.isConnected) closeMenu();
      else if (changed) renderMenu(state);
      else schedulePosition();
    }
    syncInvalid(native);
  }
  function enhanceSelect(native) {
    if (selectMap.has(native)) { syncSelect(selectMap.get(native)); return; }
    if (native.hidden || native.closest('[data-gkx-controls="off"]')) return;
    const wrapper = document.createElement('span'); wrapper.className = 'gkx-select';
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'gkx-select-trigger'; trigger.id = uid('gkx-select-trigger');
    trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const valueNode = document.createElement('span'); valueNode.className = 'gkx-select-value';
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 24 24'); arrow.setAttribute('aria-hidden', 'true'); arrow.classList.add('gkx-select-arrow');
    arrow.innerHTML = '<path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    trigger.append(valueNode, arrow);
    const state = { native, wrapper, trigger, valueNode, listId: uid('gkx-select-menu'), entries: [], enabled: [], optionButtons: [], activeIndex: 0,
      typed: '', typedAt: 0, signature: '', menu: null, originalHidden: native.hidden,
      originalAriaHidden: native.getAttribute('aria-hidden'), originalTabIndex: native.getAttribute('tabindex'), originalFocus: Object.getOwnPropertyDescriptor(native, 'focus'), cleanups: [] };
    trigger.setAttribute('aria-controls', state.listId);
    native.before(wrapper); wrapper.append(native, trigger);
    native.hidden = true; native.setAttribute('aria-hidden', 'true'); native.tabIndex = -1;
    native.setAttribute('data-gkx-native-select', 'true');
    selectMap.set(native, state); selectStates.add(state);
    state.cleanups.push(hookProperty(native, 'value', () => syncSelect(state)), hookProperty(native, 'selectedIndex', () => syncSelect(state)));
    try { Object.defineProperty(native, 'focus', { configurable: true, value: options => focus(trigger, options) }); } catch { /* A locked instance retains its native focus method. */ }
    trigger.addEventListener('keydown', event => selectKeydown(state, event));
    trigger.addEventListener('click', () => active === state ? closeMenu() : openMenu(state));
    trigger.addEventListener('blur', () => { if (active === state) closeMenu(); });
    syncSelect(state);
  }

  function syncInput(state) {
    const { native, wrapper, clear } = state;
    syncLayout(state);
    if (wrapper.hidden !== native.hidden) wrapper.hidden = native.hidden;
    const visible = !native.hidden && native.value.length > 0 && !native.readOnly && !disabled(native) && !composing.has(native);
    token(wrapper, 'has-clear', visible);
    if (clear.hidden !== !visible) clear.hidden = !visible;
    if (clear.disabled !== !visible) clear.disabled = !visible;
    clear.tabIndex = visible ? 0 : -1;
    attr(clear, 'aria-label', `清空${labelText(native)}`);
    attr(clear, 'title', `清空${labelText(native)}`);
    syncInvalid(native);
  }
  function enhanceInput(native) {
    if (inputMap.has(native)) { syncInput(inputMap.get(native)); return; }
    if (native.hidden || composing.has(native) || native.closest('[data-gkx-controls="off"]')) return;
    const wrapper = document.createElement('span'); wrapper.className = 'gkx-text-input';
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'gkx-clear-button'; clear.hidden = true; clear.tabIndex = -1;
    const image = document.createElement('img'); image.src = clearImage; image.width = 16; image.height = 16; image.alt = ''; image.setAttribute('aria-hidden', 'true');
    clear.append(image);
    const wasFocused = document.activeElement === native;
    native.before(wrapper); wrapper.append(native, clear);
    const state = { native, wrapper, clear, cleanups: [] };
    inputMap.set(native, state); inputStates.add(state);
    state.cleanups.push(hookProperty(native, 'value', () => syncInput(state)));
    clear.addEventListener('pointerdown', event => event.preventDefault());
    clear.addEventListener('mousedown', event => event.preventDefault());
    clear.addEventListener('click', () => {
      if (native.readOnly || disabled(native) || composing.has(native)) return;
      native.value = '';
      native.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      native.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      if (native.isConnected) { syncInput(state); focus(native); }
    });
    syncInput(state);
    if (wasFocused) focus(native);
  }

  function syncInvalid(native) {
    const state = selectMap.get(native) || inputMap.get(native);
    const invalid = native.getAttribute('aria-invalid') === 'true';
    if (state) {
      token(state.wrapper, 'is-invalid', invalid);
      attr(state.wrapper, 'aria-invalid', invalid ? 'true' : null);
      attr(state.wrapper, 'data-invalid-message', native.getAttribute('data-invalid-message'));
      if (state.trigger) {
        attr(state.trigger, 'aria-invalid', native.getAttribute('aria-invalid'));
        attr(state.trigger, 'aria-describedby', native.getAttribute('aria-describedby'));
      }
    }
    const error = errors.get(native);
    if (error) {
      const anchor = state?.wrapper || native;
      if (error.element.previousElementSibling !== anchor) anchor.after(error.element);
    }
  }
  function setInvalid(element, message) {
    const native = nativeFrom(element);
    if (!native) return;
    refresh(native);
    let error = errors.get(native);
    if (!error) {
      const node = document.createElement('span'); node.className = 'gkx-field-error'; node.id = uid('gkx-field-error'); node.setAttribute('role', 'alert');
      error = { element: node }; errors.set(native, error);
    }
    text(error.element, String(message || '请检查此项内容'));
    attr(native, 'aria-invalid', 'true'); attr(native, 'data-invalid-message', error.element.textContent);
    const ids = new Set((native.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)); ids.add(error.element.id);
    attr(native, 'aria-describedby', [...ids].join(' '));
    syncInvalid(native);
  }
  function clearInvalid(element) {
    const native = nativeFrom(element);
    if (!native) return;
    const error = errors.get(native);
    if (error) {
      const ids = (native.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== error.element.id);
      attr(native, 'aria-describedby', ids.length ? ids.join(' ') : null);
      error.element.remove(); errors.delete(native);
    }
    attr(native, 'aria-invalid', null); attr(native, 'data-invalid-message', null);
    syncInvalid(native);
  }
  function cleanDisconnected() {
    for (const state of selectStates) {
      if (state.native.isConnected && state.wrapper.contains(state.native) && state.wrapper.isConnected) continue;
      if (active === state) closeMenu();
      state.cleanups.forEach(cleanup => cleanup());
      try { if (state.originalFocus) Object.defineProperty(state.native, 'focus', state.originalFocus); else delete state.native.focus; } catch { /* No prototype changes were made. */ }
      state.native.hidden = state.originalHidden;
      attr(state.native, 'aria-hidden', state.originalAriaHidden);
      attr(state.native, 'tabindex', state.originalTabIndex);
      state.native.removeAttribute('data-gkx-native-select');
      selectMap.delete(state.native); selectStates.delete(state);
      if (state.wrapper.isConnected && !state.wrapper.contains(state.native)) state.wrapper.remove();
    }
    for (const state of inputStates) {
      if (state.native.isConnected && state.wrapper.contains(state.native) && state.wrapper.isConnected) continue;
      state.cleanups.forEach(cleanup => cleanup());
      inputMap.delete(state.native); inputStates.delete(state);
      if (state.wrapper.isConnected && !state.wrapper.contains(state.native)) state.wrapper.remove();
    }
    for (const [native] of errors) if (!native.isConnected) clearInvalid(native);
  }
  function refresh(root = document) {
    cleanDisconnected();
    if (!root?.querySelectorAll) return;
    const nodes = [...(root instanceof Element && root.matches('select,input,textarea,[contenteditable]') ? [root] : []), ...root.querySelectorAll('select,input,textarea,[contenteditable]')];
    for (const node of nodes) {
      if (node.closest('.gkx-select-menu,.gkx-clear-button,[data-gkx-controls="off"]')) continue;
      if (node.tagName === 'SELECT') enhanceSelect(node);
      else if (node.tagName === 'TEXTAREA') { token(node, 'gkx-field', true); syncInvalid(node); }
      else if (node.tagName === 'INPUT') {
        if (node.type === 'checkbox') token(node, 'gkx-check', true);
        else if (node.type === 'range') token(node, 'gkx-range', true);
        else if (['text', 'search', 'time'].includes(node.type)) {
          token(node, 'gkx-field', true);
          if (['text', 'search'].includes(node.type)) enhanceInput(node);
        }
      } else if (node.hasAttribute('contenteditable')) {
        token(node, 'gkx-editable', true);
        attr(node, 'role', 'textbox'); attr(node, 'aria-multiline', 'true');
        attr(node, 'aria-readonly', node.contentEditable === 'false' ? 'true' : null);
      }
    }
    if (active) updatePosition();
  }
  function scheduleRefresh() {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; refresh(); });
  }
  function hasRelevantNode(node) {
    return node instanceof Element && (node.matches(relevantSelector) || !!node.querySelector(relevantSelector));
  }
  const observer = new MutationObserver(records => {
    const relevant = records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!target || target.closest('.gkx-select-menu,.gkx-select-trigger,.gkx-clear-button,.gkx-field-error')) return false;
      if (record.type === 'attributes') {
        if (target.matches('.gkx-select,.gkx-text-input')) return false;
        return target.matches(relevantSelector) || target.tagName === 'FIELDSET' || (active && target.contains(active.wrapper));
      }
      if (target.closest('select,label')) return true;
      return [...record.addedNodes || [], ...record.removedNodes || []].some(hasRelevantNode);
    });
    if (relevant) scheduleRefresh();
  });

  // Window capture closes the popup before modal-level Escape and Tab handlers run.
  window.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
    else if (event.key === 'Tab') closeMenu();
  }, true);
  document.addEventListener('pointerdown', event => {
    if (active && !active.wrapper.contains(event.target) && !active.menu.contains(event.target)) closeMenu();
  }, true);
  document.addEventListener('focusin', event => {
    if (active && !active.wrapper.contains(event.target) && !active.menu.contains(event.target)) closeMenu();
    const state = inputMap.get(event.target); if (state) syncInput(state);
  });
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || event.target.closest('button,input,select,textarea,a')) return;
    const label = event.target.closest('label');
    const native = label?.control || label?.querySelector('select');
    const state = selectMap.get(native);
    if (state) { event.preventDefault(); focus(state.trigger); }
  });
  function nativeEvent(event) {
    const node = event.target;
    if (!(node instanceof Element) || !node.matches('input,select,textarea,[contenteditable]')) return;
    clearInvalid(node);
    if (event.isComposing || composing.has(node)) return;
    const select = selectMap.get(node); if (select) syncSelect(select);
    const input = inputMap.get(node); if (input) syncInput(input);
  }
  document.addEventListener('input', nativeEvent, true);
  document.addEventListener('change', nativeEvent, true);
  document.addEventListener('compositionstart', event => { composing.add(event.target); const state = inputMap.get(event.target); if (state) syncInput(state); }, true);
  document.addEventListener('compositionend', event => { composing.delete(event.target); const state = inputMap.get(event.target); if (state) syncInput(state); scheduleRefresh(); }, true);
  document.addEventListener('reset', () => queueMicrotask(scheduleRefresh), true);
  window.addEventListener('resize', schedulePosition);
  window.addEventListener('scroll', schedulePosition, true);
  window.visualViewport?.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('scroll', schedulePosition);
  window.addEventListener('pagehide', () => closeMenu());

  window.GKXControls = { refresh, setInvalid, clearInvalid };
  refresh();
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['disabled', 'readonly', 'value', 'selected', 'multiple', 'label', 'required', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-invalid', 'tabindex', 'class', 'style', 'hidden', 'inert', 'contenteditable'] });
})();
