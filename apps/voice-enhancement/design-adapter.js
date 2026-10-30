/* Presentation and interaction lifecycle for the existing voice prototype.
 * State remains in this preview session; no microphone, API or persistence is added.
 */
(() => {
  const app = document.querySelector('.shell');
  const content = document.getElementById('page');
  const menu = document.getElementById('navigation');
  const review = document.getElementById('reviewDrawer');
  const mask = document.getElementById('modalMask');
  const dialog = document.getElementById('modal');
  const reviewToggle = document.getElementById('reviewToggle');
  const mobile = matchMedia('(max-width: 767px)');
  const overlayLayout = matchMedia('(max-width: 1120px)');
  const collapsed = new Map();
  let lastTrigger = null;
  let modalWasOpen = false;
  let overlayWasOpen = false;
  let modalReturn = null;
  let reviewReturn = null;

  document.querySelector('.integration-context').append(reviewToggle);
  const reviewMask = document.createElement('div');
  reviewMask.className = 'review-mask';
  reviewMask.setAttribute('aria-hidden', 'true');
  app.after(reviewMask);
  reviewMask.addEventListener('click', () => setReviewOpen(false));
  dialog.tabIndex = -1;
  review.tabIndex = -1;

  document.addEventListener('click', event => {
    if (!dialog.contains(event.target)) lastTrigger = event.target.closest('button, input, select, textarea, a, [tabindex]');
  }, true);

  const targets = container => [...container.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex="0"]')]
    .filter(el => !el.disabled && !el.hidden && !el.closest('[inert]') && el.getClientRects().length);
  const restoreFocus = target => {
    const replacement = target?.id ? document.getElementById(target.id) : null;
    (target?.isConnected ? target : replacement || menu.querySelector('[aria-current="page"]') || reviewToggle)?.focus({ preventScroll: true });
  };

  function syncLayers() {
    const modalOpen = mask.classList.contains('open');
    const reviewOpen = app.classList.contains('review-open');
    const overlayOpen = reviewOpen && overlayLayout.matches;
    app.inert = modalOpen;
    for (const child of app.children) if (child !== review) child.inert = overlayOpen;
    dialog.inert = !modalOpen;
    dialog.setAttribute('aria-hidden', String(!modalOpen));
    mask.setAttribute('aria-hidden', String(!modalOpen));
    if (modalOpen) dialog.setAttribute('aria-modal', 'true');
    else dialog.removeAttribute('aria-modal');
    review.inert = !reviewOpen;
    review.setAttribute('aria-hidden', String(!reviewOpen));
    review.setAttribute('role', overlayOpen ? 'dialog' : 'region');
    if (overlayOpen) review.setAttribute('aria-modal', 'true');
    else review.removeAttribute('aria-modal');
    reviewMask.classList.toggle('open', overlayOpen);

    if (overlayOpen && !overlayWasOpen) {
      reviewReturn = lastTrigger || reviewToggle;
      (review.querySelector('.review-close') || review).focus({ preventScroll: true });
    } else if (!overlayOpen && overlayWasOpen && !modalOpen) {
      restoreFocus(reviewReturn);
      reviewReturn = null;
    }
    if (modalOpen && !modalWasOpen) {
      modalReturn = lastTrigger || document.activeElement;
      const initial = dialog.querySelector('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')
        || dialog.querySelector('.modal-close') || dialog;
      initial.focus({ preventScroll: true });
    } else if (!modalOpen && modalWasOpen) {
      restoreFocus(modalReturn);
      modalReturn = null;
    }
    modalWasOpen = modalOpen;
    overlayWasOpen = overlayOpen;
  }
  new MutationObserver(syncLayers).observe(mask, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(syncLayers).observe(app, { attributes: true, attributeFilter: ['class'] });
  syncLayers();

  document.addEventListener('keydown', event => {
    // Native confirmation dialogs provide their own focus handling.
    if (document.querySelector('.confirm-dialog[open]')) return;
    const activeLayer = modalWasOpen ? dialog : overlayWasOpen ? review : null;
    if (event.key === 'Escape') {
      if (modalWasOpen) { event.preventDefault(); event.stopPropagation(); closeModal(); }
      else if (app.classList.contains('review-open')) { event.preventDefault(); setReviewOpen(false); }
      else if (mobile.matches) closeMobileMenus();
    }
    if (event.key === 'Tab' && activeLayer) {
      const list = targets(activeLayer);
      const first = list[0] || activeLayer;
      const last = list.at(-1) || activeLayer;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === activeLayer)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === activeLayer)) {
        event.preventDefault(); first.focus();
      }
    }
  }, true);

  function decorateNav() {
    menu.querySelectorAll('.group').forEach((group, index) => {
      const trigger = group.querySelector('.group-name');
      const items = group.querySelector('.group-items');
      items.id = `voice-function-group-${index}`;
      trigger.dataset.groupIndex = index;
      trigger.setAttribute('aria-controls', items.id);
      group.querySelector('.group-icon')?.setAttribute('aria-hidden', 'true');
      items.hidden = mobile.matches || !!collapsed.get(index);
      trigger.setAttribute('aria-expanded', String(!items.hidden));
    });
  }
  function closeMobileMenus() {
    menu.querySelectorAll('.group-name').forEach(trigger => {
      trigger.nextElementSibling.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    });
  }
  const baseRenderNav = renderNav;
  renderNav = function () { baseRenderNav(); decorateNav(); };
  decorateNav();
  menu.addEventListener('click', event => {
    const trigger = event.target.closest('.group-name');
    if (trigger) {
      if (mobile.matches) menu.querySelectorAll('.group-name').forEach(other => {
        if (other !== trigger) { other.nextElementSibling.hidden = true; other.setAttribute('aria-expanded', 'false'); }
      });
      else collapsed.set(Number(trigger.dataset.groupIndex), trigger.nextElementSibling.hidden);
    }
    const route = event.target.closest('[data-page]');
    if (route) {
      if (mobile.matches) { closeMobileMenus(); menu.querySelector(`[aria-controls="voice-function-group-${route.closest('.group').querySelector('.group-name').dataset.groupIndex}"]`)?.focus({ preventScroll: true }); }
      else menu.querySelector(`[data-page="${route.dataset.page}"]`)?.focus({ preventScroll: true });
    }
  });
  document.addEventListener('click', event => { if (mobile.matches && !event.target.closest('.sidebar')) closeMobileMenus(); });
  mobile.addEventListener('change', decorateNav);
  overlayLayout.addEventListener('change', syncLayers);

  function updateOverlayTop() {
    const bar = app.querySelector(mobile.matches ? '.sidebar' : '.app-strip');
    const top = `${Math.round(bar.getBoundingClientRect().bottom + (mobile.matches ? 0 : 16))}px`;
    app.style.setProperty('--review-overlay-top', top);
    reviewMask.style.setProperty('--review-overlay-top', top);
  }
  const sizing = new ResizeObserver(updateOverlayTop);
  sizing.observe(app.querySelector('.app-strip'));
  sizing.observe(app.querySelector('.sidebar'));
  window.addEventListener('resize', updateOverlayTop);
  updateOverlayTop();

  function highlightSelection() {
    content.querySelectorAll('.para').forEach((paragraph, index) => {
      const selected = index === selectedPara;
      paragraph.classList.toggle('selected', selected);
      const label = paragraph.querySelector('.review-label');
      if (label) label.textContent = selected ? '当前编辑段' : '已识别';
    });
  }
  function polishPage() {
    const heading = content.querySelector('h1');
    if (heading) heading.tabIndex = -1;
    content.querySelectorAll('input[type="range"]').forEach(range => {
      const update = () => range.style.setProperty('--range-progress', `${(Number(range.value) - Number(range.min || 0)) / (Number(range.max || 100) - Number(range.min || 0)) * 100}%`);
      update();
      if (!range.dataset.designRange) {
        range.dataset.designRange = 'true';
        range.addEventListener('input', update);
        range.addEventListener('change', update);
      }
    });
    content.querySelectorAll('.version-item').forEach(item => {
      item.setAttribute('role', 'button');
      item.setAttribute('aria-pressed', String(item.classList.contains('active')));
    });
    content.querySelectorAll('#recordStatus').forEach(status => { status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); });
    highlightSelection();
  }
  polishPage();
  new MutationObserver(polishPage).observe(content, { childList: true });
  content.addEventListener('click', event => {
    if (event.target.closest('.para')) highlightSelection();
    if (event.target.closest('[data-action="locateAudio"]')) polishPage();
  });
  content.addEventListener('keydown', event => {
    const version = event.target.closest('.version-item');
    if (version && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); version.click(); }
  });
  content.addEventListener('change', event => {
    if (event.target.id === 'templateSelect' && event.target.value) scheduleAutoSave();
  });
  review.addEventListener('click', event => {
    if (overlayLayout.matches && event.target.closest('[data-action="locatePrototype"]')) setReviewOpen(false);
  });

  const baseHandleAction = handleAction;
  handleAction = async function (button) {
    const before = transcriptionParts.map(part => part.text).join('\n');
    await baseHandleAction(button);
    const after = transcriptionParts.map(part => part.text).join('\n');
    if (before !== after && button.dataset.action !== 'restoreVersion') scheduleAutoSave();
    polishPage();
  };

  const confirmation = document.createElement('dialog');
  confirmation.className = 'modal confirm-dialog';
  confirmation.setAttribute('aria-labelledby', 'versionConfirmTitle');
  confirmation.setAttribute('aria-describedby', 'versionConfirmMessage');
  confirmation.innerHTML = '<form method="dialog"><header class="modal-head"><h2 id="versionConfirmTitle">恢复历史版本</h2><button class="modal-close" value="cancel" aria-label="关闭确认框">×</button></header><div class="modal-body"><p id="versionConfirmMessage"></p><p class="subtle">恢复前会在本次预览会话中保留当前稿件快照。</p></div><footer class="modal-foot"><button class="btn" value="cancel" autofocus>取消</button><button class="btn primary" value="confirm">确认恢复</button></footer></form>';
  document.body.append(confirmation);
  confirmation.addEventListener('click', event => { if (event.target === confirmation) confirmation.close('cancel'); });
  window.confirmAction = message => new Promise(resolve => {
    confirmation.querySelector('#versionConfirmMessage').textContent = message;
    confirmation.returnValue = 'cancel';
    confirmation.addEventListener('close', () => resolve(confirmation.returnValue === 'confirm'), { once: true });
    confirmation.showModal();
  });
})();
