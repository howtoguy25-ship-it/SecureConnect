import { CanvasElement, Project, SitePage } from './types';
import { getFontOption } from './fonts';

// Renders a Project's absolutely-positioned canvas into a real, self-contained static
// HTML page. The editor's data model is an absolute-position canvas (not semantic
// responsive HTML), so the page scales the whole canvas as one block to fit the
// visitor's viewport width via a CSS custom property + a tiny inline resize script --
// good enough for a genuinely real published page without redesigning the data model.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16);
  if (Number.isNaN(bigint)) return hex;
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

// Popup buttonUrl is authored by the site owner (not visitor input), but still guard
// against a stray "javascript:" scheme sneaking into a published page.
function safeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '#';
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  return `https://${trimmed}`;
}

function renderIcon(el: Extract<CanvasElement, { type: 'icon' }>): string {
  const style = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;color:${escapeAttr(
    el.color
  )};font-size:${Math.min(el.width, el.height)}px;display:flex;align-items:center;justify-content:center;`;
  if (el.iconSet === 'MaterialCommunityIcons') {
    return `<i class="mdi mdi-${escapeAttr(el.iconName)}" style="${style}"></i>`;
  }
  if (el.iconSet === 'FontAwesome5') {
    return `<i class="fas fa-${escapeAttr(el.iconName)}" style="${style}"></i>`;
  }
  return `<ion-icon name="${escapeAttr(el.iconName)}" style="${style}"></ion-icon>`;
}

function renderShape(el: Extract<CanvasElement, { type: 'shape' }>): string {
  const color = escapeAttr(el.color);
  const base = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;`;
  switch (el.shapeKind) {
    case 'circle':
      return `<div style="${base}background:${color};border-radius:9999px;"></div>`;
    case 'rounded-rectangle':
      return `<div style="${base}background:${color};border-radius:16px;"></div>`;
    case 'rectangle':
      return `<div style="${base}background:${color};"></div>`;
    case 'line':
      return `<div style="${base}background:${color};height:2px;"></div>`;
    case 'triangle':
      return `<svg style="${base}" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,0 100,100 0,100" fill="${color}" /></svg>`;
    case 'star':
      return `<svg style="${base}" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,2 61,37 98,37 68,59 79,95 50,74 21,95 32,59 2,37 39,37" fill="${color}" /></svg>`;
    default:
      return `<div style="${base}background:${color};"></div>`;
  }
}

