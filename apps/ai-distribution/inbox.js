/* Session-local state for the original workbench inbox reminder. */
(() => {
  'use strict';

  const message = {
    id: 'important-reminder',
    title: '重要情报提醒',
    body: '有一条重要情报已送达，请及时查看。',
    channel: '站内信',
    read: false,
  };
  const state = { filter: 'all', query: '', draft: '', listScroll: 0 };
  const filters = [['all', '全部'], ['unread', '未读'], ['read', '已读']];
  let binding = null;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim();
  const image = (name, size) => `<img src="assets/inbox/${name}.svg" width="${size}" height="${size}" alt="" aria-hidden="true">`;
  const counts = () => ({ all: 1, unread: message.read ? 0 : 1, read: message.read ? 1 : 0 });

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
    return `<article class="gkx-inbox-notification" data-inbox-id="${message.id}" aria-labelledby="inboxMessageTitle"><header class="gkx-inbox-message-head"><h2 class="gkx-inbox-message-title gkx-record-title" id="inboxMessageTitle" tabindex="-1">${escape(message.title)}</h2>${message.read ? '' : image('unread', 6)}<span class="gkx-inbox-message-status">${message.read ? '已读' : '未读'}</span></header><p class="gkx-inbox-message-body">${escape(message.body)}</p><footer class="gkx-inbox-message-footer"><span class="gkx-inbox-source">${image('source', 20)}${escape(message.channel)}</span><div class="gkx-inbox-message-actions"><button type="button" class="btn" data-inbox-action="toggle-read">标为${message.read ? '未读' : '已读'}</button><button type="button" class="link gkx-inbox-view" data-inbox-action="view">查看情报${image('arrow-right', 16)}</button></div></footer></article>`;
  }

  function render() {
    const totals = counts();
    return `<section class="gkx-inbox" aria-label="站内信"><div class="gkx-inbox-tools"><form class="gkx-inbox-query" role="search" aria-label="工作台消息检索"><label class="gkx-inbox-search-label" for="inboxQuery"><span>消息关键词</span><input class="control wide" type="search" id="inboxQuery" name="keyword" value="${escape(state.draft)}" placeholder="输入消息关键词" aria-label="搜索工作台消息" autocomplete="off"></label><div class="gkx-inbox-query-actions"><button type="submit" class="btn primary" data-inbox-action="query">查询</button><button type="reset" class="btn" data-inbox-action="reset">重置</button></div></form><div class="gkx-inbox-toolbar"><div class="gkx-inbox-tabs" role="group" aria-label="消息阅读状态">${filters.map(([value, label]) => `<button type="button" class="gkx-inbox-tab" data-inbox-action="filter" data-inbox-filter="${value}" aria-pressed="${state.filter === value}">${label}(${totals[value]})</button>`).join('')}</div><button type="button" class="btn" data-inbox-action="mark-all"${totals.unread ? '' : ' disabled'}>全部已读</button></div></div><div class="gkx-inbox-notifications" role="region" aria-label="站内信列表">${listMarkup()}</div><footer class="gkx-inbox-list-footer" aria-live="polite">共 ${matches() ? 1 : 0} 条</footer></section>`;
  }

  function remember() {
    const root = binding?.root;
    if (!root?.isConnected) return;
    const input = root.querySelector('#inboxQuery');
    if (input) state.draft = input.value;
    const list = root.querySelector('.gkx-inbox-notifications');
    if (list?.getClientRects().length) state.listScroll = list.scrollTop;
  }

  function focusFilter() {
    const root = binding?.root;
    (root?.querySelector('.gkx-inbox-tab[aria-pressed="true"]') || root?.querySelector('#inboxQuery'))?.focus({ preventScroll: true });
  }

  function focusMessage() {
    const root = binding?.root;
    if (!root?.isConnected) return false;
    const title = root.querySelector('.gkx-inbox-message-title');
    const target = title || root.querySelector('#inboxQuery');
    if (!target) return false;
    target.focus({ preventScroll: !title });
    return true;
  }

  function paint({ focusAction = null, preserveFocus = true } = {}) {
    const root = binding?.root;
    if (!root?.isConnected) return;
    const list = root.querySelector('.gkx-inbox-notifications');
    const active = document.activeElement;
    const action = focusAction || (preserveFocus && list.contains(active) ? active.closest('[data-inbox-action]')?.dataset.inboxAction : null);
    const titleFocused = preserveFocus && active?.classList.contains('gkx-inbox-message-title');
    const totals = counts();
    for (const [value, label] of filters) {
      const button = root.querySelector(`[data-inbox-filter="${value}"]`);
      button.textContent = `${label}(${totals[value]})`;
      button.setAttribute('aria-pressed', String(state.filter === value));
    }
    root.querySelector('[data-inbox-action="mark-all"]').disabled = !totals.unread;
    list.innerHTML = listMarkup();
    root.querySelector('.gkx-inbox-list-footer').textContent = `共 ${matches() ? 1 : 0} 条`;
    list.scrollTop = state.listScroll;
    if (action) {
      const target = list.querySelector(`[data-inbox-action="${action}"]`);
      if (target) target.focus({ preventScroll: true });
      else focusFilter();
    } else if (titleFocused) focusMessage();
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
    binding = { root, controller };
    const options = { signal: controller.signal };
    const query = root.querySelector('.gkx-inbox-query');
    const input = root.querySelector('#inboxQuery');
    const list = root.querySelector('.gkx-inbox-notifications');

    root.addEventListener('input', event => {
      if (event.target === input) state.draft = input.value;
    }, options);
    query.addEventListener('submit', event => {
      event.preventDefault();
      state.draft = input.value;
      state.query = input.value.trim();
      state.listScroll = 0;
      paint({ preserveFocus: false });
    }, options);
    query.addEventListener('reset', event => {
      event.preventDefault();
      input.value = '';
      state.draft = '';
      state.query = '';
      state.listScroll = 0;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      paint({ preserveFocus: false });
      input.focus({ preventScroll: true });
    }, options);
    list.addEventListener('scroll', () => {
      if (list.getClientRects().length) state.listScroll = list.scrollTop;
    }, { ...options, passive: true });
    root.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('button[data-inbox-action]') : null;
      if (!button || !root.contains(button) || button.disabled) return;
      const action = button.dataset.inboxAction;
      if (action === 'filter') {
        const filter = button.dataset.inboxFilter;
        if (!filters.some(([value]) => value === filter)) return;
        remember();
        if (state.filter !== filter) state.listScroll = 0;
        state.filter = filter;
        paint({ preserveFocus: false });
      } else if (action === 'toggle-read') {
        remember();
        message.read = !message.read;
        paint({ focusAction: 'toggle-read' });
        notify?.(message.read ? '消息已标为已读' : '消息已标为未读');
      } else if (action === 'mark-all' && !message.read) {
        remember();
        message.read = true;
        paint({ preserveFocus: false });
        focusFilter();
        notify?.('全部消息已标为已读');
      } else if (action === 'view') {
        remember();
        message.read = true;
        paint({ focusAction: 'view' });
        navigate?.('feed');
      }
    }, options);
    paint({ preserveFocus: false });
    return unbind;
  }

  window.GKXInbox = { render, bind, focusMessage, unbind };
})();
