/* Shared surfaces. Figma supplies geometry and assets; 180/160/150ms motion is a project adaptation. */
(() => {
  'use strict';
  if (!document.documentElement.matches('[data-workbench="ai"], [data-workbench="voice"]')) return;
  if (window.GKXSurface) { window.GKXSurface.polish(document); return; }

  const baseURL = document.currentScript?.src || document.baseURI;
  const asset = name => new URL(`figma-assets/${name}`, baseURL).href;
  const assets = { close: asset('close.svg'), success: asset('message-success.svg'), info: asset('message-info.svg') };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const closing = new WeakMap();
  const pendingClosures = new Set();
  const closeSelector = 'button.close,button.modal-close,button[data-confirm-close]';
  let toastTimer = 0;
  let polishPending = false;

  function image(src, width, height, className = '') {
    const node = document.createElement('img');
    node.src = src; node.width = width; node.height = height; node.alt = '';
    node.setAttribute('aria-hidden', 'true'); node.draggable = false;
    if (className) node.className = className;
    return node;
  }
  function toneFor(message, requested) {
    if (['info', 'success', 'warning', 'error'].includes(requested)) return requested;
    if (/(?:未接入|不可用|暂不|未能|失败|错误|未完成|请|尚未)/u.test(message)) return 'info';
    return /^(?:(?:保存|添加|删除|撤回|恢复|清空)成功(?:[，。！!]|$)|已(?:保存|添加|删除|撤回|恢复|清空)(?:[，。！!]|$))/u.test(message) ? 'success' : 'info';
  }
  function notify(message, options = {}) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    const value = String(message ?? '');
    const tone = toneFor(value, options?.tone);
    const icon = document.createElement('span'); icon.className = 'gkx-message-icon'; icon.setAttribute('aria-hidden', 'true');
    icon.append(tone === 'success' ? image(assets.success, 20, 20) : image(assets.info, 16, 16));
    const content = document.createElement('span'); content.className = 'gkx-message-text'; content.textContent = value;
    toast.dataset.tone = tone;
    toast.setAttribute('role', tone === 'warning' || tone === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', tone === 'warning' || tone === 'error' ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.replaceChildren(icon, content);
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function closeDialog(dialog, value = 'cancel') {
    const prior = closing.get(dialog);
    if (prior) return prior.promise;
    if (!dialog || typeof dialog.close !== 'function' || !dialog.open) return Promise.resolve(dialog?.returnValue);
    let resolve;
    const state = { dialog, value: String(value), timer: 0, promise: new Promise(done => { resolve = done; }), finish: null };
    const oldBusy = dialog.getAttribute('aria-busy');
    const stopRepeat = event => {
      if (event.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    const cleanup = () => {
      clearTimeout(state.timer);
      dialog.classList.remove('is-closing');
      if (oldBusy === null) dialog.removeAttribute('aria-busy'); else dialog.setAttribute('aria-busy', oldBusy);
      dialog.removeEventListener('click', stopRepeat, true);
      dialog.removeEventListener('submit', stopRepeat, true);
      dialog.removeEventListener('keydown', stopRepeat, true);
      dialog.removeEventListener('animationend', onAnimationEnd);
      dialog.removeEventListener('close', onNativeClose);
      closing.delete(dialog); pendingClosures.delete(state);
    };
    const finish = () => {
      if (closing.get(dialog) !== state) return;
      const result = dialog.open ? state.value : dialog.returnValue;
      cleanup();
      if (dialog.open) dialog.close(result);
      resolve(result);
    };
    const onAnimationEnd = event => { if (event.target === dialog && event.animationName === 'gkx-dialog-out') finish(); };
    const onNativeClose = () => { cleanup(); resolve(dialog.returnValue); };
    state.finish = finish;
    closing.set(dialog, state); pendingClosures.add(state);
    dialog.addEventListener('close', onNativeClose, { once: true });
    if (reduceMotion.matches) { finish(); return state.promise; }
    dialog.setAttribute('aria-busy', 'true');
    dialog.addEventListener('click', stopRepeat, true);
    dialog.addEventListener('submit', stopRepeat, true);
    dialog.addEventListener('keydown', stopRepeat, true);
    dialog.addEventListener('animationend', onAnimationEnd);
    dialog.classList.add('is-closing');
    state.timer = setTimeout(finish, 160);
    return state.promise;
  }

  function matching(root, selector) {
    if (!root?.querySelectorAll) return [];
    return [...(root instanceof Element && root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
  }
  function polish(root = document) {
    matching(root, closeSelector).forEach(button => {
      button.classList.add('gkx-close-control');
      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', '关闭');
      if (!button.querySelector(':scope > .gkx-close-icon')) button.replaceChildren(image(assets.close, 16, 16, 'gkx-close-icon'));
    });
    matching(root, '.gkx-file-name,.gkx-truncate').forEach(name => {
      const title = name.textContent.trim();
      if (name.title !== title) name.title = title;
    });
    matching(root, '.nav-item').forEach(item => {
      if (!item.hasAttribute('title')) item.title = item.textContent.trim();
    });
    matching(root, 'table').forEach(table => {
      const markedHeaders = [...table.querySelectorAll('thead th[data-operation-column]')];
      const lastHeader = table.querySelector('thead tr:last-child > th:last-child');
      const visibleHeader = lastHeader && !lastHeader.hidden && !lastHeader.closest('[hidden]')
        && getComputedStyle(lastHeader).display !== 'none' && getComputedStyle(lastHeader).visibility !== 'hidden';
      // Only the final column is supported. An explicit marker elsewhere disables guessing.
      const operationHeader = !visibleHeader ? null : markedHeaders.length
        ? lastHeader.hasAttribute('data-operation-column') && lastHeader.getAttribute('data-operation-column') !== 'false' ? lastHeader : null
        : lastHeader.textContent.trim() === '操作' ? lastHeader : null;
      const index = table.getAttribute('data-operation-column') === 'false' ? -1 : operationHeader?.cellIndex ?? -1;
      const sticky = index >= 0;
      if (table.classList.contains('gkx-sticky-actions') !== sticky) table.classList.toggle('gkx-sticky-actions', sticky);
      [...table.rows].forEach(row => [...row.cells].forEach((cell, column) => {
        const operation = sticky && column === index && cell.colSpan === 1 && !cell.hidden;
        if (cell.classList.contains('gkx-operation-cell') !== operation) cell.classList.toggle('gkx-operation-cell', operation);
      }));
    });
  }
  function relevant(node) {
    return node instanceof Element && (node.matches(`${closeSelector},.gkx-file-name,.gkx-truncate,.nav-item,table,tr`) || !!node.querySelector(`${closeSelector},.gkx-file-name,.gkx-truncate,.nav-item,table,tr`));
  }
  const observer = new MutationObserver(records => {
    if (polishPending || !records.some(record => (record.target instanceof Element && (record.target.matches('.gkx-file-name,.gkx-truncate') || record.target.closest('thead') || record.type === 'attributes' && record.target.matches('table'))) || [...record.addedNodes].some(relevant))) return;
    polishPending = true;
    queueMicrotask(() => { polishPending = false; polish(document); });
  });
  const blockDisabledLink = event => {
    if (event.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes(event.key)) return;
    const target = event.target instanceof Element ? event.target.closest('.textlink[aria-disabled="true"],.gkx-selection-bar .link[aria-disabled="true"]') : null;
    if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  document.addEventListener('click', blockDisabledLink, true);
  document.addEventListener('keydown', blockDisabledLink, true);
  reduceMotion.addEventListener('change', event => { if (event.matches) [...pendingClosures].forEach(state => state.finish()); });
  window.GKXSurface = { notify, closeDialog, polish };
  polish(document);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-operation-column', 'hidden'] });
})();