function renderElement(el: CanvasElement, slug: string, productStockUrl: string): string {
  const base = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;`;
  switch (el.type) {
    case 'text': {
      const font = getFontOption(el.fontFamily);
      const fontFamilyCss = font.id !== 'system' ? `font-family:'${font.family}',sans-serif;` : '';
      return `<div style="${base}color:${escapeAttr(el.color)};font-size:${el.fontSize}px;font-weight:${
        el.fontWeight === 'bold' ? '700' : '400'
      };text-align:${el.align};white-space:pre-wrap;${fontFamilyCss}">${escapeHtml(el.text)}</div>`;
    }
    case 'image':
      return el.uri
        ? `<img src="${escapeAttr(el.uri)}" style="${base}object-fit:cover;" />`
        : '';
    case 'shape':
      return renderShape(el);
    case 'button': {
      const buttonStyle = `${base}background:${escapeAttr(el.backgroundColor)};color:${escapeAttr(
        el.textColor
      )};border-radius:${el.borderRadius}px;${
        el.borderWidth ? `border:${el.borderWidth}px solid ${escapeAttr(el.borderColor ?? '#000000')};` : ''
      }display:flex;align-items:center;justify-content:center;font-weight:700;text-decoration:none;box-sizing:border-box;`;
      // Only a real, non-empty link renders as a clickable <a> -- a button with nothing
      // set stays a plain div, exactly as before this field existed, instead of a dead
      // link that goes nowhere or reloads the page.
      return el.link?.trim()
        ? `<a href="${escapeAttr(safeUrl(el.link))}" style="${buttonStyle}">${escapeHtml(el.label)}</a>`
        : `<div style="${buttonStyle}">${escapeHtml(el.label)}</div>`;
    }
    case 'icon':
      return renderIcon(el);
    case 'slideshow': {
      const id = `slideshow-${el.id}`;
      const images = el.images
        .map(
          (uri, i) =>
            `<img src="${escapeAttr(uri)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:${
              i === 0 ? 1 : 0
            };transition:opacity 0.6s;" data-slide />`
        )
        .join('');
      const script = el.autoPlay && el.images.length > 1
        ? `<script>(function(){var c=document.getElementById(${JSON.stringify(id)});if(!c)return;var slides=c.querySelectorAll('[data-slide]');var i=0;setInterval(function(){slides[i].style.opacity=0;i=(i+1)%slides.length;slides[i].style.opacity=1;},${el.intervalMs});})();</script>`
        : '';
      return `<div id="${id}" style="${base}overflow:hidden;">${images}</div>${script}`;
    }
    case 'video': {
      if (!el.uri) return '';
      const videoId = `video-${el.id}`;
      const audioId = `video-audio-${el.id}`;
      const trimStartSec = el.trimStartMs / 1000;
      const trimEndSec = el.trimEndMs != null ? el.trimEndMs / 1000 : null;
      const audioTag = el.audioUri
        ? `<audio id="${audioId}" src="${escapeAttr(el.audioUri)}" style="display:none;" ${
            el.audioVolume === 0 ? 'muted' : ''
          }></audio>`
        : '';
      const script = `<script>(function(){
  var v=document.getElementById(${JSON.stringify(videoId)});
  var a=document.getElementById(${JSON.stringify(audioId)});
  if(!v)return;
  if(a){a.volume=${el.audioVolume};}
  v.addEventListener('loadedmetadata',function(){v.currentTime=${trimStartSec};});
  v.addEventListener('play',function(){if(a){a.currentTime=0;a.play();}});
  v.addEventListener('pause',function(){if(a){a.pause();}});
  v.addEventListener('timeupdate',function(){
    var end=${trimEndSec != null ? trimEndSec : 'v.duration'};
    if(end && v.currentTime>=end){
      if(${el.loop ? 'true' : 'false'}){v.currentTime=${trimStartSec};if(a){a.currentTime=0;}}
      else{v.pause();}
    }
  });
})();</script>`;
      return `<video id="${videoId}" src="${escapeAttr(el.uri)}" style="${base}object-fit:cover;background:#000;" ${
        el.muted ? 'muted' : ''
      } playsinline controls></video>${audioTag}${script}`;
    }
    case 'product': {
      const isService = el.saleType === 'service';
      const isDigital = el.saleType === 'digital';
      const hasMultiplePhotos = el.images.length > 1;
      const lightboxVar = `siteSparkLightbox_${el.id}`;
      const imgTag = el.images[0]
        ? `<img src="${escapeAttr(el.images[0])}" style="width:100%;height:55%;object-fit:cover;display:block;${
            hasMultiplePhotos ? 'cursor:pointer;' : ''
          }" ${hasMultiplePhotos ? `onclick="${lightboxVar}.open()"` : ''} />`
        : `<div style="width:100%;height:55%;background:#F1F5F9;"></div>`;
      const qtyId = `qty-${el.id}`;
      const stockId = `stock-${el.id}`;
      const addBtnId = `addbtn-${el.id}`;
      const badge = isService
        ? `📅 Service booking${el.serviceDurationMinutes ? ` · ${el.serviceDurationMinutes} min` : ''}`
        : isDigital
          ? '💾 Instant download'
          : el.fulfillment === 'delivery'
            ? '📦 Delivery'
            : el.fulfillment === 'both'
              ? '📦 Delivery or pickup'
              : '🏬 Pickup';

      // Photo count is capped to 7 in the editor (see MAX_PRODUCT_IMAGES in
      // ElementInspector.tsx) -- the main card above only ever shows images[0], this
      // lightbox is the "with slide options" view for the rest.
      const lightbox = hasMultiplePhotos
        ? `<div id="lightbox-${el.id}" style="display:none;position:fixed;inset:0;z-index:9999;background:#000000E6;align-items:center;justify-content:center;flex-direction:column;">
  <button aria-label="Close" onclick="${lightboxVar}.close()" style="position:absolute;top:16px;right:16px;z-index:2;background:none;border:none;color:#fff;font-size:28px;line-height:1;cursor:pointer;">&times;</button>
  <div style="position:relative;width:100%;max-width:520px;z-index:1;">
    <div id="lightbox-track-${el.id}" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;">
      ${el.images
        .map(
          (uri) =>
            `<img src="${escapeAttr(uri)}" style="flex:0 0 100%;width:100%;max-height:70vh;object-fit:contain;scroll-snap-align:center;" />`
        )
        .join('')}
    </div>
    <button aria-label="Previous photo" onclick="${lightboxVar}.prev()" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);background:#00000099;color:#fff;border:none;border-radius:999px;width:36px;height:36px;font-size:18px;cursor:pointer;">&#8249;</button>
    <button aria-label="Next photo" onclick="${lightboxVar}.next()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:#00000099;color:#fff;border:none;border-radius:999px;width:36px;height:36px;font-size:18px;cursor:pointer;">&#8250;</button>
  </div>
  <div style="display:flex;gap:6px;margin-top:14px;">
    ${el.images.map((_, i) => `<div data-dot style="width:7px;height:7px;border-radius:4px;background:${i === 0 ? '#fff' : '#6B7280'};"></div>`).join('')}
  </div>
</div>
<script>(function(){
  var el=document.getElementById('lightbox-${el.id}');
  var track=document.getElementById('lightbox-track-${el.id}');
  var dots=el.querySelectorAll('[data-dot]');
  var count=${el.images.length};
  var i=0;
  function paint(){ dots.forEach(function(d,idx){ d.style.background = idx===i ? '#fff' : '#6B7280'; }); }
  function go(idx){ i=(idx+count)%count; track.scrollTo({ left: track.clientWidth*i, behavior:'smooth' }); paint(); }
  window[${JSON.stringify(lightboxVar)}] = {
    open: function(){ el.style.display='flex'; i=0; track.scrollTo({left:0}); paint(); },
    close: function(){ el.style.display='none'; },
    prev: function(){ go(i-1); },
    next: function(){ go(i+1); },
  };
})();</script>`
        : '';

      const script = `<script>(function(){
  var stockUrl = ${JSON.stringify(productStockUrl)} + '?slug=' + encodeURIComponent(${JSON.stringify(slug)}) + '&productId=' + encodeURIComponent(${JSON.stringify(el.productId)});
  var stockEl = document.getElementById(${JSON.stringify(stockId)});
  var qtyEl = document.getElementById(${JSON.stringify(qtyId)});
  var btnEl = document.getElementById(${JSON.stringify(addBtnId)});
  fetch(stockUrl).then(function(r){ return r.ok ? r.json() : null; }).then(function(data){
    if (!data || !stockEl) return;
    if (!data.inStock) {
      stockEl.textContent = 'Out of stock';
      stockEl.style.color = '#DC2626';
      stockEl.style.fontWeight = '700';
      if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.5'; btnEl.style.cursor = 'not-allowed'; btnEl.textContent = 'Out of Stock'; }
    } else if (data.trackInventory) {
      stockEl.textContent = data.stockQuantity + ' ${isService ? 'bookings left' : 'available'}';
      if (qtyEl) qtyEl.max = String(Math.max(1, data.stockQuantity));
      if (data.stockQuantity <= 0 && btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.5'; btnEl.style.cursor = 'not-allowed'; btnEl.textContent = '${isService ? 'Fully Booked' : 'Sold Out'}'; }
    } else {
      stockEl.textContent = '${isService ? 'Available to book' : 'In stock'}';
      stockEl.style.color = '#16A34A';
    }
  }).catch(function(){});
})();</script>`;

      return `<div style="${base}background:#FFFFFF;border-radius:12px;box-shadow:0 1px 8px rgba(0,0,0,0.1);overflow:hidden;display:flex;flex-direction:column;font-family:-apple-system,sans-serif;">
  ${imgTag}
  <div style="padding:10px;flex:1;display:flex;flex-direction:column;">
    <div style="font-size:10px;font-weight:700;color:#4338CA;text-transform:uppercase;letter-spacing:0.02em;">${badge}</div>
    <div style="font-weight:700;font-size:14px;color:#0F172A;margin-top:2px;">${escapeHtml(el.name)}</div>
    <div style="font-size:12px;color:#64748B;margin-top:2px;flex:1;">${escapeHtml(el.description)}</div>
    <div id="${stockId}" style="font-size:11px;color:#94A3B8;margin-top:2px;">Checking availability…</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:6px;">
      <div style="font-weight:800;color:#4338CA;font-size:14px;">$${el.priceUsd.toFixed(2)}</div>
      <input id="${qtyId}" type="number" min="1" value="1" style="width:44px;padding:4px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;" />
    </div>
    <button
      id="${addBtnId}"
      onclick="siteSparkCart.add(${JSON.stringify(el.productId)},${JSON.stringify(el.name)},${el.priceUsd},document.getElementById(${JSON.stringify(qtyId)}).value,${JSON.stringify(el.saleType)})"
      style="margin-top:8px;background:#4338CA;color:#fff;border:none;border-radius:8px;padding:8px;font-weight:700;font-size:13px;cursor:pointer;"
    >${isService ? 'Book Now' : 'Add to Cart'}</button>
    ${isService ? '<div style="font-size:10px;color:#94A3B8;margin-top:6px;">One-time payment for a real reservation — not a recurring charge.</div>' : ''}
    ${isDigital ? '<div style="font-size:10px;color:#94A3B8;margin-top:6px;">Delivered by the seller after purchase — no shipping.</div>' : ''}
  </div>
</div>
${lightbox}
${script}`;
    }
    default:
      return '';
  }
}

