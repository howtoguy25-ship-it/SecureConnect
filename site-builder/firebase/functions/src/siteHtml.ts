import { CanvasElement, Project } from './types';

// Renders a Project's absolutely-positioned canvas into a real, self-contained static
// HTML page. The editor's data model is an absolute-position canvas (not semantic
// responsive HTML), so the page scales the whole canvas as one block to fit the
// visitor's viewport width via a CSS custom property + a tiny inline resize script --
// good enough for a genuinely real published page without redesigning the data model.

function escapeHtml(value: string): string {
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

function renderElement(el: CanvasElement): string {
  const base = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;`;
  switch (el.type) {
    case 'text':
      return `<div style="${base}color:${escapeAttr(el.color)};font-size:${el.fontSize}px;font-weight:${
        el.fontWeight === 'bold' ? '700' : '400'
      };text-align:${el.align};white-space:pre-wrap;">${escapeHtml(el.text)}</div>`;
    case 'image':
      return el.uri
        ? `<img src="${escapeAttr(el.uri)}" style="${base}object-fit:cover;" />`
        : '';
    case 'shape':
      return renderShape(el);
    case 'button':
      return `<div style="${base}background:${escapeAttr(el.backgroundColor)};color:${escapeAttr(
        el.textColor
      )};border-radius:${el.borderRadius}px;${
        el.borderWidth ? `border:${el.borderWidth}px solid ${escapeAttr(el.borderColor ?? '#000000')};` : ''
      }display:flex;align-items:center;justify-content:center;font-weight:700;">${escapeHtml(el.label)}</div>`;
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
    default:
      return '';
  }
}

function renderAnnouncementBars(project: Project): string {
  const { announcements } = project;
  if (!announcements.enabled || announcements.bars.length === 0) return '';

  if (announcements.bars.length === 1 || !announcements.autoSlide) {
    const bar = announcements.bars[0];
    return `<div style="width:100%;padding:10px 16px;text-align:center;background:${escapeAttr(
      bar.backgroundColor
    )};color:${escapeAttr(bar.textColor)};font-size:13px;font-weight:600;">${escapeHtml(bar.text)}</div>`;
  }

  const bars = announcements.bars
    .map(
      (bar, i) =>
        `<div data-bar style="display:${i === 0 ? 'block' : 'none'};background:${escapeAttr(
          bar.backgroundColor
        )};color:${escapeAttr(bar.textColor)};">${escapeHtml(bar.text)}</div>`
    )
    .join('');
  return `<div id="announcement-bars" style="width:100%;text-align:center;font-size:13px;font-weight:600;">${bars}</div>
<script>(function(){var c=document.getElementById('announcement-bars');var bars=c.querySelectorAll('[data-bar]');var i=0;setInterval(function(){bars[i].style.display='none';i=(i+1)%bars.length;bars[i].style.display='block';bars[i].style.padding='10px 16px';},${announcements.intervalMs});bars[0].style.padding='10px 16px';})();</script>`;
}

export function renderProjectHtml(project: Project): string {
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

  const elementsHtml = project.elements
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map(renderElement)
    .join('\n');

  const { width, height } = project.canvasSize;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(project.name)}</title>
  ${iconLinks}
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
  ${renderAnnouncementBars(project)}
  <div id="site-wrapper">
    <div id="canvas">
      ${elementsHtml}
    </div>
  </div>
  <a class="sitespark-badge" href="https://sitespark.app" target="_blank" rel="noopener">Built with SiteSpark</a>
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

// Served for the bare product domain (buildsitespark.com / www.) and any request that
// doesn't resolve to a specific published project or connected custom domain -- see
// servePublishedSite's hostname handling in index.ts. Lives here (not a static file in
// public/) because Firebase Hosting can't vary static content by Host header -- every
// custom domain attached to this Hosting site shares the same rewrites/config, so the
// landing page has to be rendered dynamically alongside everything else.
export function renderLandingPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SiteSpark</title>
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
    h1 { font-size: 30px; margin-bottom: 8px; }
    p { color: #94A3B8; font-size: 15px; line-height: 1.5; max-width: 420px; margin: 0 auto; }
    a { color: #818CF8; }
  </style>
</head>
<body>
  <div>
    <h1>SiteSpark</h1>
    <p>Build a website, social page, or logo by hand or with a real AI builder — then
    publish it at its own real link, like <code>yourproject.buildsitespark.com</code>,
    or connect a domain of your own.</p>
    <p style="margin-top:16px;"><a href="mailto:support@buildsitespark.com">support@buildsitespark.com</a></p>
  </div>
</body>
</html>`;
}
