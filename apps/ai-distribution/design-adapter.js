/* Shared presentation behavior, aligned with the portal admin reference.
 * Business examples remain in index.html; no service calls or persistence are added.
 */
(() => {
  const shell = document.querySelector('.shell');
  const panel = document.getElementById('drawer');
  const menu = document.getElementById('navigation');
  const content = document.getElementById('page');
  const mobile = matchMedia('(max-width: 767px)');
  let returnTarget = null;
  let lastTrigger = null;
  let opened = false;

  // Keep review controls available in both embedded and standalone mobile layouts.
  document.querySelector('.strip-right')?.append(document.getElementById('reviewToggle'));

  panel.setAttribute('role', 'dialog');
  panel.setAttribute('tabindex', '-1');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;
  document.querySelectorAll('.group-icon').forEach(icon => icon.setAttribute('aria-hidden', 'true'));

  document.addEventListener('click', event => {
    if (!panel.contains(event.target) && !opened) {
      lastTrigger = event.target.closest('button, input, select, textarea, a');
    }
  }, true);

  const focusable = () => [...panel.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
    .filter(el => !el.disabled && !el.hidden && el.getClientRects().length);

  function syncDrawer() {
    const isOpen = panel.classList.contains('open');
    const heading = panel.querySelector('h2');
    if (heading) {
      heading.id = 'drawerTitle';
      panel.setAttribute('aria-labelledby', heading.id);
    }
    if (isOpen === opened) return;
    opened = isOpen;
    panel.inert = !isOpen;
    panel.setAttribute('aria-hidden', String(!isOpen));
    shell.inert = isOpen;
    if (isOpen) {
      returnTarget = lastTrigger || document.activeElement;
      panel.setAttribute('aria-modal', 'true');
      panel.scrollTop = 0;
      const initial = panel.querySelector('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')
        || panel.querySelector('.close') || panel;
      initial.focus({ preventScroll: true });
    } else {
      panel.removeAttribute('aria-modal');
      const destination = returnTarget?.isConnected ? returnTarget : menu.querySelector('[aria-current="page"]');
      destination?.focus({ preventScroll: true });
      returnTarget = null;
    }
  }
  new MutationObserver(syncDrawer).observe(panel, { attributes: true, attributeFilter: ['class'], childList: true });
  syncDrawer();

  document.addEventListener('keydown', event => {
    if (opened && event.key === 'Tab') {
      const targets = focusable();
      const first = targets[0] || panel;
      const last = targets.at(-1) || panel;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault(); first.focus();
      }
    }
    if (event.key === 'Escape' && mobile.matches && !opened) closeMobileMenus();
  });

  function closeMobileMenus() {
    menu.querySelectorAll('.group').forEach(group => {
      group.querySelector('.group-items').hidden = true;
      group.querySelector('.group-name').setAttribute('aria-expanded', 'false');
    });
  }
  function syncMenuLayout() {
    menu.querySelectorAll('.group').forEach((group, index) => {
      const items = group.querySelector('.group-items');
      items.id = `function-group-${index}`;
      items.hidden = mobile.matches;
      const trigger = group.querySelector('.group-name');
      trigger.setAttribute('aria-controls', items.id);
      trigger.setAttribute('aria-expanded', String(!mobile.matches));
    });
  }
  syncMenuLayout();
  mobile.addEventListener('change', syncMenuLayout);
  menu.addEventListener('click', event => {
    if (!mobile.matches) return;
    const activeGroup = event.target.closest('.group-name');
    if (event.target.closest('[data-page]')) { closeMobileMenus(); return; }
    if (activeGroup) menu.querySelectorAll('.group-name').forEach(button => {
      if (button !== activeGroup) {
        button.nextElementSibling.hidden = true;
        button.setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.addEventListener('click', event => {
    if (mobile.matches && !event.target.closest('.sidebar')) closeMobileMenus();
  });

  function polishPage() {
    content.querySelectorAll('h1').forEach(title => title.tabIndex = -1);
    content.querySelectorAll('.marquee').forEach(reminder => reminder.tabIndex = 0);
    content.querySelectorAll('input[type="range"]').forEach(range => {
      const update = () => range.style.setProperty('--range-progress', `${(Number(range.value) - Number(range.min || 0)) / (Number(range.max || 100) - Number(range.min || 0)) * 100}%`);
      update(); range.addEventListener('input', update);
    });
    content.querySelectorAll('.notice[id]').forEach(notice => notice.setAttribute('aria-live', 'polite'));
  }
  polishPage();
  // Observe only complete page changes, not user typing or status updates.
  new MutationObserver(polishPage).observe(content, { childList: true });

  const confirmation = document.createElement('dialog');
  confirmation.className = 'confirm-dialog';
  confirmation.setAttribute('aria-labelledby', 'confirmTitle');
  confirmation.setAttribute('aria-describedby', 'confirmDescription');
  confirmation.innerHTML = '<form method="dialog"><header class="confirm-head"><h2 id="confirmTitle">撤回情报</h2><button class="close" value="cancel" aria-label="关闭对话框">×</button></header><div class="confirm-body"><p id="confirmDescription"></p><p class="subtle">本次操作仅更新当前原型页面中的示意状态。</p></div><footer class="confirm-actions"><button class="btn" value="cancel" autofocus>取消</button><button class="btn primary" value="confirm">确认撤回</button></footer></form>';
  document.body.append(confirmation);
  confirmation.addEventListener('click', event => { if (event.target === confirmation) confirmation.close('cancel'); });
  window.confirmAction = message => new Promise(resolve => {
    confirmation.querySelector('#confirmDescription').textContent = message;
    confirmation.returnValue = 'cancel';
    confirmation.addEventListener('close', () => resolve(confirmation.returnValue === 'confirm'), { once: true });
    confirmation.showModal();
  });
})();