// A real floating cart (localStorage-backed) + slide-out panel + checkout button, injected
// once per page (not per product) when a project has any product elements. Multi-item cart
// as requested -- add several different products, one Stripe Checkout for all of them.
// Stock/price are re-validated server-side in createStoreCheckout regardless of what's
// baked into this page, so a stale published page can never let someone buy at an old
// price or oversell what's actually left.
function renderCartWidget(slug: string, checkoutUrl: string): string {
  return `<div id="sitespark-cart-fab" style="position:fixed;bottom:20px;right:20px;z-index:9998;width:56px;height:56px;border-radius:28px;background:#4338CA;color:#fff;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.25);" onclick="siteSparkCart.togglePanel()">
  🛒<span id="sitespark-cart-count" style="position:absolute;top:-4px;right:-4px;background:#DC2626;color:#fff;border-radius:999px;min-width:20px;height:20px;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0 4px;">0</span>
</div>
<div id="sitespark-cart-panel" style="display:none;position:fixed;bottom:88px;right:20px;z-index:9998;width:280px;max-height:70vh;overflow-y:auto;background:#fff;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.25);font-family:-apple-system,sans-serif;padding:14px;">
  <div style="font-weight:700;margin-bottom:8px;color:#0F172A;">Your cart</div>
  <div id="sitespark-cart-items"></div>
  <div id="sitespark-booking-fields" style="display:none;margin-top:10px;border-top:1px solid #F1F5F9;padding-top:10px;">
    <div style="font-size:11px;font-weight:700;color:#4338CA;text-transform:uppercase;margin-bottom:6px;">Booking details</div>
    <label style="font-size:11px;color:#64748B;">Preferred date</label>
    <input id="sitespark-booking-date" type="date" style="width:100%;padding:6px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;margin:2px 0 8px;" />
    <label style="font-size:11px;color:#64748B;">Preferred time</label>
    <input id="sitespark-booking-time" type="time" style="width:100%;padding:6px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;margin:2px 0 8px;" />
    <label style="font-size:11px;color:#64748B;">Notes (optional)</label>
    <textarea id="sitespark-booking-notes" rows="2" placeholder="Anything the business should know" style="width:100%;padding:6px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;margin-top:2px;resize:vertical;"></textarea>
  </div>
  <div style="display:flex;justify-content:space-between;font-weight:700;margin-top:10px;color:#0F172A;">
    <span>Total</span><span id="sitespark-cart-total">$0.00</span>
  </div>
  <button onclick="siteSparkCart.checkout()" style="margin-top:10px;width:100%;background:#4338CA;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">Checkout</button>
</div>
<div id="sitespark-order-banner" style="display:none;position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;padding:12px 20px;border-radius:10px;font-family:-apple-system,sans-serif;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.2);"></div>
<script>(function(){
  var SLUG=${JSON.stringify(slug)};
  var CHECKOUT_URL=${JSON.stringify(checkoutUrl)};
  var STORAGE_KEY='sitespark_cart_'+SLUG;
  function load(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]; } catch(e){ return []; } }
  function save(items){ localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); render(); }
  function hasService(items){ return items.some(function(i){ return i.saleType === 'service'; }); }
  function render(){
    var items = load();
    var count = items.reduce(function(s,i){return s+i.quantity;},0);
    var total = items.reduce(function(s,i){return s+i.priceUsd*i.quantity;},0);
    document.getElementById('sitespark-cart-count').textContent = String(count);
    document.getElementById('sitespark-cart-total').textContent = '$'+total.toFixed(2);
    document.getElementById('sitespark-booking-fields').style.display = hasService(items) ? 'block' : 'none';
    var list = document.getElementById('sitespark-cart-items');
    if (items.length === 0) { list.innerHTML = '<div style="color:#94A3B8;font-size:13px;">Cart is empty</div>'; return; }
    list.innerHTML = items.map(function(i){
      var badge = i.saleType === 'service' ? '📅 ' : i.saleType === 'digital' ? '💾 ' : '';
      return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:6px;">'
        + '<span>'+badge+i.quantity+'&times; '+i.name+'</span>'
        + '<span style="display:flex;align-items:center;gap:6px;"><span>$'+(i.priceUsd*i.quantity).toFixed(2)+'</span>'
        + '<a href="#" onclick="siteSparkCart.remove('+JSON.stringify(i.productId)+');return false;" style="color:#DC2626;">&times;</a></span>'
        + '</div>';
    }).join('');
  }
  function add(productId, name, priceUsd, qtyRaw, saleType){
    var qty = Math.max(1, parseInt(qtyRaw, 10) || 1);
    var items = load();
    var existing = items.filter(function(i){ return i.productId === productId; })[0];
    if (existing) { existing.quantity += qty; } else { items.push({ productId: productId, name: name, priceUsd: priceUsd, quantity: qty, saleType: saleType }); }
    save(items);
    document.getElementById('sitespark-cart-panel').style.display = 'block';
  }
  function remove(productId){ save(load().filter(function(i){ return i.productId !== productId; })); }
  function togglePanel(){
    var panel = document.getElementById('sitespark-cart-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
  function checkout(){
    var items = load();
    if (items.length === 0) return;
    var needsBooking = hasService(items);
    var booking = undefined;
    if (needsBooking) {
      var date = document.getElementById('sitespark-booking-date').value;
      var time = document.getElementById('sitespark-booking-time').value;
      var notes = document.getElementById('sitespark-booking-notes').value;
      if (!date || !time) { alert('Please pick a preferred date and time for your booking.'); return; }
      booking = { preferredDate: date, preferredTime: time, notes: notes };
    }
    fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: SLUG,
        items: items.map(function(i){ return { productId: i.productId, quantity: i.quantity }; }),
        booking: booking,
      }),
    })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.checkoutUrl) { window.location.href = data.checkoutUrl; }
        else { alert(data.error || 'Could not start checkout.'); }
      })
      .catch(function(){ alert('Could not start checkout.'); });
  }
  window.siteSparkCart = { add: add, remove: remove, togglePanel: togglePanel, checkout: checkout };
  render();

  var params = new URLSearchParams(window.location.search);
  var order = params.get('order');
  if (order === 'success' || order === 'cancelled') {
    var wasBooking = hasService(load());
    localStorage.removeItem(STORAGE_KEY);
    var banner = document.getElementById('sitespark-order-banner');
    banner.textContent = order === 'success'
      ? (wasBooking ? 'Thanks — your booking is confirmed!' : 'Thanks — your order is confirmed!')
      : 'Checkout was cancelled.';
    banner.style.background = order === 'success' ? '#16A34A' : '#64748B';
    banner.style.color = '#fff';
    banner.style.display = 'block';
    render();
  }
})();</script>`;
}

