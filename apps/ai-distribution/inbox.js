/* Session-local inbox for the original workbench reminder. */
(() => {
  'use strict';

  const message = {
    id: 'important-reminder',
    title: '重要情报提醒',
    body: '有一条重要情报已送达，请及时查看。',
    channel: '站内信',
    read: false,
  };
  const state = { filter: 'all', query: '', draft: '', selected: null, listScroll: 0 };
  const filters = [['all', '全部'], ['unread', '未读'], ['read', '已读']];
  let binding = null;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim();
  const image = (name, size) => `<img src="assets/inbox/${name}.svg" width="${size}" height="${size}" alt="" aria-hidden="true">`;
  const counts = () => ({ all: 1, unread: message.read ? 0 : 1, read: message.read ? 1 : 0 });
  const hasReader = () => state.selected === message.id;

  function matches() {
    if (state.filter === 'unread' && message.read || state.filter === 'read' && !message.read) return false;
    const text = normalize([message.title, message.body, message.channel].join(' '));
    return normalize(state.query).split(/\s+/u).filter(Boolean).every(word => text.includes(word));
  }

  function listMarkup() {
    if (!matches()) {
      const title = state.query ? '未找到符合条件的消息' : state.filter === 'unread' ? '暂无未读消息' : state.filter === 'read' ? '暂无已读消息' : '暂无消息';
      return `<div class="gkx-inbox-empty"><strong>${title}</strong><p>请调整关键词或消息阅读状态。</p></div>`;
    }
    return `<ul class="gkx-inbox-items"><li><button type="button" class="gkx-inbox-item" data-inbox-action="open" data-inbox-id="${message.id}"${hasReader() ? ' aria-current="true"' : ''} aria-label="${escape(message.title)}，${message.read ? '已读' : '未读'}，查看消息"><span class="gkx-inbox-item-head"><span class="gkx-inbox-item-title"><strong>${escape(message.title)}</strong>${message.read ? '' : image('unread', 6)}</span></span><p class="gkx-inbox-item-summary">${escape(message.body)}</p><div class="gkx-inbox-item-footer"><span class="gkx-inbox-source">${image('source', 20)}${escape(message.channel)}</span><span class="gkx-inbox-open">查看消息${image('arrow-right', 16)}</span></div></button></li></ul>`;
  }

  function readerMarkup() {
    if (!hasReader()) return '<div class="gkx-inbox-reader-placeholder"><strong>选择一条消息</strong><p>选择消息后在此查看内容。</p></div>';
    return `<article class="gkx-inbox-article"><div class="gkx-inbox-reader-toolbar"><button type="button" class="link gkx-inbox-back" data-inbox-action="back">返回消息列表</button><button type="button" class="btn" data-inbox-action="toggle-read">标为${message.read ? '未读' : '已读'}</button><button type="button" class="gkx-inbox-close" data-inbox-action="close" aria-label="关闭消息">${image('close', 16)}</button></div><header class="gkx-inbox-article-header"><h2 class="gkx-inbox-title" tabindex="-1">${escape(message.title)}</h2><div class="gkx-inbox-meta"><span class="gkx-inbox-source">${image('source', 20)}${escape(message.channel)}</span><span>${message.read ? '已读' : '未读'}</span></div></header><div class="gkx-inbox-body"><p>${escape(message.body)}</p></div><footer class="gkx-inbox-article-actions"><button type="button" class="link gkx-inbox-browse" data-inbox-action="browse">浏览情报列表${image('arrow-right', 16)}</button></footer></article>`;
  }

  function render() {
    const totals = counts();
    return `<section class="gkx-inbox" aria-label="工作台消息"><form class="gkx-inbox-query" role="search" aria-label="工作台消息检索"><label class="gkx-inbox-search-label" for="inboxQuery"><span>消息关键词</span><input class="control wide" type="search" id="inboxQuery" name="keyword" value="${escape(state.draft)}" placeholder="输入消息关键词" aria-label="搜索工作台消息" autocomplete="off"></label><div class="gkx-inbox-query-actions"><button type="submit" class="btn primary" data-inbox-action="query">查询</button><button type="reset" class="btn" data-inbox-action="reset">重置</button></div></form><div class="gkx-inbox-toolbar"><div class="gkx-inbox-tabs" role="group" aria-label="消息阅读状态">${filters.map(([value, label]) => `<button type="button" class="gkx-inbox-tab" data-inbox-action="filter" data-inbox-filter="${value}" aria-pressed="${state.filter === value}">${label}(${totals[value]})</button>`).join('')}</div><button type="button" class="btn" data-inbox-action="mark-all"${totals.unread ? '' : ' disabled'}>全部已读</button></div><div class="gkx-inbox-layout" data-reading="${hasReader()}"><section class="gkx-inbox-list-panel" aria-label="消息列表"><div class="gkx-inbox-list">${listMarkup()}</div><footer class="gkx-inbox-list-footer" aria-live="polite">共 ${matches() ? 1 : 0} 条</footer></section><section class="gkx-inbox-reader" aria-label="消息阅读区">${readerMarkup()}</section></div></section>`;
  }

  function remember() {
    const root = binding?.root;
    if (!root?.isConnected) return;
    const input = root.querySelector('#inboxQuery');
    if (input) state.draft = input.value;
    const list = root.querySelector('.gkx-inbox-list');
    if (list?.getClientRects().length) state.listScroll = list.scrollTop;
  }

  function focusReader() {
    const title = binding?.root.querySelector('.gkx-inbox-title');
    if (!hasReader() || !title?.isConnected) return false;
    title.focus({ preventScroll: false });
    return true;
  }

  function paint({ focusTitle = false, preserveReaderFocus = true } = {}) {
    const root = binding?.root;
    if (!root?.isConnected) return;
    const reader = root.querySelector('.gkx-inbox-reader');
    const active = document.activeElement;
    const action = preserveReaderFocus && reader.contains(active) ? active.closest('[data-inbox-action]')?.dataset.inboxAction : null;
    const titleFocused = preserveReaderFocus && active?.classList.contains('gkx-inbox-title');
    const totals = counts();
    for (const [value, label] of filters) {
      const button = root.querySelector(`[data-inbox-filter="${value}"]`);
      button.textContent = `${label}(${totals[value]})`;
      button.setAttribute('aria-pressed', String(state.filter === value));
    }
    root.querySelector('[data-inbox-action="mark-all"]').disabled = !totals.unread;
    const list = root.querySelector('.gkx-inbox-list');
    list.innerHTML = listMarkup();
    root.querySelector('.gkx-inbox-list-footer').textContent = `共 ${matches() ? 1 : 0} 条`;
    reader.innerHTML = readerMarkup();
    root.querySelector('.gkx-inbox-layout').dataset.reading = String(hasReader());
    list.scrollTop = state.listScroll;
    if (focusTitle) focusReader();
    else if (action && hasReader()) reader.querySelector(`[data-inbox-action="${action}"]`)?.focus({ preventScroll: true });
    else if (titleFocused && hasReader()) reader.querySelector('.gkx-inbox-title')?.focus({ preventScroll: true });
  }

  function closeReader() {
    if (!hasReader()) return;
    remember();
    const selected = state.selected;
    state.selected = null;
    paint({ preserveReaderFocus: false });
    const root = binding?.root;
    (root?.querySelector(`[data-inbox-id="${selected}"]`) || root?.querySelector('#inboxQuery'))?.focus({ preventScroll: true });
  }

  function unbind() {
    if (!binding) return;
    remember();
    binding.controller.abort();
    binding = null;
  }

  function bind(page, { navigate, notify } = {}) {
    unbind();
    const root = page?.matches?.('.gkx-inbox') ? page : page?.querySelector('.gkx-inbox');
    if (!root) return;
    const controller = new AbortController();
    binding = { root, controller, navigate, notify };
    const options = { signal: controller.signal };
    const query = root.querySelector('.gkx-inbox-query');
    const input = root.querySelector('#inboxQuery');
    const list = root.querySelector('.gkx-inbox-list');

    root.addEventListener('input', event => {
      if (event.target === input) state.draft = input.value;
    }, options);
    query.addEventListener('submit', event => {
      event.preventDefault();
      state.draft = input.value;
      state.query = input.value.trim();
      state.selected = null;
      state.listScroll = 0;
      paint({ preserveReaderFocus: false });
    }, options);
    query.addEventListener('reset', event => {
      event.preventDefault();
      input.value = '';
      state.draft = '';
      state.query = '';
      state.selected = null;
      state.listScroll = 0;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      paint({ preserveReaderFocus: false });
      input.focus({ preventScroll: true });
    }, options);
    list.addEventListener('scroll', () => {
      if (list.getClientRects().length) state.listScroll = list.scrollTop;
    }, { ...options, passive: true });
    root.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('[data-inbox-action]') : null;
      if (!button || !root.contains(button) || button.disabled) return;
      const action = button.dataset.inboxAction;
      if (action === 'filter') {
        const filter = button.dataset.inboxFilter;
        if (!filters.some(([value]) => value === filter)) return;
        remember();
        if (state.filter !== filter) state.listScroll = 0;
        state.filter = filter;
        state.selected = null;
        paint({ preserveReaderFocus: false });
      } else if (action === 'open') {
        if (button.dataset.inboxId !== message.id) return;
        remember();
        state.selected = message.id;
        message.read = true;
        paint({ focusTitle: true });
      } else if (action === 'back' || action === 'close') {
        closeReader();
      } else if (action === 'toggle-read' && hasReader()) {
        remember();
        message.read = !message.read;
        paint();
        notify?.(message.read ? '消息已标为已读' : '消息已标为未读');
      } else if (action === 'mark-all' && !message.read) {
        remember();
        message.read = true;
        paint();
        if (document.activeElement === button || document.activeElement === document.body) root.querySelector('.gkx-inbox-tab[aria-pressed="true"]')?.focus({ preventScroll: true });
        notify?.('全部消息已标为已读');
      } else if (action === 'browse' && hasReader()) {
        remember();
        navigate?.('feed');
      }
    }, options);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented || !hasReader() || !root.isConnected || !root.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      closeReader();
    }, options);
    paint({ preserveReaderFocus: false });
    return unbind;
  }

  window.GKXInbox = { render, bind, focusReader, unbind };
})();
