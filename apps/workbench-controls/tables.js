/* Shared in-memory list controls. Rows and existing business handlers are retained. */
(() => {
  'use strict';
  const controllers = new WeakMap();
  const states = new Map();
  const scriptURL = document.currentScript?.src || new URL('tables.js', location.href).href;
  const assets = new URL('figma-assets/table/', scriptURL);
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim();
  const tokens = value => normalize(value).split(/\s+/u).filter(Boolean);
  function computePage(records, query, filters, requestedPage = 1, pageSize = 10) {
    const words = tokens(query);
    const matched = records.filter(record => words.every(word => normalize(record.text).includes(word))
      && Object.entries(filters || {}).every(([key, value]) => !value || String(record.values?.[key] ?? '') === String(value)));
    const size = Math.max(1, Math.trunc(Number(pageSize)) || 10);
    const pages = Math.max(1, Math.ceil(matched.length / size));
    const page = Math.min(pages, Math.max(1, Math.trunc(Number(requestedPage)) || 1));
    const start = (page - 1) * size;
    return { total: records.length, matched: matched.length, pages, page, pageSize: size,
      from: matched.length ? start + 1 : 0, to: Math.min(start + size, matched.length),
      records: matched.slice(start, start + size) };
  }
  function pageNumbers(page, pages) {
    const selected = new Set([1, pages]);
    const start = Math.max(1, Math.min(page - 2, pages - 4));
    for (let n = start; n <= Math.min(pages, start + 4); n++) selected.add(n);
    const result = []; let last = 0;
    [...selected].sort((a, b) => a - b).forEach(n => {
      if (last && n - last > 1) result.push('gap');
      result.push(n); last = n;
    });
    return result;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className = 'btn') {
    const node = element('button', className, text); node.type = 'button'; return node;
  }
  function picture(name) {
    const img = document.createElement('img'); img.src = new URL(name + '.svg', assets).href;
    img.alt = ''; img.width = 12; img.height = 12; return img;
  }
  function isVisible(node) { return !!node?.isConnected && !node.closest('[hidden]'); }
  function resolveActions(table, source) {
    const value = typeof source === 'function' ? source(table) : source;
    if (value == null) return [];
    const nodes = [...new Set((Array.isArray(value) ? value : [value]).filter(node => node instanceof Element))];
    for (const node of nodes) {
      if (node.ownerDocument !== table.ownerDocument) throw new Error('Table operations must belong to the same document');
      if (node === table || node.contains(table) || table.contains(node)) throw new Error('Table operations must be outside the managed table');
      if (node.matches('form') || node.querySelector('form')) throw new Error('Table operations must not contain a form');
      if (nodes.some(other => other !== node && node.contains(other))) throw new Error('Table operations must not overlap');
      const owner = node.closest('.gkx-table-list');
      if (owner && owner.dataset.tableId !== table.id) throw new Error('Table operations already belong to another list');
    }
    return nodes;
  }
  function mount(table, config = {}) {
    if (!(table instanceof HTMLTableElement) || table.hasAttribute('data-gkx-table-exclude')) return null;
    if (controllers.has(table)) { const existing = controllers.get(table); existing.refresh({ reason: 'data' }); return existing; }
    const id = config.id || table.id;
    if (!id) throw new Error('Managed tables require a stable id');
    table.id = id;
    const operationNodes = resolveActions(table, config.actions);
    const focusedOperation = operationNodes.some(node => node.contains(document.activeElement)) ? document.activeElement : null;
    const label = config.label || '记录';
    const state = states.get(id) || { query: '', filters: {}, page: 1, pageSize: 10 };
    states.set(id, state);
    const definitions = config.filters || [];
    definitions.forEach(field => { if (!(field.key in state.filters)) state.filters[field.key] = ''; });
    const sizes = config.pageSizes || [10, 20, 50];
    if (!sizes.includes(state.pageSize)) state.pageSize = sizes[0];
    const wrap = table.closest('.table-wrap') || table;
    const shell = element('section', 'gkx-table-list'); shell.dataset.tableId = id;
    shell.setAttribute('aria-label', label + '列表');
    wrap.before(shell);
    const form = element('form', 'gkx-table-query'); form.setAttribute('role', 'search'); form.setAttribute('aria-label', label + '检索');
    const fields = element('div', 'gkx-table-fields');
    const keywordLabel = element('label', 'gkx-table-field');
    const keyword = element('input', 'control'); keyword.type = 'search'; keyword.id = id + '-keyword';
    keyword.name = 'keyword'; keyword.placeholder = config.placeholder || '输入关键词'; keyword.value = state.query;
    keyword.autocomplete = 'off'; keywordLabel.htmlFor = keyword.id;
    keywordLabel.append(element('span', 'gkx-table-label', config.searchLabel || '关键词'), keyword); fields.append(keywordLabel);
    const filterControls = new Map();
    definitions.forEach(field => {
      const holder = element('label', 'gkx-table-field');
      const select = element('select', 'control'); select.id = id + '-filter-' + field.key; select.name = field.key;
      holder.htmlFor = select.id;
      const options = (field.options || []).map(option => typeof option === 'string' ? { value: option, label: option } : option);
      if (!options.some(option => String(option.value) === '')) options.unshift({ value: '', label: '全部' });
      options.forEach(option => { const node = element('option', '', option.label); node.value = String(option.value); select.append(node); });
      if (!options.some(option => String(option.value) === String(state.filters[field.key]))) state.filters[field.key] = '';
      select.value = state.filters[field.key];
      holder.append(element('span', 'gkx-table-label', field.label), select); fields.append(holder); filterControls.set(field.key, select);
    });
    const actions = element('div', 'gkx-table-query-actions');
    const submit = button('查询', 'btn primary'); submit.type = 'submit';
    const reset = button('重置'); reset.type = 'reset'; actions.append(submit, reset); form.append(fields, actions);
    const toolbar = element('div', 'gkx-table-toolbar'); toolbar.append(form);
    if (operationNodes.length) {
      const operations = element('div', 'gkx-table-operations');
      for (const node of operationNodes) {
        const buttons = [...(node.matches('button') ? [node] : []), ...node.querySelectorAll('button')];
        buttons.forEach(control => { if (!control.hasAttribute('type')) control.type = 'button'; });
        operations.append(node);
      }
      toolbar.append(operations);
    }
    const footer = element('footer', 'gkx-table-footer');
    const count = element('output', 'gkx-table-count'); count.setAttribute('aria-live', 'polite'); count.setAttribute('aria-atomic', 'true');
    const pager = element('nav', 'gkx-table-pagination'); pager.setAttribute('aria-label', label + '分页');
    const prev = button('', 'gkx-page-button'); prev.setAttribute('aria-label', '上一页'); const prevIcon = picture('prev'); prev.append(prevIcon);
    const next = button('', 'gkx-page-button'); next.setAttribute('aria-label', '下一页'); const nextIcon = picture('next'); next.append(nextIcon);
    const numbers = element('div', 'gkx-table-pages');
    const sizeLabel = element('label', 'gkx-page-size');
    const size = element('select', 'control'); size.setAttribute('aria-label', label + '每页条数');
    sizes.forEach(n => { const option = element('option', '', n + ' 条/页'); option.value = n; size.append(option); }); size.value = state.pageSize;
    sizeLabel.append(size);
    const jumpForm = element('form', 'gkx-page-jump'); jumpForm.setAttribute('aria-label', label + '跳转页码');
    const jumpLabel = element('label', '', '跳至'); const jump = element('input', 'control'); jump.type = 'number'; jump.min = '1'; jump.step = '1';
    jump.id = id + '-jump'; jumpLabel.htmlFor = jump.id; jump.setAttribute('aria-label', label + '页码');
    const jumpButton = button('跳转'); jumpButton.type = 'submit'; jumpForm.append(jumpLabel, jump, element('span', '', '页'), jumpButton);
    pager.append(prev, numbers, next, sizeLabel, jumpForm); footer.append(count, pager);
    shell.append(toolbar, wrap, footer);
    if (focusedOperation && (document.activeElement === document.body || !document.activeElement)
      && isVisible(focusedOperation) && !focusedOperation.disabled && !focusedOperation.closest('[inert]')) {
      focusedOperation.focus({ preventScroll: true });
    }
    let allRows = [], shownRows = [], snapshot = null, callbackPending = false, lastReason = 'mount';
    let emptyRow = null;
    function collect() {
      const body = table.tBodies[0] || table.createTBody();
      const source = [...body.rows];
      source.filter(row => row !== emptyRow && row.cells.length === 1 && row.cells[0].colSpan > 1).forEach(row => { row.hidden = true; });
      allRows = source.filter(row => row !== emptyRow && !(row.cells.length === 1 && row.cells[0].colSpan > 1));
      if (!emptyRow?.isConnected) {
        emptyRow = element('tr', 'gkx-table-empty'); emptyRow.dataset.gkxTableEmpty = '';
        const cell = document.createElement('td'); cell.colSpan = Math.max(1, table.tHead?.rows[0]?.cells.length || allRows[0]?.cells.length || 1);
        emptyRow.append(cell); body.append(emptyRow);
      }
      return allRows.map(row => {
        const value = config.read ? config.read(row) : { text: row.textContent + ' ' + [...row.querySelectorAll('input:not([type=checkbox]),textarea')].map(input => input.value).join(' '), values: {} };
        return { row, text: value?.text ?? '', values: value?.values || {} };
      });
    }
    function clearSelection() {
      if (!config.selectable) return;
      table.querySelectorAll('.row-check,.select-all').forEach(check => { check.checked = false; check.indeterminate = false; });
    }
    function ensureFocus(preferred) {
      if (isVisible(preferred) && !preferred.disabled) { preferred.focus({ preventScroll: true }); return preferred; }
      const target = shownRows.flatMap(row => [...row.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')]).find(isVisible) || keyword;
      target.focus({ preventScroll: true }); return target;
    }
    const controller = { table, refresh, rows: () => [...allRows], visibleRows: () => [...shownRows], getState: () => snapshot ? { ...snapshot } : null, ensureFocus };
    controllers.set(table, controller);
    function notify(reason) {
      lastReason = reason;
      if (callbackPending) return; callbackPending = true;
      queueMicrotask(() => {
        callbackPending = false; if (!table.isConnected) return;
        config.onViewChange?.(controller, { reason: lastReason });
        table.dispatchEvent(new CustomEvent('gkx:table-viewchange', { bubbles: true, detail: { reason: lastReason, ...snapshot } }));
      });
    }
    function refresh({ reason = 'data' } = {}) {
      const active = document.activeElement;
      const rowWasFocused = table.contains(active);
      const focusedPage = numbers.contains(active);
      if (['query', 'page', 'size', 'reset'].includes(reason)) clearSelection();
      const result = computePage(collect(), state.query, state.filters, state.page, state.pageSize);
      state.page = result.page; shownRows = result.records.map(record => record.row);
      const visible = new Set(shownRows);
      allRows.forEach(row => { const hidden = !visible.has(row); if (row.hidden !== hidden) row.hidden = hidden; });
      if (config.selectable) allRows.filter(row => row.hidden).forEach(row => row.querySelectorAll('.row-check').forEach(check => { check.checked = false; check.indeterminate = false; }));
      emptyRow.hidden = result.matched !== 0;
      if (!result.matched) {
        const cell = emptyRow.cells[0]; cell.replaceChildren(element('p', '', result.total ? '暂无符合条件的记录' : config.emptyText || '暂无记录'));
        if (state.query || Object.values(state.filters).some(Boolean)) { const clear = button('重置筛选'); clear.addEventListener('click', resetQuery); cell.append(clear); }
      }
      snapshot = { total: result.total, matched: result.matched, page: result.page, pages: result.pages, pageSize: result.pageSize, from: result.from, to: result.to };
      count.textContent = result.total === result.matched ? `共 ${result.matched} 条` : `共 ${result.matched} 条，全部 ${result.total} 条`;
      prev.disabled = result.page <= 1 || !result.matched; next.disabled = result.page >= result.pages || !result.matched;
      prevIcon.src = new URL(prev.disabled ? 'prev-disabled.svg' : 'prev.svg', assets).href;
      nextIcon.style.opacity = next.disabled ? '.35' : '1';
      numbers.replaceChildren(...pageNumbers(result.page, result.pages).map(n => {
        if (n === 'gap') { const node = element('span', 'gkx-page-ellipsis'); node.setAttribute('aria-hidden', 'true'); node.append(picture('more')); return node; }
        const node = button(String(n), 'gkx-page-button'); node.setAttribute('aria-label', '第 ' + n + ' 页'); node.dataset.pageNumber = n;
        if (n === result.page) node.setAttribute('aria-current', 'page'); node.disabled = !result.matched;
        node.addEventListener('click', () => setPage(n)); return node;
      }));
      jump.max = String(result.pages); jump.value = String(result.page); jump.disabled = !result.matched; jumpButton.disabled = !result.matched;
      size.value = String(state.pageSize);
      if (focusedPage) numbers.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
      else if (rowWasFocused && !isVisible(active)) ensureFocus();
      notify(reason);
    }
    function setPage(value) {
      state.page = value; refresh({ reason: 'page' });
      if (document.activeElement === prev && prev.disabled || document.activeElement === next && next.disabled) numbers.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    }
    function query(event) {
      event?.preventDefault(); state.query = keyword.value.trim();
      filterControls.forEach((control, key) => { state.filters[key] = control.value; }); state.page = 1; refresh({ reason: 'query' });
    }
    function resetQuery(event) {
      event?.preventDefault(); keyword.value = ''; state.query = ''; state.page = 1;
      filterControls.forEach((control, key) => { control.value = ''; state.filters[key] = ''; control.dispatchEvent(new Event('change', { bubbles: true })); });
      refresh({ reason: 'reset' });
    }
    form.addEventListener('submit', query); form.addEventListener('reset', resetQuery);
    prev.addEventListener('click', () => setPage(state.page - 1)); next.addEventListener('click', () => setPage(state.page + 1));
    size.addEventListener('change', () => { state.pageSize = Number(size.value); state.page = 1; refresh({ reason: 'size' }); });
    jumpForm.addEventListener('submit', event => { event.preventDefault(); if (jump.checkValidity()) setPage(Number(jump.value)); else jump.reportValidity(); });
    refresh({ reason: 'mount' });
    return controller;
  }
  window.GKXTables = { mount, refresh: (table, options) => controllers.get(table)?.refresh(options),
    ensureFocus: (table, preferred) => controllers.get(table)?.ensureFocus(preferred),
    visibleRows: table => controllers.get(table)?.visibleRows() || [], computePage, pageNumbers };
  document.dispatchEvent(new Event('gkx:tables-ready'));
})();