// Apple App Store Review Guideline 1.2 (User-Generated Content) requires a way for
// anyone to report objectionable content on a page like this one -- a real published
// site, publicly reachable to anyone with the link, not just signed-in app users. This
// has to work with no Firebase SDK loaded (published pages are plain static HTML), so it
// posts straight to reportPublishedSite's HTTP endpoint the same way the cart widget
// posts to createStoreCheckout.
function renderReportWidget(slug: string, reportUrl: string, pageUrl: string): string {
  return `<a href="#" id="sitespark-report-link" onclick="siteSparkReport.open();return false;" style="position:fixed;bottom:10px;left:10px;z-index:9999;font-family:-apple-system,sans-serif;font-size:11px;color:#94A3B8;background:#FFFFFFCC;padding:4px 8px;border-radius:8px;text-decoration:none;">Report this site</a>
<div id="sitespark-report-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:#00000088;align-items:center;justify-content:center;">
  <div style="background:#fff;border-radius:14px;padding:20px;width:90%;max-width:340px;font-family:-apple-system,sans-serif;">
    <div style="font-weight:700;color:#0F172A;margin-bottom:10px;">Report this site</div>
    <label style="font-size:12px;color:#64748B;">Reason</label>
    <select id="sitespark-report-reason" style="width:100%;padding:8px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;margin:4px 0 10px;">
      <option value="Spam or scam">Spam or scam</option>
      <option value="Offensive or abusive content">Offensive or abusive content</option>
      <option value="Copyright or trademark infringement">Copyright or trademark infringement</option>
      <option value="Impersonation">Impersonation</option>
      <option value="Other">Other</option>
    </select>
    <label style="font-size:12px;color:#64748B;">Details (optional)</label>
    <textarea id="sitespark-report-message" rows="3" style="width:100%;padding:8px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;margin-top:4px;resize:vertical;"></textarea>
    <div id="sitespark-report-status" style="font-size:12px;color:#DC2626;margin-top:8px;"></div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button onclick="siteSparkReport.close();" style="flex:1;background:#F1F5F9;color:#0F172A;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">Cancel</button>
      <button onclick="siteSparkReport.submit();" style="flex:1;background:#DC2626;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">Submit</button>
    </div>
  </div>
</div>
<script>(function(){
  var SLUG=${JSON.stringify(slug)};
  var REPORT_URL=${JSON.stringify(reportUrl)};
  var PAGE_URL=${JSON.stringify(pageUrl)};
  function open(){ document.getElementById('sitespark-report-modal').style.display='flex'; }
  function close(){ document.getElementById('sitespark-report-modal').style.display='none'; document.getElementById('sitespark-report-status').textContent=''; }
  function submit(){
    var reason = document.getElementById('sitespark-report-reason').value;
    var message = document.getElementById('sitespark-report-message').value;
    var status = document.getElementById('sitespark-report-status');
    status.style.color = '#64748B';
    status.textContent = 'Sending...';
    fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: SLUG, reason: reason, message: message, pageUrl: PAGE_URL }),
    })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.ok) {
          status.style.color = '#16A34A';
          status.textContent = 'Thanks — this has been reported.';
          setTimeout(close, 1500);
        } else {
          status.style.color = '#DC2626';
          status.textContent = data.error || 'Could not send report.';
        }
      })
      .catch(function(){ status.style.color = '#DC2626'; status.textContent = 'Could not send report.'; });
  }
  window.siteSparkReport = { open: open, close: close, submit: submit };
})();</script>`;
}

function renderAnnouncementBars(project: Project): string {
  const { announcements } = project;
  if (!announcements.enabled || announcements.bars.length === 0) return '';

  const wrapStyle = 'position:sticky;top:0;z-index:500;width:100%;text-align:center;font-size:13px;font-weight:600;';

  if (announcements.bars.length === 1 || !announcements.autoSlide) {
    const bar = announcements.bars[0];
    return `<div style="${wrapStyle}padding:10px 16px;background:${escapeAttr(
      bar.backgroundColor
    )};color:${escapeAttr(bar.textColor)};">${escapeHtml(bar.text)}</div>`;
  }

  const bars = announcements.bars
    .map(
      (bar, i) =>
        `<div data-bar style="display:${i === 0 ? 'block' : 'none'};padding:10px 16px;opacity:${
          i === 0 ? '1' : '0'
        };transition:opacity 0.35s ease;background:${escapeAttr(bar.backgroundColor)};color:${escapeAttr(
          bar.textColor
        )};">${escapeHtml(bar.text)}</div>`
    )
    .join('');
  return `<div id="announcement-bars" style="${wrapStyle}">${bars}</div>
<script>(function(){
  var c=document.getElementById('announcement-bars');
  var bars=c.querySelectorAll('[data-bar]');
  var i=0;
  setInterval(function(){
    var cur=bars[i];
    cur.style.opacity='0';
    setTimeout(function(){
      cur.style.display='none';
      i=(i+1)%bars.length;
      var next=bars[i];
      next.style.display='block';
      next.style.opacity='0';
      requestAnimationFrame(function(){ next.style.opacity='1'; });
    },350);
  },${announcements.intervalMs});
})();</script>`;
}

