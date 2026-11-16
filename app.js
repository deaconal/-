(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const config = window.CHRISTMAS_LIST || {};
  const items = Array.isArray(config.items) ? config.items : [];
  const groups = new Map((Array.isArray(config.groups) ? config.groups : []).map(group => [group.id, group]));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const twoColumnLayout = window.matchMedia('(max-width: 850px)');
  const storageKey = 'jacob-christmas-favorites-v1';
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let money;
  try { money = new Intl.NumberFormat(config.locale || 'en-US', { style: 'currency', currency: config.currency || 'USD', maximumFractionDigits: 2, minimumFractionDigits: 0 }); }
  catch { money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 0 }); }
  const hasPrice = (item) => typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0;
  const priceOf = (item) => !hasPrice(item) ? Infinity : typeof item.salePrice === 'number' && item.salePrice >= 0 && item.salePrice < item.price ? item.salePrice : item.price;
  const priceMarkup = (item) => {
    const amount = !hasPrice(item) ? '<span class="price-unconfirmed">Check price at store</span>' : priceOf(item) < item.price
    ? `<span class="sale-price">${escape(money.format(priceOf(item)))}</span><del>${escape(money.format(item.price))}</del>`
    : `<span>${escape(money.format(item.price))}</span>`;
    return amount + (item.priceNote ? `<small class="price-note">${escape(item.priceNote)}</small>` : '');
  };
  const safeURL = (url) => {
    try { const parsed = new URL(url, document.baseURI); return /^(https?:)$/.test(parsed.protocol) ? parsed.href : '#'; }
    catch { return '#'; }
  };
  const colorOf = (item) => item.color && CSS.supports('color', item.color) ? item.color : '#eae8df';
  let saved;
  try { const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]'); saved = new Set(Array.isArray(parsed) ? parsed.filter(id => items.some(item => item.id === id)) : []); }
  catch { saved = new Set(); }
  let activeFilter = 'all';
  let entered = false;
  let toastTimer;
  let lastSurprise = null;
  let unwrapTimer;
  let unwrapping = false;

  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) return;
      target.classList.add('is-visible');
      target.classList.remove('reveal-pending');
      revealObserver.unobserve(target);
    });
  }, { rootMargin: '0px 0px 45px 0px', threshold: .06 }) : null;

  function revealContent() {
    if (!entered) return;
    document.querySelectorAll('.reveal:not(.is-visible)').forEach(element => {
      if (motion.matches || !revealObserver) element.classList.add('is-visible');
      else { element.classList.add('reveal-pending'); revealObserver.observe(element); }
    });
  }

  function imageMarkup(item) {
    // The fallback also handles a missing or broken replacement photo.
    let image = '';
    try {
      if (typeof item.image === 'string' && item.image.trim()) {
        const source = new URL(item.image.trim(), document.baseURI);
        if (!/\.svg$/i.test(source.pathname) && (/^https?:$/.test(source.protocol) || (location.protocol === 'file:' && source.protocol === 'file:'))) image = source.href;
      }
    } catch { /* Use the text fallback. */ }
    return `<span class="image-placeholder"${image ? ' hidden' : ''}><span class="placeholder-brand">${escape(item.brand || item.category || 'A CHRISTMAS WISH')}</span><span class="placeholder-name">${escape(item.name)}</span><span class="placeholder-note">View at ${escape(item.store || 'the store')} ↗</span></span>${image ? `<img src="${escape(image)}" alt="${escape(item.imageAlt || item.name)}" width="600" height="600" loading="lazy" decoding="async"${item.imagePosition ? ` style="object-position:${escape(item.imagePosition)}"` : ''}>` : ''}`;
  }

  function handleImageError(event) {
    if (!(event.target instanceof HTMLImageElement)) return;
    const placeholder = event.target.previousElementSibling;
    if (!placeholder?.classList.contains('image-placeholder')) return;
    event.target.hidden = true;
    placeholder.hidden = false;
  }
  $('#gift-grid').addEventListener('error', handleImageError, true);
  $('#surprise-content').addEventListener('error', handleImageError, true);

  function cardMarkup(item, index) {
    const isSaved = saved.has(item.id);
    const discount = hasPrice(item) && priceOf(item) < item.price ? Math.round((1 - priceOf(item) / item.price) * 100)
      : hasPrice(item) && Number.isFinite(item.discountPercent) && item.discountPercent > 0 && item.discountPercent < 100 ? Math.round(item.discountPercent) : 0;
    return `<article class="gift-card reveal" data-gift="${escape(item.id)}" style="--card-color:${escape(colorOf(item))};--reveal-delay:${(index % 3) * 65}ms">
      <div class="gift-media">
        <a class="gift-image" href="${escape(safeURL(item.url))}" target="_blank" rel="noopener noreferrer" aria-label="Shop ${escape(item.name)}${item.store ? ` at ${escape(item.store)}` : ''} (opens in a new tab)">
          ${imageMarkup(item)}
          <span class="gift-badges">${item.favorite ? '<span class="badge badge-top">A top wish ✧</span>' : ''}${discount ? `<span class="badge badge-sale">${discount}% off</span>` : ''}</span>
        </a>
        <button class="save-button" data-save="${escape(item.id)}" aria-pressed="${isSaved}" aria-label="${isSaved ? 'Unsave' : 'Save'} ${escape(item.name)}">${icon('heart')}</button>
      </div>
      <div class="gift-details">
        <h3 class="gift-title"><a class="gift-name" href="${escape(safeURL(item.url))}" target="_blank" rel="noopener noreferrer">${escape(item.name)}${icon('external')}</a></h3>
        ${item.info ? `<p class="gift-info">${escape(item.info)}</p>` : ''}
        <div class="gift-bottom"><div class="price">${priceMarkup(item)}</div><a class="gift-shop" href="${escape(safeURL(item.url))}" target="_blank" rel="noopener noreferrer" aria-label="Shop ${escape(item.name)} at ${escape(item.store || 'the store')} (opens in a new tab)">${escape(item.store || 'Shop')}${icon('arrow-right')}</a></div>
      </div>
    </article>`;
  }

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    // A dialog's top layer also keeps status messages visible to touch users.
    const openSheet = document.querySelector('.sheet[open]');
    (openSheet || document.body).append(element);
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('visible'), 3200);
  }
  const haptic = () => { if (!motion.matches && navigator.vibrate) navigator.vibrate(12); };

  function orderedItems() {
    if (!twoColumnLayout.matches) return items;
    const ordered = [...items];
    items.forEach(item => {
      if (!groups.has(item.mobileBeforeGroup)) return;
      const currentIndex = ordered.indexOf(item);
      ordered.splice(currentIndex, 1);
      const groupIndex = ordered.findIndex(member => member.group === item.mobileBeforeGroup);
      ordered.splice(groupIndex < 0 ? currentIndex : groupIndex, 0, item);
    });
    return ordered;
  }

  function render() {
    const visible = orderedItems().filter(item => activeFilter === 'top' ? item.favorite : activeFilter === 'saved' ? saved.has(item.id) : true);
    revealObserver?.disconnect();
    const renderedGroups = new Set();
    $('#gift-grid').innerHTML = visible.map((item, index) => {
      const group = groups.get(item.group);
      if (!group) return cardMarkup(item, index);
      if (renderedGroups.has(item.group)) return '';
      renderedGroups.add(item.group);
      const members = visible.filter(member => member.group === item.group);
      const noteId = `group-note-${group.id}`;
      return `<div class="gift-group${members.length > 2 ? ' wide-group' : ''} reveal" data-group="${escape(group.id)}" role="group" aria-label="${escape(group.name || 'Related gifts')}"${group.note ? ` aria-describedby="${escape(noteId)}"` : ''} style="--group-columns:${Math.min(members.length, 3)}">${group.note ? `<p class="group-note" id="${escape(noteId)}">${escape(group.note)}</p>` : ''}<div class="group-grid">${members.map((member, position) => cardMarkup(member, position)).join('')}</div></div>`;
    }).join('');
    $('#result-count').textContent = `${visible.length} ${visible.length === 1 ? 'wish' : 'wishes'}`;
    $('#saved-count').textContent = saved.size ? saved.size : '';
    $('#empty-state').hidden = visible.length !== 0;
    const isSavedView = activeFilter === 'saved';
    $('#empty-title').textContent = isSavedView ? 'A little room for a favorite.' : 'More wishes on the way.';
    $('#empty-message').textContent = isSavedView ? 'Tap the heart on a gift to keep it here. Saved on this device, just for you.' : 'Try the full list for a few more gift ideas.';
    document.querySelectorAll('[data-filter]').forEach(button => {
      const active = button.dataset.filter === activeFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active);
    });
    $('#surprise-open').disabled = items.length === 0;
    revealContent();
  }
  twoColumnLayout.addEventListener('change', render);

  function changeFilter(filter) {
    if (activeFilter === filter) return;
    activeFilter = filter;
    haptic();
    if (!motion.matches && document.startViewTransition) document.startViewTransition(render).finished.catch(() => {});
    else render();
  }
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    changeFilter(button.dataset.filter);
  }));
  $('#reset-filter').addEventListener('click', () => changeFilter('all'));
  $('#gift-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-save]');
    if (!button) return;
    const id = button.dataset.save;
    const item = items.find(item => item.id === id);
    if (!item) return;
    saved.has(id) ? saved.delete(id) : saved.add(id);
    let persisted = true;
    try { localStorage.setItem(storageKey, JSON.stringify([...saved])); } catch { persisted = false; }
    haptic();
    if (activeFilter === 'saved') {
      const oldIndex = [...$('#gift-grid').querySelectorAll('[data-save]')].indexOf(button);
      render();
      const remaining = $('#gift-grid').querySelectorAll('[data-save]');
      (remaining[Math.min(oldIndex, remaining.length - 1)] || $('[data-filter="saved"]')).focus({ preventScroll: true });
    } else {
      button.setAttribute('aria-pressed', saved.has(id));
      button.setAttribute('aria-label', `${saved.has(id) ? 'Unsave' : 'Save'} ${item.name}`);
      $('#saved-count').textContent = saved.size || '';
      if (saved.has(id) && !motion.matches && button.animate) button.querySelector('.icon').animate([
        { transform: 'scale(1)' }, { transform: 'scale(1.4)', offset: .45 }, { transform: 'scale(1.05)' }
      ], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
    toast(saved.has(id) ? (persisted ? 'Saved on this device. A little idea for later.' : 'Saved for this visit. Device storage is unavailable.') : 'Removed from your saved wishes.');
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    try { const value = JSON.parse(event.newValue || '[]'); saved = new Set(Array.isArray(value) ? value : []); render(); } catch { /* Keep the current selection. */ }
  });

  function updateCountdown() {
    const now = new Date();
    const isChristmas = now.getMonth() === 11 && now.getDate() === 25;
    const year = now.getFullYear() + (now.getMonth() === 11 && now.getDate() > 25 ? 1 : 0);
    const days = Math.ceil((Date.UTC(year, 11, 25) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    $('#countdown').innerHTML = isChristmas ? 'Merry Christmas, with love.' : `<strong>${days} ${days === 1 ? 'sleep' : 'sleeps'}</strong> until Christmas`;
    document.querySelectorAll('.christmas-year').forEach(element => element.textContent = year);
    $('.footer-year').textContent = now.getFullYear();
  }

  // Start the supplied recording within the entry tap so phone browsers
  // allow playback. Pausing keeps the current position for quiet mode.
  const music = $('#christmas-music');
  music.volume = .35;
  let musicRequest = 0;
  async function startMusic() {
    if (document.hidden || $('#quiet-mode').checked) return;
    const request = ++musicRequest;
    try {
      await music.play();
    } catch {
      // A newer pause or play request supersedes this one.
      if (request !== musicRequest) return;
      $('#quiet-mode').checked = true;
      toast('Sound couldn’t start. Quiet mode is on.');
    }
  }
  function stopMusic() {
    musicRequest++;
    music.pause();
  }
  $('#quiet-mode').addEventListener('change', event => event.target.checked ? stopMusic() : startMusic());

  // Snow begins at entry, and rests when the tab is hidden. Touch screens use
  // fewer flakes, and reduced-motion preferences always take priority.
  const canvas = $('#snow');
  const context = canvas.getContext('2d');
  let snowFrame = null, flakes = [], width = 0, height = 0, lastFrame = 0;
  function resizeSnow() {
    width = innerWidth; height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * ratio; canvas.height = height * ratio;
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    flakes = Array.from({length: width < 700 ? 25 : 48}, () => ({ x: Math.random()*width, y: Math.random()*height, r: .9+Math.random()*1.7, speed: 13+Math.random()*21, phase: Math.random()*Math.PI*2, alpha: .2+Math.random()*.45 }));
  }
  function drawSnow(time) {
    if (!context) return;
    const delta = Math.min((time - lastFrame)/1000 || .016, .05); lastFrame = time;
    context.clearRect(0, 0, width, height);
    for (const flake of flakes) {
      flake.y += flake.speed*delta;
      flake.x += Math.sin(time/1800 + flake.phase)*6*delta;
      if (flake.y > height + 5) { flake.y = -5; flake.x = Math.random()*width; }
      context.fillStyle = `rgba(255,255,255,${flake.alpha})`;
      context.beginPath(); context.arc(flake.x, flake.y, flake.r, 0, Math.PI*2); context.fill();
    }
    snowFrame = requestAnimationFrame(drawSnow);
  }
  function syncSnow() {
    cancelAnimationFrame(snowFrame); snowFrame = null;
    if (entered && !motion.matches && !document.hidden && context) { lastFrame = 0; snowFrame = requestAnimationFrame(drawSnow); }
    else if (context) context.clearRect(0, 0, width, height);
  }
  window.addEventListener('resize', resizeSnow, { passive: true });
  motion.addEventListener('change', () => {
    syncSnow();
    if (motion.matches) {
      document.getAnimations().forEach(animation => animation.cancel());
      document.querySelectorAll('.reveal-pending').forEach(element => { element.classList.remove('reveal-pending'); element.classList.add('is-visible'); });
      revealObserver?.disconnect();
    }
  });
  document.addEventListener('visibilitychange', () => {
    syncSnow();
    if (document.hidden) stopMusic();
    else if (entered && !$('#quiet-mode').checked) startMusic();
  });

  function enter() {
    if (entered) return;
    entered = true; haptic();
    startMusic(); syncSnow();
    document.body.classList.remove('awaiting-entry');
    document.body.classList.add('has-entered');
    const entry = $('#entry-dialog');
    entry.classList.add('leaving');
    setTimeout(() => {
      entry.close();
      $('#hero-title').setAttribute('tabindex', '-1');
      $('#hero-title').focus({preventScroll: true});
      revealContent();
    }, motion.matches ? 0 : 580);
  }
  $('#enter').addEventListener('click', enter);
  $('#entry-dialog').addEventListener('cancel', event => { event.preventDefault(); enter(); });
  $('#back-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: motion.matches ? 'instant' : 'smooth' }));

  function prepareSurprise() {
    clearTimeout(unwrapTimer);
    unwrapping = false;
    $('#surprise-description').textContent = 'Tap the present. See what’s inside.';
    $('#surprise-content').innerHTML = `<button class="unwrap-button" id="unwrap" aria-label="Unwrap a surprise gift"><img src="assets/christmas-parcel.svg" alt="A wrapped Christmas present" width="620" height="560"><span class="unwrap-label">Tap to unwrap ${icon('arrow-right')}</span></button>`;
    $('#unwrap').addEventListener('click', () => {
      if (unwrapping) return;
      unwrapping = true;
      $('#unwrap').setAttribute('aria-disabled', 'true');
      $('#unwrap').classList.add('unwrapping');
      unwrapTimer = setTimeout(unwrap, motion.matches ? 0 : 650);
    });
  }
  function unwrap() {
    if (!items.length) return;
    // Earlier wishes get more chances; every gift stays eligible, except
    // the previous pick when there is another gift to choose from.
    const pool = orderedItems().map((item, index) => ({ item, weight: items.length - index }))
      .filter(({ item }) => items.length === 1 || item.id !== lastSurprise);
    let ticket = Math.random() * pool.reduce((total, entry) => total + entry.weight, 0);
    const { item } = pool.find(entry => (ticket -= entry.weight) < 0) || pool[pool.length - 1];
    const groupNote = groups.get(item.group)?.note;
    lastSurprise = item.id; haptic();
    $('#surprise-description').textContent = item.favorite ? 'One of my top wishes. Good pick.' : 'A little something from my wish list.';
    $('#surprise-content').innerHTML = `<div class="surprise-result" style="--card-color:${escape(colorOf(item))}"><div class="surprise-image">${imageMarkup(item)}</div><h3>${escape(item.name)}</h3><div class="price">${priceMarkup(item)}</div>${item.info ? `<p class="gift-info">${escape(item.info)}</p>` : ''}${groupNote ? `<p class="group-note">${escape(groupNote)}</p>` : ''}<a href="${escape(safeURL(item.url))}" target="_blank" rel="noopener noreferrer" class="button green" id="surprise-buy">${escape(item.store ? `Take a look at ${item.store}` : 'Take a look')}${icon('external')}</a><button class="text-button" id="again">Pick another little surprise</button></div>`;
    $('#surprise-buy').focus({ preventScroll: true });
    $('#again').addEventListener('click', () => { prepareSurprise(); $('#unwrap').focus({ preventScroll: true }); });
    if (!motion.matches) {
      const confetti = document.createElement('div'); confetti.className = 'confetti'; confetti.setAttribute('aria-hidden','true');
      confetti.innerHTML = Array.from({length:22}, () => `<i style="--x:${Math.random()*430-215}px;--y:${Math.random()*400-230}px;--r:${Math.random()*540}deg"></i>`).join('');
      $('#surprise-dialog').append(confetti); setTimeout(() => confetti.remove(), 1200);
    }
  }
  $('#surprise-open').addEventListener('click', () => { prepareSurprise(); $('#surprise-dialog').showModal(); });
  document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('.sheet').forEach(dialog => {
    // Start and end outside the sheet so a drag out of it doesn't dismiss it.
    let outsideStart = false;
    const outside = event => { const r = dialog.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; };
    dialog.addEventListener('pointerdown', event => outsideStart = outside(event));
    dialog.addEventListener('click', event => { if (outsideStart && outside(event)) dialog.close(); outsideStart = false; });
    dialog.addEventListener('close', () => { document.body.append($('#toast')); if (dialog.id === 'surprise-dialog') { clearTimeout(unwrapTimer); unwrapping = false; } });
  });

  async function copyURL() {
    try { await navigator.clipboard.writeText($('#share-url').value); $('#share-dialog').close(); toast('List link copied. Christmas joy, ready to send.'); }
    catch { $('#share-url').focus(); $('#share-url').select(); toast('Touch and hold the selected link to copy it.'); }
  }
  $('#share').addEventListener('click', async () => {
    if (location.protocol === 'file:') { toast('Sharing is available when the list has a web address.'); return; }
    const url = new URL(location.href); url.hash = '';
    const data = { title: document.title, text: 'A few things on my Christmas wish list.', url: url.href };
    if (navigator.share) {
      try { await navigator.share(data); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    $('#share-url').value = url.href;
    $('#share-dialog').showModal();
  });
  $('#copy-share').addEventListener('click', copyURL);

  if (config.samples === false) document.querySelectorAll('.sample-note').forEach(note => note.hidden = true);
  render(); updateCountdown(); setInterval(updateCountdown, 60000); resizeSnow();
  $('#entry-dialog').showModal();
})();