// Small on-screen cards (distinct from the sticky top bar) that appear a set number of
// seconds after a visitor lands, optionally with a CTA button, and either auto-hide after
// a set duration or stay until dismissed. Stacked bottom-right, each one its own IIFE so
// their show/hide timers never collide.
function renderPopupAnnouncements(project: Project): string {
  const popups = project.announcements.popups ?? [];
  if (!project.announcements.enabled || popups.length === 0) return '';

  return popups
    .map((popup, idx) => {
      const bottom = 20 + idx * 90;
      const hasButton = popup.buttonLabel.trim().length > 0;
      return `<div id="popup-${escapeAttr(popup.id)}" style="position:fixed;right:20px;bottom:${bottom}px;max-width:320px;z-index:600;background:${hexToRgba(
        popup.backgroundColor,
        popup.opacity
      )};color:${escapeAttr(popup.textColor)};border-radius:14px;padding:14px 40px 14px 18px;box-shadow:0 10px 30px rgba(0,0,0,0.25);opacity:0;transform:translateY(24px);transition:opacity 0.35s ease, transform 0.35s ease;pointer-events:none;">
  <button aria-label="Dismiss" data-dismiss style="position:absolute;top:8px;right:10px;background:none;border:none;font-size:18px;line-height:1;cursor:pointer;color:${escapeAttr(
    popup.textColor
  )};">&times;</button>
  <div style="font-size:14px;font-weight:600;">${escapeHtml(popup.text)}</div>
  ${
    hasButton
      ? `<a href="${escapeAttr(safeUrl(popup.buttonUrl))}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;background:${escapeAttr(
          popup.textColor
        )};color:${escapeAttr(popup.backgroundColor)};font-weight:700;font-size:12px;padding:8px 14px;border-radius:999px;text-decoration:none;">${escapeHtml(
          popup.buttonLabel
        )}</a>`
      : ''
  }
</div>
<script>(function(){
  var el=document.getElementById('popup-${popup.id}');
  var dismissed=false;
  function show(){ if(dismissed) return; el.style.opacity='1'; el.style.transform='translateY(0)'; el.style.pointerEvents='auto'; }
  function hide(){ dismissed=true; el.style.opacity='0'; el.style.transform='translateY(24px)'; el.style.pointerEvents='none'; }
  setTimeout(show, ${Math.max(0, popup.delaySeconds) * 1000});
  ${popup.durationSeconds > 0 ? `setTimeout(hide, ${(Math.max(0, popup.delaySeconds) + popup.durationSeconds) * 1000});` : ''}
  el.querySelector('[data-dismiss]').addEventListener('click', hide);
})();</script>`;
    })
    .join('\n');
}

// Real, working nav bar for a manually-built multi-page website (see Project.pages) --
// shared verbatim across every one of that site's rendered pages, each page's link built
// from a root-relative path so it works identically on the free {slug}.buildsitespark.com
// subdomain and any connected custom domain. `currentSlug` highlights which page a visitor
// is already on ('' for Home). Returns '' for every non-multi-page project (nothing to link
// between), which renderProjectHtml below just inlines as-is.
export function renderPageNavHtml(pages: SitePage[], currentSlug: string): string {
  if (pages.length <= 1) return '';
  const links = pages
    .map((page) => {
      const href = page.slug ? `/${page.slug}` : '/';
      const active = page.slug === currentSlug;
      return `<a href="${escapeAttr(href)}" style="color:${active ? '#FFFFFF' : '#CBD5E1'};font-weight:${
        active ? '700' : '600'
      };text-decoration:none;padding:8px 14px;">${escapeHtml(page.name)}</a>`;
    })
    .join('');
  return `<nav style="position:sticky;top:0;z-index:9997;display:flex;flex-wrap:wrap;justify-content:center;gap:2px;padding:6px 10px;background:#0F172A;font-family:-apple-system,sans-serif;font-size:14px;">${links}</nav>`;
}

export function renderProjectHtml(
  project: Project,
  slug: string,
  storeCheckoutUrl: string,
  reportUrl: string,
  productStockUrl: string,
  navHtml = ''
): string {
  const hasProducts = project.elements.some((el) => el.type === 'product');
  const usesMdi = project.elements.some((el) => el.type === 'icon' && el.iconSet === 'MaterialCommunityIcons');
  const usesFa = project.elements.some((el) => el.type === 'icon' && el.iconSet === 'FontAwesome5');
  const usesIon = project.elements.some((el) => el.type === 'icon' && el.iconSet === 'Ionicons');

  const iconLinks = [
    usesMdi ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7/css/materialdesignicons.min.css">' : '',
    usesFa ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">' : '',
    usesIon
      ? '<script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script><script nomodule src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js"></script>'
      : '',
  ].join('\n  ');

  const usedFontIds = new Set(
    project.elements
      .filter((el): el is Extract<CanvasElement, { type: 'text' }> => el.type === 'text' && !!el.fontFamily && el.fontFamily !== 'system')
      .map((el) => el.fontFamily as string)
  );
  const fontQueries = [...usedFontIds]
    .map((id) => getFontOption(id).googleFontsQuery)
    .filter((q): q is string => !!q);
  const fontLink =
    fontQueries.length > 0
      ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontQueries
          .map((q) => `family=${q}`)
          .join('&')}&display=swap">`
      : '';

  const elementsHtml = project.elements
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((el) => renderElement(el, slug, productStockUrl))
    .join('\n');

  const { width, height } = project.canvasSize;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(project.name)}</title>
  ${iconLinks}
  ${fontLink}
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: ${escapeAttr(project.backgroundColor)}; }
    #site-wrapper { display: flex; justify-content: center; }
    #canvas {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      background: ${escapeAttr(project.backgroundColor)};
      transform-origin: top center;
      overflow: hidden;
    }
    .sitespark-badge {
      position: fixed; bottom: 10px; right: 10px; z-index: 9999;
      font-family: -apple-system, sans-serif; font-size: 11px; color: #94A3B8;
      background: #FFFFFFCC; padding: 4px 8px; border-radius: 8px; text-decoration: none;
    }
  </style>
</head>
<body>
  ${navHtml}
  ${renderAnnouncementBars(project)}
  <div id="site-wrapper">
    <div id="canvas">
      ${elementsHtml}
    </div>
  </div>
  <a class="sitespark-badge" href="https://sitespark.app" target="_blank" rel="noopener">Built with SiteSpark</a>
  ${renderReportWidget(slug, reportUrl, `https://${slug}.buildsitespark.com`)}
  ${renderPopupAnnouncements(project)}
  ${hasProducts ? renderCartWidget(slug, storeCheckoutUrl) : ''}
  <script>
    (function () {
      var canvas = document.getElementById('canvas');
      var wrapper = document.getElementById('site-wrapper');
      function fit() {
        var scale = Math.min(1, wrapper.clientWidth / ${width});
        canvas.style.transform = 'scale(' + scale + ')';
        wrapper.style.height = (${height} * scale) + 'px';
      }
      fit();
      window.addEventListener('resize', fit);
    })();
  </script>
</body>
</html>`;
}

// Shared page chrome (nav + footer) for buildsitespark.com's real marketing site (home,
// privacy, returns, support) -- served for the bare product domain and any request that
// doesn't resolve to a specific published project or connected custom domain -- see
// servePublishedSite's hostname handling in index.ts. Lives here (not static files in
// public/) because Firebase Hosting can't vary static content by Host header -- every
// custom domain attached to this Hosting site shares the same rewrites/config, so these
// pages have to be rendered dynamically alongside everything else.
// Where the real web app (sign-in + the full canvas editor/AI builder running via Expo's
// web export) is hosted -- a separate Firebase Hosting site/target from this marketing
// page (see firebase.json's "webapp" target and ROADMAP.md's "Web app hosting setup" for
// the one-time site-creation + DNS steps this domain depends on).
const WEBAPP_URL = 'https://app.buildsitespark.com';

function marketingShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background:
        radial-gradient(1100px 520px at 12% -10%, rgba(99,102,241,0.28), transparent 60%),
        radial-gradient(900px 460px at 88% 8%, rgba(236,72,153,0.16), transparent 55%),
        radial-gradient(800px 500px at 50% 100%, rgba(34,211,238,0.10), transparent 60%),
        #0B1220;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    a { color: #A5B4FC; }
    code { background: #1E293B; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 0 24px; }
    header.site {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 24px; border-bottom: 1px solid rgba(148,163,184,0.15);
      position: sticky; top: 0; z-index: 10;
      background: rgba(11,18,32,0.75); backdrop-filter: blur(10px);
    }
    header.site .logo {
      font-weight: 800; font-size: 20px; text-decoration: none;
      background: linear-gradient(90deg, #A5B4FC, #F0ABFC 60%, #67E8F9);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    header.site nav { display: flex; align-items: center; }
    header.site nav a.navlink { margin-left: 22px; font-size: 14px; color: #CBD5E1; text-decoration: none; }
    header.site nav a.navlink:hover { color: #F8FAFC; }
    header.site nav a.signin {
      margin-left: 22px; font-size: 14px; font-weight: 600; color: #F8FAFC; text-decoration: none;
    }
    header.site nav a.cta {
      margin-left: 22px; font-size: 13px; font-weight: 700; text-decoration: none;
      color: #0B1220; padding: 9px 18px; border-radius: 999px;
      background: linear-gradient(90deg, #818CF8, #E879F9);
      box-shadow: 0 6px 18px rgba(129,140,248,0.35);
      white-space: nowrap;
    }
    /* Below this width, "Features / Pricing / Support / Sign In / Get Started" all in one
       flex row runs wider than the screen and pushes "Get Started" off-screen entirely --
       drop the in-page anchor links (Support still has its own footer link, and the
       sections are one scroll away) so Sign In + Get Started always stay on-screen. */
    @media (max-width: 640px) {
      header.site { padding: 14px 16px; }
      header.site nav a.navlink { display: none; }
      header.site nav a.signin { margin-left: 0; margin-right: 12px; font-size: 13px; }
      header.site nav a.cta { margin-left: 0; padding: 8px 14px; font-size: 12px; }
    }
    footer.site {
      border-top: 1px solid rgba(148,163,184,0.15); padding: 36px 24px; text-align: center;
      color: #64748B; font-size: 13px; margin-top: 40px;
    }
    footer.site a { color: #94A3B8; }
    footer.site .links { margin-bottom: 8px; }
    footer.site .links a { margin: 0 10px; }
    h1 { font-size: 38px; margin: 0 0 12px; letter-spacing: -0.5px; }
    h2 { font-size: 26px; margin: 0 0 8px; letter-spacing: -0.3px; }
    h3 { font-size: 16px; margin: 0 0 6px; }
    p.lead { color: #B9C2D0; font-size: 17px; max-width: 640px; }
  </style>
</head>
<body>
  <header class="site">
    <a class="logo" href="/">SiteSpark</a>
    <nav>
      <a class="navlink" href="/#features">Features</a>
      <a class="navlink" href="/#pricing">Pricing</a>
      <a class="navlink" href="/support">Support</a>
      <a class="signin" href="${WEBAPP_URL}">Sign In</a>
      <a class="cta" href="${WEBAPP_URL}">Get Started</a>
    </nav>
  </header>
  ${bodyHtml}
  <footer class="site">
    <div class="links">
      <a href="/privacy">Privacy Policy</a>
      <a href="/returns">Return &amp; Refund Policy</a>
      <a href="/support">Support</a>
    </div>
    <div>&copy; ${new Date().getFullYear()} SiteSpark &middot; <a href="mailto:support@buildsitespark.com">support@buildsitespark.com</a></div>
  </footer>
</body>
</html>`;
}

const PAGE_TYPES: { name: string; icon: string; accent: string }[] = [
  { name: 'Website', icon: '&#127760;', accent: '#818CF8' },
  { name: 'Video', icon: '&#127909;', accent: '#F472B6' },
  { name: 'Social (9:16)', icon: '&#128241;', accent: '#67E8F9' },
  { name: 'Logo', icon: '&#10024;', accent: '#FBBF24' },
];

const FEATURES: { title: string; body: string; icon: string; accent: string }[] = [
  {
    title: 'Manual canvas editor',
    body: 'Drag-and-drop text, images, shapes, icons, buttons, slideshows, and real trimmed video with an optional synced audio overlay.',
    icon: '&#127912;',
    accent: '#818CF8',
  },
  {
    title: 'Real AI Site Builder',
    body: 'Describe your site in up to 4,000 words and a real AI pipeline writes the copy and generates the images, laid out on an editable canvas.',
    icon: '&#129504;',
    accent: '#F472B6',
  },
  {
    title: 'Spark, the AI assistant',
    body: 'A persistent chat assistant that answers questions and can open the right screen for you, on every screen of the app.',
    icon: '&#10024;',
    accent: '#67E8F9',
  },
  {
    title: 'Real publishing & domains',
    body: 'Every project publishes instantly to a free subdomain like <code>yourproject.buildsitespark.com</code>, or connect a domain you own, or buy a brand-new one without leaving the app.',
    icon: '&#127760;',
    accent: '#FBBF24',
  },
];

const PLANS: { name: string; price: string; credits: string; popular?: boolean }[] = [
  { name: 'Beginner', price: '$64.99/mo', credits: '200 credits/mo' },
  { name: 'Middle Class', price: '$109.99/mo', credits: '460 credits/mo', popular: true },
  { name: 'Advanced', price: '$149.99/mo', credits: '1,000 credits/mo' },
];

export function renderLandingPageHtml(): string {
  const body = `
  <section class="wrap" style="padding:88px 24px 64px;text-align:center;">
    <div style="display:inline-block;font-size:12px;font-weight:700;letter-spacing:0.4px;color:#C4B5FD;background:rgba(129,140,248,0.12);border:1px solid rgba(129,140,248,0.35);border-radius:999px;padding:6px 16px;margin-bottom:22px;">
      NOW ON THE APP STORE
    </div>
    <h1>Build a real website — by hand, or with a real AI builder</h1>
    <p class="lead" style="margin:0 auto 28px;">Website, video, social, and logo pages, published at their own real
    link the moment you're done. No mockups, no "coming soon" placeholders inside the app itself.</p>
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
      <a href="${WEBAPP_URL}" style="text-decoration:none;font-weight:700;font-size:15px;color:#0B1220;padding:14px 28px;border-radius:12px;background:linear-gradient(90deg,#818CF8,#E879F9);box-shadow:0 10px 30px rgba(129,140,248,0.35);">Get Started Free</a>
      <a href="/#features" style="text-decoration:none;font-weight:700;font-size:15px;color:#F8FAFC;padding:14px 28px;border-radius:12px;border:1px solid rgba(148,163,184,0.3);">See how it works</a>
    </div>
  </section>

  <section id="features" class="wrap" style="padding:40px 24px 64px;">
    <h2 style="text-align:center;margin-bottom:28px;">Four kinds of pages, two ways to build them</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:48px;">
      ${PAGE_TYPES.map(
        (t) =>
          `<div style="background:linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015));border:1px solid rgba(148,163,184,0.16);border-radius:16px;padding:22px 16px;text-align:center;">
            <div style="font-size:26px;margin-bottom:8px;">${t.icon}</div>
            <div style="font-weight:700;color:${t.accent};">${escapeHtml(t.name)}</div>
          </div>`
      ).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;">
      ${FEATURES.map(
        (f) =>
          `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(148,163,184,0.12);border-radius:16px;padding:22px;">
            <div style="width:40px;height:40px;border-radius:10px;background:${f.accent}22;display:flex;align-items:center;justify-content:center;font-size:19px;margin-bottom:12px;">${f.icon}</div>
            <h3>${escapeHtml(f.title)}</h3>
            <p style="color:#98A2B3;font-size:14px;">${f.body}</p>
          </div>`
      ).join('')}
    </div>
  </section>

  <section id="pricing" class="wrap" style="padding:48px 24px 80px;">
    <h2 style="text-align:center;margin-bottom:28px;">Plans</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;">
      ${PLANS.map(
        (p) => `
      <div style="position:relative;background:${p.popular ? 'linear-gradient(160deg,rgba(129,140,248,0.16),rgba(232,121,249,0.08))' : 'rgba(255,255,255,0.03)'};border:1px solid ${p.popular ? 'rgba(165,180,252,0.55)' : 'rgba(148,163,184,0.14)'};border-radius:18px;padding:30px 26px;text-align:center;${p.popular ? 'box-shadow:0 14px 34px rgba(129,140,248,0.22);' : ''}">
        ${p.popular ? '<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:800;letter-spacing:0.4px;color:#0B1220;background:linear-gradient(90deg,#818CF8,#E879F9);padding:4px 14px;border-radius:999px;">MOST POPULAR</div>' : ''}
        <div style="font-weight:700;font-size:17px;margin-bottom:6px;">${escapeHtml(p.name)}</div>
        <div style="font-size:28px;font-weight:800;margin-bottom:6px;background:linear-gradient(90deg,#F8FAFC,#C7D2FE);-webkit-background-clip:text;background-clip:text;color:transparent;">${escapeHtml(p.price)}</div>
        <div style="color:#98A2B3;font-size:14px;">${escapeHtml(p.credits)}</div>
      </div>`
      ).join('')}
    </div>
    <p style="text-align:center;color:#7C8797;font-size:13px;margin-top:26px;">
      Plus one-time credit packs and luxury theme unlocks, available from inside the app.
    </p>
  </section>`;
  return marketingShell('SiteSpark — build a real website, by hand or with AI', body);
}

// Mirrors src/data/policies.ts -- functions run in a separate Node project from the app
// (no shared `@/` alias across them), so this is duplicated rather than imported. Keep in
// sync by hand if either side's policy copy changes.
const PRIVACY_POLICY_UPDATED = 'Last updated: 20 July 2026';
const PRIVACY_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'What we collect',
    body:
      'Account info: your email, phone number, or Google/Apple account details, handled by Firebase Authentication. ' +
      'Content you create: text, images, video/audio clips, and site layouts you add to your projects. ' +
      'AI prompts: what you type into the AI Site Builder or the Spark assistant. ' +
      'Payment-adjacent info: for domain purchases/transfers, the real registrant contact (name, address, phone, ' +
      'email) required by ICANN for domain registration. We never see or store your card details directly.',
  },
  {
    heading: 'Who we share it with, and why',
    body:
      'Firebase/Google Cloud hosts your account, projects, and files, and runs the backend that powers this app. ' +
      'OpenAI processes AI Site Builder prompts and the Spark assistant’s conversation to generate copy, layouts, ' +
      'and images — per OpenAI’s API terms, this data is not used to train their models. ' +
      'Stripe processes real payments for domain purchases; we receive confirmation of payment, never your full ' +
      'card number. Namecheap is our domain registrar partner — for any domain you buy, register, or transfer ' +
      'through the app, your registrant contact is submitted to them to complete the real ICANN registration; ' +
      'free WHOIS privacy protection is requested automatically so it isn’t publicly visible in WHOIS lookups. ' +
      'Apple processes subscription and credit-pack purchases through In-App Purchase. Google AdMob serves the ' +
      'app-open, banner, and rewarded-credit ads inside the app — ads are requested as non-personalized, so ' +
      'AdMob does not receive advertising identifiers or build a profile of you for tracking.',
  },
  {
    heading: 'Publishing makes content public',
    body:
      'When you publish a project, its content (text, images, video) becomes a real, publicly reachable web page ' +
      'that anyone with the link — or your connected domain — can view. Unpublishing takes it back down. ' +
      'Don’t publish anything you don’t want visible to the public.',
  },
  {
    heading: 'Your choices',
    body:
      'You can delete individual projects at any time from the Projects screen. To delete your account entirely, ' +
      'go to Account → Delete Account — this immediately and permanently removes your projects, published sites, ' +
      'credit balance, order history, and assistant chat history from our systems; no need to contact support. ' +
      'Domain registrations already submitted to Namecheap follow that registrar’s own account/data rules, since ' +
      'the domain itself is a real-world asset independent of this app.',
  },
  {
    heading: 'Contact',
    body: 'Questions about this policy or your data: support@buildsitespark.com or +61 408 680 813.',
  },
];

const RETURN_POLICY_UPDATED = 'Last updated: 20 July 2026';
const RETURN_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'Subscriptions and credit packs',
    body:
      'Plans (Beginner/Middle Class/Advanced) and credit packs are purchased through Apple’s In-App Purchase. ' +
      'Apple processes all payments for these and handles refund requests directly — SiteSpark does not have ' +
      'the ability to issue refunds for IAP purchases itself. Request a refund at reportaproblem.apple.com or ' +
      'through your Apple ID purchase history.',
  },
  {
    heading: 'Theme unlocks',
    body:
      'Luxury theme unlocks ($189) and luxury-crazy theme unlocks ($399) are one-time Apple In-App Purchases, ' +
      'subject to the same Apple-handled refund process as above.',
  },
  {
    heading: 'Domain purchases and transfers',
    body:
      'Buying or transferring a real domain is processed as a one-time Stripe payment, separate from Apple IAP, ' +
      'because a registered domain is a real-world asset rather than digital app content. If a domain registration ' +
      'or transfer fails on our end (for example, the registrar rejects it), you are not charged — payment is ' +
      'only captured, and the domain only registered, once both succeed. Once a domain is successfully registered ' +
      'or an inbound transfer completes, it generally cannot be refunded, in line with standard domain industry and ' +
      'ICANN practice — the underlying registration cost has already been paid to the registry. If something ' +
      'goes wrong on your purchase, contact support below and we’ll look into it.',
  },
  {
    heading: 'Contact',
    body: 'Billing or refund questions: support@buildsitespark.com or +61 408 680 813.',
  },
];

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'How do free credits work?',
    answer:
      'Every new account gets 38 free credits to try the AI Site Builder. Building a site costs credits based on ' +
      'how detailed you ask it to be.',
  },
  {
    question: 'Can I edit an AI-generated site afterward?',
    answer:
      'Yes — once the AI Site Builder finishes, it opens straight into the regular canvas editor, where you ' +
      'can move, resize, or replace anything it created.',
  },
  {
    question: 'What happens if I unpublish a project?',
    answer: 'Its public page stops being reachable immediately. Your project isn’t deleted — you can republish any time.',
  },
  {
    question: 'Do I need to own a domain to publish?',
    answer: 'No — every published project gets a real, working link automatically. Connecting or buying a custom domain is optional.',
  },
  {
    question: 'Is my card information stored by SiteSpark?',
    answer:
      'No. Domain purchases are processed by Stripe, and subscriptions/credit packs by Apple’s In-App ' +
      'Purchase — SiteSpark never sees or stores your full card details.',
  },
  {
    question: 'How do the "watch an ad for credits", banner, and app-open ads work?',
    answer:
      'Every 2 days, you can watch a short rewarded ad from Google AdMob for 15 free credits — the button on ' +
      'your Projects screen shows when it’s available again. You may also see a banner ad on the Projects ' +
      'screen and, occasionally, a full-screen ad when you return to the app after switching away. Ads shown ' +
      'in the app are non-personalized and don’t track you across other apps or websites.',
  },
  {
    question: 'Can I use SiteSpark from a computer, not just the iOS app?',
    answer:
      'Yes — sign in at app.buildsitespark.com with the same Google, Apple, or phone number account to access ' +
      'your projects from a browser.',
  },
];

function renderPolicyPage(title: string, updated: string, sections: { heading: string; body: string }[]): string {
  const body = `
  <section class="wrap" style="padding:56px 24px 72px;max-width:720px;">
    <h1 style="font-size:28px;">${escapeHtml(title)}</h1>
    <p style="color:#64748B;font-size:13px;margin-bottom:32px;">${escapeHtml(updated)}</p>
    ${sections
      .map(
        (s) => `
    <div style="margin-bottom:26px;">
      <h2 style="font-size:18px;">${escapeHtml(s.heading)}</h2>
      <p style="color:#CBD5E1;font-size:15px;">${escapeHtml(s.body)}</p>
    </div>`
      )
      .join('')}
  </section>`;
  return marketingShell(`${title} — SiteSpark`, body);
}

// This is accurate-to-the-code, not legally reviewed -- see ROADMAP.md.
export function renderPrivacyPolicyHtml(): string {
  return renderPolicyPage('Privacy Policy', PRIVACY_POLICY_UPDATED, PRIVACY_SECTIONS);
}

export function renderReturnPolicyHtml(): string {
  return renderPolicyPage('Return & Refund Policy', RETURN_POLICY_UPDATED, RETURN_SECTIONS);
}

export function renderSupportHtml(): string {
  const body = `
  <section class="wrap" style="padding:56px 24px 72px;max-width:720px;">
    <h1 style="font-size:28px;">Support</h1>
    <p style="color:#94A3B8;font-size:15px;margin-bottom:8px;">
      Email <a href="mailto:support@buildsitespark.com">support@buildsitespark.com</a> or call
      <a href="tel:+61408680813">+61 408 680 813</a>.
    </p>
    <h2 style="font-size:20px;margin-top:40px;margin-bottom:16px;">Frequently asked questions</h2>
    ${FAQ_ITEMS.map(
      (item) => `
    <div style="margin-bottom:20px;">
      <h3 style="font-size:15px;">${escapeHtml(item.question)}</h3>
      <p style="color:#CBD5E1;font-size:14px;">${escapeHtml(item.answer)}</p>
    </div>`
    ).join('')}
  </section>`;
  return marketingShell('Support — SiteSpark', body);
}

// Served in place of a project's real published HTML once enforceBillingSuspensions has
// marked its PublishedSite doc `suspended` (see index.ts) -- a failed subscription payment
// that went unresolved past the grace period. Distinct from renderLandingPageHtml (that's the
// bare product-domain fallback); this page is scoped to the one project that's actually down,
// so a visitor isn't left thinking the whole site is broken with no explanation.
export function renderSuspendedSiteHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Site unavailable</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0B1220;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
      padding: 24px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: #94A3B8; font-size: 15px; line-height: 1.5; max-width: 420px; margin: 0 auto; }
  </style>
</head>
<body>
  <div>
    <h1>This site is temporarily unavailable</h1>
    <p>The owner's subscription payment could not be processed. The site will come back
    online automatically as soon as it's resolved.</p>
  </div>
</body>
</html>`;
}
