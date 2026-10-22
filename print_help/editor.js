(() => {
'use strict';

const $ = id => document.getElementById(id);
let pages = [], current = -1, busy = false;
let drag = null, dragSrcIndex = -1, suppressClick = false;
let hoverEdge = -1, hoverPos = null;
let panState = null;
let zoom = { scale: 1, x: 0, y: 0 };
const EDGE_SAMPLES = 120;

let outView = { scale: 1, x: 0, y: 0, minScale: 1 };
let outPanState = null;
let prevOutKey = '';

const source  = $('sourceCanvas');
const overlay = $('overlay');
const out     = $('outputCanvas');
const outWrap = $('outputCanvasWrap');
const sctx    = source.getContext('2d', { willReadFrequently: true });
const octx    = overlay.getContext('2d');
const outctx  = out.getContext('2d', { willReadFrequently: true });

/* ---------- تنظیمات ثابت ---------- */
const FIXED_QUALITY = 1;
const FIXED_ENH     = 1;
const FIXED_GRAY    = 1;
const FIXED_WHITEN  = 1;
function getMode(){ return $('enhanceToggle').checked ? 'enhanced' : 'none'; }
function onEnhanceToggle(){
  $('enhanceLabel').classList.toggle('active', $('enhanceToggle').checked);
  processCurrent();
}
function onInvertChange(){
  $('invertLabel').classList.toggle('active', $('invertToggle').checked);
  processCurrent();
}
function onPaperChange(){ /* فقط برای PDF/Print */ }

/* ---------- Paper size ---------- */
function getPaperSize(){
  const v = $('paper').value;
  const A4W = 595.28, A4H = 841.89;
  const A5W = 419.53, A5H = 595.28;
  switch (v){
    case 'a4-landscape': return { W: A4H, H: A4W };
    case 'a5-portrait':  return { W: A5W, H: A5H };
    case 'a5-landscape': return { W: A5H, H: A5W };
    case 'a4-portrait':
    default:             return { W: A4W, H: A4H };
  }
}

/* ---------- UI helpers ---------- */
function refreshControls(){
  const hasPage = current >= 0;
  const locked = busy;
  ['rotLBtn','rotRBtn','flipHBtn','flipVBtn','resetBtn','zoomResetBtn','zoomFitBtn'].forEach(id => $(id).disabled = locked || !hasPage);
  $('enhanceToggle').disabled = locked || !hasPage;
  $('paper').disabled = locked || !hasPage;
  $('invertToggle').disabled = locked || !hasPage;
  ['dlJpg','dlAllJpg','dlPdf','printBtn'].forEach(id => $(id).disabled = locked || !hasPage);
  $('closeBtn').disabled = locked || !pages.length;
  document.querySelectorAll('#pages .page').forEach(el => {
    el.setAttribute('draggable', (!locked && hasPage) ? 'true' : 'false');
  });
}
function nextPaint(){ return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }

/* ---------- File input + drop zone ---------- */
$('fileInput').addEventListener('change', async e => {
  const files = [...e.target.files];
  if (files.length) await addFiles(files);
  e.target.value = '';
});
$('emptyOpenBtn').addEventListener('click', () => $('fileInput').click());

async function addFiles(files){
  const before = pages.length;
  for (const f of files){
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) continue;
    const img = await loadImage(f);
    pages.push({ name: f.name, img, rotation: 0, flipH: false, flipV: false, corners: null, midpoints: [] });
  }
  const added = pages.length - before;
  if (!added) return;
  renderPages();
  if (current < 0 && pages.length) selectPage(0);
  else if (added > 0) drawSource();
}
function loadImage(file){
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), i = new Image();
    i.onload  = () => { URL.revokeObjectURL(u); res(i); };
    i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('تصویر خوانده نشد')); };
    i.src = u;
  });
}
function loadImageFromBlob(blob){
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob), i = new Image();
    i.onload  = () => { URL.revokeObjectURL(u); res(i); };
    i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('blob load failed')); };
    i.src = u;
  });
}
function loadImageFromURL(url){
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload  = () => res(i);
    i.onerror = () => rej(new Error('url load failed: ' + String(url).slice(0, 80)));
    i.src = url;
  });
}

(function setupDropZone(){
  const shell = $('shell');
  let dragDepth = 0;
  function reset(){ dragDepth = 0; shell.classList.remove('drag-over'); }
  shell.addEventListener('dragenter', e => {
    e.preventDefault(); e.stopPropagation();
    dragDepth++; shell.classList.add('drag-over');
  });
  shell.addEventListener('dragover', e => {
    e.preventDefault(); e.stopPropagation();
    try { e.dataTransfer.dropEffect = 'copy'; } catch(_){}
  });
  shell.addEventListener('dragleave', e => {
    e.preventDefault(); e.stopPropagation();
    dragDepth--;
    if (dragDepth <= 0) reset();
  });
  shell.addEventListener('drop', async e => {
    e.preventDefault(); e.stopPropagation();
    reset();
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) await addFiles(files);
  });
  window.addEventListener('dragover', e => { e.preventDefault(); }, false);
  window.addEventListener('drop', e => { e.preventDefault(); reset(); }, false);
  window.addEventListener('dragend', reset);
  window.addEventListener('blur', reset);
})();

/* ---------- Pages ---------- */
function renderPages(){
  const pagesEl = $('pages');
  pagesEl.innerHTML = pages.map((p, i) =>
    `<div class="page ${i===current?'active':''}" draggable="true" data-index="${i}">
       <span>${i+1}</span>
       <div><b>${escapeHtml(p.name)}</b><small>${pageSubtitle(p)}</small></div>
       <button class="rm" data-rm="${i}" type="button">×</button>
     </div>`).join('');
  pagesEl.querySelectorAll('.page').forEach(el => {
    el.addEventListener('click', onPageClick);
    el.addEventListener('dragstart', onPageDragStart);
    el.addEventListener('dragover', onPageDragOver);
    el.addEventListener('dragleave', onPageDragLeave);
    el.addEventListener('drop', onPageDrop);
    el.addEventListener('dragend', onPageDragEnd);
  });
  pagesEl.querySelectorAll('.rm').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removePage(Number(btn.dataset.rm));
    });
  });
  refreshControls();
}
function onPageClick(e){
  if (suppressClick) return;
  if (e.target.classList.contains('rm')) return;
  selectPage(Number(this.dataset.index));
}
function onPageDragStart(e){
  dragSrcIndex = Number(this.dataset.index);
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(dragSrcIndex)); } catch(_){}
}
function onPageDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const idx = Number(this.dataset.index);
  if (idx !== dragSrcIndex) this.classList.add('drop-target');
}
function onPageDragLeave(){ this.classList.remove('drop-target'); }
function onPageDrop(e){
  e.preventDefault(); e.stopPropagation();
  const to = Number(this.dataset.index);
  if (dragSrcIndex < 0 || dragSrcIndex === to) return;
  const [moved] = pages.splice(dragSrcIndex, 1);
  if (dragSrcIndex === current) current = to;
  else {
    if (dragSrcIndex < current) current--;
    if (to <= current) current++;
  }
  pages.splice(to, 0, moved);
  dragSrcIndex = -1;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 250);
  renderPages();
  drawSource();
}
function onPageDragEnd(){
  dragSrcIndex = -1;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('dragging','drop-target'));
}
function pageSubtitle(p){
  const parts = [];
  if (p.rotation) parts.push(`چرخش ${p.rotation}°`);
  if (p.flipH) parts.push('آینه افقی');
  if (p.flipV) parts.push('آینه عمودی');
  return parts.length ? parts.join(' • ') : 'آماده';
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function removePage(i){
  pages.splice(i, 1);
  if (!pages.length){ closeAll(); return; }
  selectPage(Math.min(i, pages.length - 1));
  renderPages();
  refreshControls();
}
function selectPage(i){
  if (i < 0 || i >= pages.length) return;
  current = i;
  hoverEdge = -1; hoverPos = null; drag = null;
  prevOutKey = '';
  drawSource();
  renderPages();
  refreshControls();
}
function closeAll(){
  pages = []; current = -1;
  drag = null; hoverEdge = -1; hoverPos = null; panState = null;
  outPanState = null;
  source.width = overlay.width = 1;
  source.height = overlay.height = 1;
  $('canvasWrap').style.display = 'none';
  $('empty').style.display = 'grid';
  $('outputBox').classList.remove('has-output');
  $('outputBox').classList.remove('panning');
  out.width = out.height = 1;
  prevOutKey = '';
  renderPages();
  refreshControls();
}
function closeEditor(){
  if (window.parent && window.parent !== window){
    try { window.parent.postMessage({ type: 'rph-editor-close' }, '*'); } catch(_){}
  } else {
    closeAll();
  }
}

/* ---------- Initial corners ---------- */
function initialCorners(){
  return [
    { x: 0,             y: 0 },
    { x: source.width,  y: 0 },
    { x: source.width,  y: source.height },
    { x: 0,             y: source.height }
  ];
}

/* ---------- Source canvas ---------- */
function drawSource(){
  if (current < 0 || !pages[current]) return;
  const p = pages[current], img = p.img;
  const rot = p.rotation % 360;
  const swap = rot === 90 || rot === 270;
  const w = swap ? img.naturalHeight : img.naturalWidth;
  const h = swap ? img.naturalWidth  : img.naturalHeight;
  const max = 1800, sc = Math.min(1, max / Math.max(w, h));
  source.width  = overlay.width  = Math.round(w * sc);
  source.height = overlay.height = Math.round(h * sc);
  sctx.save();
  sctx.clearRect(0, 0, source.width, source.height);
  sctx.translate(source.width / 2, source.height / 2);
  sctx.rotate(rot * Math.PI / 180);
  sctx.scale(p.flipH ? -1 : 1, p.flipV ? -1 : 1);
  const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
  sctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  sctx.restore();
  $('empty').style.display = 'none';
  $('canvasWrap').style.display = 'block';
  if (!p.corners) p.corners = initialCorners();
  if (!p.midpoints) p.midpoints = [];
  drawOverlay();
  fitToShell();
  processCurrent();
}

/* ---------- Zoom ---------- */
function applyZoom(){
  const w = source.width * zoom.scale;
  const h = source.height * zoom.scale;
  $('canvasWrap').style.width  = w + 'px';
  $('canvasWrap').style.height = h + 'px';
  $('canvasWrap').style.transform = `translate(${zoom.x}px, ${zoom.y}px)`;
}
function fitToShell(){
  if (current < 0) return;
  const sw = $('shell').clientWidth;
  const sh = $('shell').clientHeight;
  if (!sw || !sh) return;
  const scale = Math.min(sw / source.width, sh / source.height, 1);
  const dispW = source.width * scale;
  const dispH = source.height * scale;
  zoom.scale = scale;
  zoom.x = (sw - dispW) / 2;
  zoom.y = (sh - dispH) / 2;
  applyZoom();
}
function zoomAt(sx, sy, newScale){
  const oldScale = zoom.scale;
  const px = (sx - zoom.x) / oldScale;
  const py = (sy - zoom.y) / oldScale;
  zoom.scale = newScale;
  zoom.x = sx - px * newScale;
  zoom.y = sy - py * newScale;
  applyZoom();
}
function zoomReset(){ if (current >= 0) fitToShell(); }
function zoomFitPoints(){
  if (current < 0) return;
  const c = pages[current].corners;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of c){
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
  const sw = $('shell').clientWidth, sh = $('shell').clientHeight;
  const pad = 30;
  const scale = Math.min((sw - pad*2) / bw, (sh - pad*2) / bh);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  zoom.scale = scale;
  zoom.x = sw / 2 - cx * scale;
  zoom.y = sh / 2 - cy * scale;
  applyZoom();
}
$('shell').addEventListener('wheel', e => {
  if (current < 0) return;
  e.preventDefault();
  const r = $('shell').getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const newScale = Math.max(0.05, Math.min(30, zoom.scale * factor));
  zoomAt(sx, sy, newScale);
  hoverEdge = -1; hoverPos = null;
  drawOverlay();
}, { passive: false });

/* ---------- Output preview zoom ---------- */
function applyOutView(){
  out.style.transform = `translate(${outView.x}px, ${outView.y}px) scale(${outView.scale})`;
}
function fitOutView(){
  if (current < 0 || !out.width || !out.height) return;
  const box = $('outputBox');
  const boxW = box.clientWidth;
  const boxH = box.clientHeight;
  if (!boxW || !boxH) return;
  const cw = out.width, ch = out.height;
  outView.minScale = Math.min(boxW / cw, boxH / ch);
  outView.scale = outView.minScale;
  outView.x = (boxW - cw * outView.scale) / 2;
  outView.y = (boxH - ch * outView.scale) / 2;
  applyOutView();
}
$('outputCanvasWrap').addEventListener('wheel', e => {
  if (current < 0 || !out.width) return;
  e.preventDefault();
  const r = outWrap.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  let newScale = outView.scale * factor;
  if (newScale < outView.minScale) newScale = outView.minScale;
  if (newScale > outView.minScale * 25) newScale = outView.minScale * 25;
  const px = (mx - outView.x) / outView.scale;
  const py = (my - outView.y) / outView.scale;
  outView.scale = newScale;
  if (newScale <= outView.minScale * 1.001){
    const boxW = $('outputBox').clientWidth;
    const boxH = $('outputBox').clientHeight;
    outView.x = (boxW - out.width * outView.scale) / 2;
    outView.y = (boxH - out.height * outView.scale) / 2;
  } else {
    outView.x = mx - px * newScale;
    outView.y = my - py * newScale;
  }
  applyOutView();
}, { passive: false });

$('outputCanvasWrap').addEventListener('pointerdown', e => {
  if (current < 0 || !out.width) return;
  if (outView.scale <= outView.minScale * 1.001) return;
  if (e.button !== 0 && e.button !== 1) return;
  e.preventDefault();
  outPanState = { startX: e.clientX, startY: e.clientY, startViewX: outView.x, startViewY: outView.y };
  $('outputCanvasWrap').setPointerCapture(e.pointerId);
  $('outputBox').classList.add('panning');
});
$('outputCanvasWrap').addEventListener('pointermove', e => {
  if (!outPanState) return;
  outView.x = outPanState.startViewX + (e.clientX - outPanState.startX);
  outView.y = outPanState.startViewY + (e.clientY - outPanState.startY);
  applyOutView();
});
$('outputCanvasWrap').addEventListener('pointerup', () => {
  if (outPanState){ outPanState = null; $('outputBox').classList.remove('panning'); }
});
$('outputCanvasWrap').addEventListener('pointercancel', () => {
  outPanState = null; $('outputBox').classList.remove('panning');
});
$('outputCanvasWrap').addEventListener('dblclick', () => { fitOutView(); });

window.addEventListener('resize', () => {
  fitToShell();
  if (current >= 0) fitOutView();
});

/* ---------- Coons Patch ---------- */
function midpointWorldPos(page, mp){
  const c = page.corners;
  const start = c[mp.edge];
  const end   = c[(mp.edge + 1) % 4];
  const dx = end.x - start.x, dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  return { x: start.x + dx * mp.t + nx * mp.n, y: start.y + dy * mp.t + ny * mp.n };
}
function worldPosToLocal(page, edge, x, y){
  const c = page.corners;
  const start = c[edge];
  const end   = c[(edge + 1) % 4];
  const dx = end.x - start.x, dy = end.y - start.y;
  const len2 = dx * dx + dy * dy || 1;
  const len  = Math.sqrt(len2);
  const nx = -dy / len, ny = dx / len;
  const relX = x - start.x, relY = y - start.y;
  return { t: (relX * dx + relY * dy) / len2, n: relX * nx + relY * ny };
}
function edgesOf(page){
  const c = page.corners;
  const edges = [];
  for (let e = 0; e < 4; e++){
    const start = c[e];
    const end   = c[(e + 1) % 4];
    const mids = page.midpoints
      .filter(m => m.edge === e)
      .map(m => { const w = midpointWorldPos(page, m); return { x: w.x, y: w.y, t: m.t }; })
      .sort((a, b) => a.t - b.t);
    edges.push([
      { x: start.x, y: start.y, t: 0 },
      ...mids,
      { x: end.x,   y: end.y,   t: 1 }
    ]);
  }
  return edges;
}
function sampleEdge(pts, t){
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < pts.length - 1; i++){
    const t0 = pts[i].t, t1 = pts[i + 1].t;
    if (t >= t0 && t <= t1){
      const range = t1 - t0;
      const lt = range > 1e-9 ? (t - t0) / range : 0;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * lt,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * lt
      };
    }
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y };
}
function sampleFast(sampled, t){
  const n = sampled.length - 1;
  const scaled = Math.max(0, Math.min(1, t)) * n;
  let i = Math.floor(scaled);
  if (i >= n) i = n - 1;
  const lt = scaled - i;
  return {
    x: sampled[i].x + (sampled[i + 1].x - sampled[i].x) * lt,
    y: sampled[i].y + (sampled[i + 1].y - sampled[i].y) * lt
  };
}
function coonsPoint(sampled, u, v, corners){
  const top    = sampleFast(sampled[0], u);
  const right  = sampleFast(sampled[1], v);
  const bottom = sampleFast(sampled[2], 1 - u);
  const left   = sampleFast(sampled[3], 1 - v);
  const P00 = corners[0], P10 = corners[1], P11 = corners[2], P01 = corners[3];
  const a = (1 - v) * top.x + v * bottom.x + (1 - u) * left.x + u * right.x;
  const b = (1 - u) * (1 - v) * P00.x + u * (1 - v) * P10.x + u * v * P11.x + (1 - u) * v * P01.x;
  const c = (1 - v) * top.y + v * bottom.y + (1 - u) * left.y + u * right.y;
  const d = (1 - u) * (1 - v) * P00.y + u * (1 - v) * P10.y + u * v * P11.y + (1 - u) * v * P01.y;
  return { x: a - b, y: c - d };
}

/* ---------- Overlay ---------- */
function drawOverlay(){
  if (current < 0) return;
  const page = pages[current];
  const edges = edgesOf(page);
  const c = page.corners;
  octx.clearRect(0, 0, overlay.width, overlay.height);

  // ---------- خط کادر: ضخیم + خط‌چین + پررنگ ----------
  const lineW = Math.max(3, overlay.width / 320);
  octx.lineWidth = lineW;
  octx.setLineDash([lineW * 3.5, lineW * 2.2]);
  octx.lineDashOffset = 0;
  octx.strokeStyle = 'rgba(79,70,229,1)';
  octx.fillStyle = 'rgba(79,70,229,.14)';
  const steps = 60;
  octx.beginPath();
  let first = true;
  for (let e = 0; e < 4; e++){
    const startI = e === 0 ? 0 : 1;
    for (let i = startI; i <= steps; i++){
      const p = sampleEdge(edges[e], i / steps);
      if (first){ octx.moveTo(p.x, p.y); first = false; }
      else octx.lineTo(p.x, p.y);
    }
  }
  octx.closePath();
  octx.fill();
  octx.stroke();
  octx.setLineDash([]);
/* ---------- دستگیره‌های وسط لبه ---------- */
const rEdge = edgeHandleRadius();
for (let e = 0; e < 4; e++){
  if (!isEdgeHandleVisible(page, e)) continue;
  const h = edgeHandlePos(page, e);
  const active = drag && drag.type === 'edge' && drag.index === e;
  const c0 = page.corners[e];
  const c1 = page.corners[(e + 1) % 4];
  const angle = Math.atan2(c1.y - c0.y, c1.x - c0.x);

  octx.save();
  octx.translate(h.x, h.y);
  octx.rotate(angle);

  const pillW = rEdge * 2.8;
  const pillH = rEdge * 1.7;
  const rr = pillH / 2;
  octx.beginPath();
  octx.moveTo(-pillW/2 + rr, -pillH/2);
  octx.lineTo( pillW/2 - rr, -pillH/2);
  octx.arcTo( pillW/2, -pillH/2,  pillW/2, -pillH/2 + rr, rr);
  octx.lineTo( pillW/2,  pillH/2 - rr);
  octx.arcTo( pillW/2,  pillH/2,  pillW/2 - rr,  pillH/2, rr);
  octx.lineTo(-pillW/2 + rr,  pillH/2);
  octx.arcTo(-pillW/2,  pillH/2, -pillW/2,  pillH/2 - rr, rr);
  octx.lineTo(-pillW/2, -pillH/2 + rr);
  octx.arcTo(-pillW/2, -pillH/2, -pillW/2 + rr, -pillH/2, rr);
  octx.closePath();

  octx.fillStyle = active ? '#7c3aed' : '#4f46e5';
  octx.fill();
  octx.strokeStyle = 'rgba(255,255,255,.95)';
  octx.lineWidth = Math.max(1.6, rEdge / 6);
  octx.stroke();

  // ۳ خط راهنمای عمودی
  octx.strokeStyle = 'rgba(255,255,255,.95)';
  octx.lineWidth = Math.max(1.4, rEdge / 7);
  octx.lineCap = 'round';
  const gap = rEdge * 0.42;
  octx.beginPath();
  octx.moveTo(-gap, -rEdge * 0.35); octx.lineTo(-gap, rEdge * 0.35);
  octx.moveTo(   0, -rEdge * 0.45); octx.lineTo(   0, rEdge * 0.45);
  octx.moveTo( gap, -rEdge * 0.35); octx.lineTo( gap, rEdge * 0.35);
  octx.stroke();

  octx.restore();
}
  // ---------- نقاط میانی: دقیقاً روی موقعیت واقعی، بدون clamp ----------
  const rMid = Math.max(11, overlay.width / 75);
  page.midpoints.forEach((mp, i) => {
    const w = midpointWorldPos(page, mp);
    const active = drag && drag.type === 'midpoint' && drag.index === i;
    octx.beginPath();
    octx.arc(w.x, w.y, rMid, 0, Math.PI * 2);
    octx.fillStyle = active ? '#7c3aed' : '#f59e0b';
    octx.fill();
    octx.strokeStyle = '#b45309';
    octx.lineWidth = Math.max(2.5, overlay.width / 400);
    octx.stroke();
    octx.beginPath();
    octx.arc(w.x, w.y, rMid * .35, 0, Math.PI * 2);
    octx.fillStyle = '#fff';
    octx.fill();
  });

  // ---------- نقاط گوشه: دقیقاً روی موقعیت واقعی، بدون clamp ----------
  const rC = Math.max(12, overlay.width / 65);
  c.forEach((p, i) => {
    const active = drag && drag.type === 'corner' && drag.index === i;
    octx.beginPath();
    octx.arc(p.x, p.y, rC, 0, Math.PI * 2);
    octx.fillStyle = active ? '#7c3aed' : '#fff';
    octx.fill();
    octx.strokeStyle = '#4f46e5';
    octx.lineWidth = Math.max(3, overlay.width / 380);
    octx.stroke();
    octx.fillStyle = active ? '#fff' : '#4f46e5';
    octx.font = `bold ${Math.max(12, overlay.width / 78)}px Tahoma, sans-serif`;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(String(i + 1), p.x, p.y);
  });

  // ---------- پیش‌نمایش نقطه hover روی لبه ----------
  if (hoverEdge >= 0 && hoverPos && !drag && !panState){
    octx.beginPath();
    octx.arc(hoverPos.x, hoverPos.y, Math.max(13, overlay.width / 65), 0, Math.PI * 2);
    octx.fillStyle = 'rgba(16,185,129,.92)';
    octx.fill();
    octx.strokeStyle = '#047857';
    octx.lineWidth = Math.max(2.5, overlay.width / 400);
    octx.stroke();
    octx.strokeStyle = '#fff';
    octx.lineWidth = Math.max(3, overlay.width / 350);
    const r = Math.max(6, overlay.width / 130);
    octx.beginPath();
    octx.moveTo(hoverPos.x - r, hoverPos.y);
    octx.lineTo(hoverPos.x + r, hoverPos.y);
    octx.moveTo(hoverPos.x, hoverPos.y - r);
    octx.lineTo(hoverPos.x, hoverPos.y + r);
    octx.stroke();
  }
}

/* ---------- Pointer ---------- */
function pointerPos(e){
  const r = overlay.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * overlay.width  / r.width,
    y: (e.clientY - r.top ) * overlay.height / r.height
  };
}

function findControlAt(page, x, y){
  let best = null, minD = Infinity;
  const cpR = Math.max(30, overlay.width / 18);
  const consider = (type, index, d) => {
    if (d < minD && d < cpR){ minD = d; best = { type, index }; }
  };
  page.corners.forEach((c, i) => consider('corner', i, Math.hypot(c.x - x, c.y - y)));
  page.midpoints.forEach((mp, i) => {
    const w = midpointWorldPos(page, mp);
    consider('midpoint', i, Math.hypot(w.x - x, w.y - y));
  });
  for (let e = 0; e < 4; e++){
    if (!isEdgeHandleVisible(page, e)) continue;
    const h = edgeHandlePos(page, e);
    consider('edge', e, Math.hypot(h.x - x, h.y - y));
  }
  return best;
}

function nearestEdgePoint(page, x, y){
  const edges = edgesOf(page);
  let best = { dist: Infinity, edge: -1, point: null };
  const N = 70;
  for (let e = 0; e < 4; e++){
    for (let i = 0; i <= N; i++){
      const p = sampleEdge(edges[e], i / N);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best.dist) best = { dist: d, edge: e, point: p };
    }
  }
  return best;
}

/* ---------- دستگیره‌ی وسط لبه ---------- */
function edgeHandlePos(page, edgeIndex){
  const edges = edgesOf(page);
  const pts = edges[edgeIndex];
  let total = 0;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++){
    const len = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
    segs.push(len);
    total += len;
  }
  if (total < 1){
    return { x: (pts[0].x + pts[pts.length-1].x) / 2,
             y: (pts[0].y + pts[pts.length-1].y) / 2 };
  }
  let target = total / 2, acc = 0;
  for (let i = 0; i < segs.length; i++){
    if (acc + segs[i] >= target){
      const f = segs[i] > 0 ? (target - acc) / segs[i] : 0;
      return {
        x: pts[i].x + (pts[i+1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i+1].y - pts[i].y) * f
      };
    }
    acc += segs[i];
  }
  return { x: pts[pts.length-1].x, y: pts[pts.length-1].y };
}
function edgeHandleRadius(){ return Math.max(9, overlay.width / 95); }
function isEdgeHandleVisible(page, edgeIndex){
  const h = edgeHandlePos(page, edgeIndex);
  const rHide = edgeHandleRadius() * 2.4;
  for (const mp of page.midpoints){
    const w = midpointWorldPos(page, mp);
    if (Math.hypot(w.x - h.x, w.y - h.y) < rHide) return false;
  }
  return true;
}

overlay.addEventListener('pointerdown', e => {
  if (current < 0 || busy) return;
  if (e.button === 1 || e.shiftKey){
    e.preventDefault();
    panState = { startX: e.clientX, startY: e.clientY, startZoomX: zoom.x, startZoomY: zoom.y };
    overlay.setPointerCapture(e.pointerId);
    overlay.style.cursor = 'grabbing';
    return;
  }
  if (e.button !== 0) return;
  overlay.setPointerCapture(e.pointerId);
  const p = pointerPos(e);
  const page = pages[current];
  const ctrl = findControlAt(page, p.x, p.y);
if (ctrl){
  drag = ctrl;
  if (ctrl.type === 'edge'){
    const page = pages[current];
    const c = page.corners;
    const idx = ctrl.index;
    const P0 = c[idx], P1 = c[(idx + 1) % 4];
    const dx = P1.x - P0.x, dy = P1.y - P0.y;
    const len = Math.hypot(dx, dy) || 1;
    drag.nx = -dy / len;
    drag.ny =  dx / len;
    drag.startProj = p.x * drag.nx + p.y * drag.ny;
    drag.startCorners = c.map(cc => ({ x: cc.x, y: cc.y }));
  }
  drawOverlay();
  return;
}
  if (hoverEdge >= 0 && hoverPos){
    const loc = worldPosToLocal(page, hoverEdge, hoverPos.x, hoverPos.y);
    loc.t = Math.max(0.04, Math.min(0.96, loc.t));
    const tooClose = page.midpoints.some(m => m.edge === hoverEdge && Math.abs(m.t - loc.t) < 0.02);
    if (!tooClose){
      page.midpoints.push({ edge: hoverEdge, t: loc.t, n: loc.n });
      hoverEdge = -1; hoverPos = null;
      drawOverlay();
      processCurrent();
    }
  }
});
overlay.addEventListener('pointermove', e => {
  if (current < 0) return;
  if (panState){
    zoom.x = panState.startZoomX + (e.clientX - panState.startX);
    zoom.y = panState.startZoomY + (e.clientY - panState.startY);
    applyZoom();
    return;
  }
  const p = pointerPos(e);
  const page = pages[current];
  if (drag){
    const m = 0;
    if (drag.type === 'corner'){
      page.corners[drag.index] = {
        x: Math.max(m, Math.min(source.width - m, p.x)),
        y: Math.max(m, Math.min(source.height - m, p.y))
      };
    } else if (drag.type === 'midpoint'){
      const mp = page.midpoints[drag.index];
      const loc = worldPosToLocal(page, mp.edge, p.x, p.y);
      mp.t = loc.t; mp.n = loc.n;
    }
	else if (drag.type === 'edge'){
  const page = pages[current];
  const e0 = drag.index;
  const e1 = (drag.index + 1) % 4;
  let delta = (p.x * drag.nx + p.y * drag.ny) - drag.startProj;

  // clamp: گوشه‌ها از کادر بیرون نرن
  let dMin = -Infinity, dMax = Infinity;
  for (const ci of [e0, e1]){
    const cx = drag.startCorners[ci].x;
    const cy = drag.startCorners[ci].y;
    if (drag.nx >  1e-9){
      dMin = Math.max(dMin, -cx / drag.nx);
      dMax = Math.min(dMax, (source.width - cx) / drag.nx);
    } else if (drag.nx < -1e-9){
      dMin = Math.max(dMin, (source.width - cx) / drag.nx);
      dMax = Math.min(dMax, -cx / drag.nx);
    }
    if (drag.ny >  1e-9){
      dMin = Math.max(dMin, -cy / drag.ny);
      dMax = Math.min(dMax, (source.height - cy) / drag.ny);
    } else if (drag.ny < -1e-9){
      dMin = Math.max(dMin, (source.height - cy) / drag.ny);
      dMax = Math.min(dMax, -cy / drag.ny);
    }
  }
  delta = Math.max(dMin, Math.min(dMax, delta));

  page.corners[e0] = {
    x: drag.startCorners[e0].x + delta * drag.nx,
    y: drag.startCorners[e0].y + delta * drag.ny
  };
  page.corners[e1] = {
    x: drag.startCorners[e1].x + delta * drag.nx,
    y: drag.startCorners[e1].y + delta * drag.ny
  };
  drawOverlay();
  return;
}
    drawOverlay();
    return;
  }
const ctrl = findControlAt(page, p.x, p.y);
if (ctrl){
  hoverEdge = -1; hoverPos = null;
  overlay.style.cursor = ctrl.type === 'edge' ? 'move' : 'grab';
} else {
    const near = nearestEdgePoint(page, p.x, p.y);
    const threshold = Math.max(28, overlay.width / 22);
    if (near.dist < threshold && near.edge >= 0){
      hoverEdge = near.edge; hoverPos = near.point;
      overlay.style.cursor = 'copy';
    } else {
      hoverEdge = -1; hoverPos = null;
      overlay.style.cursor = 'default';
    }
  }
  drawOverlay();
});
overlay.addEventListener('pointerup', () => {
  if (panState){ panState = null; overlay.style.cursor = 'default'; return; }
  if (drag){ drag = null; drawOverlay(); processCurrent(); }
});
overlay.addEventListener('pointercancel', () => {
  panState = null; drag = null;
  overlay.style.cursor = 'default';
  drawOverlay();
});
overlay.addEventListener('pointerleave', () => {
  if (drag || panState) return;
  hoverEdge = -1; hoverPos = null;
  overlay.style.cursor = 'default';
  drawOverlay();
});
overlay.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (current < 0 || busy) return;
  const p = pointerPos(e);
  const page = pages[current];
  const r = Math.max(24, overlay.width / 22);
  for (let i = 0; i < page.midpoints.length; i++){
    const w = midpointWorldPos(page, page.midpoints[i]);
    if (Math.hypot(w.x - p.x, w.y - p.y) < r){
      page.midpoints.splice(i, 1);
      drawOverlay();
      processCurrent();
      return;
    }
  }
});


/* ---------- محاسبه ابعاد canvas بر اساس چرخش/آینه ---------- */
function getSourceDimsFor(page){
  const img = page.img;
  const rot = page.rotation % 360;
  const swap = rot === 90 || rot === 270;
  const w = swap ? img.naturalHeight : img.naturalWidth;
  const h = swap ? img.naturalWidth  : img.naturalHeight;
  const max = 1800, sc = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * sc), h: Math.round(h * sc) };
}

/* ---------- تبدیل مختصات از canvas قدیم به canvas جدید ----------
   گوشه‌ها و نقاط میانی رو جوری جابجا می‌کنه که روی همون پیکسل از تصویر بمونن */
/* ---------- مقیاس‌دهی نقاط متناسب با ابعاد جدید canvas ---------- */
/* ---------- تبدیل مختصات نقاط با چرخش/آینه ----------
   نقاط رو جوری جابجا می‌کنه که روی همون پیکسل تصویر بمونن */
function applyTransformToPoints(p, oldW, oldH, newW, newH,
                                oldRot, newRot, oldFH, newFH, oldFV, newFV){
  if (!p.corners) return;
  const oldCorners = p.corners.map(c => ({ x: c.x, y: c.y }));

  const cx_o = oldW / 2, cy_o = oldH / 2;
  const cx_n = newW / 2, cy_n = newH / 2;
  const th_o = oldRot * Math.PI / 180;
  const th_n = newRot * Math.PI / 180;
  const cos_o = Math.cos(th_o), sin_o = Math.sin(th_o);
  const cos_n = Math.cos(th_n), sin_n = Math.sin(th_n);

  function tf(px, py){
    const a = px - cx_o, b = py - cy_o;
    const c =  cos_o * a + sin_o * b;
    const d = -sin_o * a + cos_o * b;
    const ix = oldFH ? -c : c;
    const iy = oldFV ? -d : d;
    const a2 = newFH ? -ix : ix;
    const b2 = newFV ? -iy : iy;
    const c2 = cos_n * a2 - sin_n * b2;
    const d2 = sin_n * a2 + cos_n * b2;
    return { x: cx_n + c2, y: cy_n + d2 };
  }

  p.corners = oldCorners.map(c => tf(c.x, c.y));

  if (p.midpoints && p.midpoints.length){
    p.midpoints = p.midpoints.map(mp => {
      const start_o = oldCorners[mp.edge];
      const end_o   = oldCorners[(mp.edge + 1) % 4];
      const dx_o = end_o.x - start_o.x, dy_o = end_o.y - start_o.y;
      const len_o = Math.hypot(dx_o, dy_o) || 1;
      const nx_o = -dy_o / len_o, ny_o = dx_o / len_o;
      const wx = start_o.x + dx_o * mp.t + nx_o * mp.n;
      const wy = start_o.y + dy_o * mp.t + ny_o * mp.n;

      const np = tf(wx, wy);

      const start_n = p.corners[mp.edge];
      const end_n   = p.corners[(mp.edge + 1) % 4];
      const dx_n = end_n.x - start_n.x, dy_n = end_n.y - start_n.y;
      const len2 = dx_n * dx_n + dy_n * dy_n || 1;
      const len_n = Math.sqrt(len2);
      const nx_n = -dy_n / len_n, ny_n = dx_n / len_n;
      const relX = np.x - start_n.x, relY = np.y - start_n.y;
      const t_new = (relX * dx_n + relY * dy_n) / len2;
      const n_new = relX * nx_n + relY * ny_n;
      return { edge: mp.edge, t: t_new, n: n_new };
    });
  }
}


/* ---------- Rotate / Flip / Reset ---------- */
function rotateLeft(){
  if (current < 0 || busy) return;
  const p = pages[current];
  const oldW = source.width, oldH = source.height;
  const oldRot = p.rotation, oldFH = p.flipH, oldFV = p.flipV;
  p.rotation = (p.rotation - 90 + 360) % 360;
  const nd = getSourceDimsFor(p);
  applyTransformToPoints(p, oldW, oldH, nd.w, nd.h,
                         oldRot, p.rotation, oldFH, p.flipH, oldFV, p.flipV);
  drawSource(); renderPages();
}
function rotateRight(){
  if (current < 0 || busy) return;
  const p = pages[current];
  const oldW = source.width, oldH = source.height;
  const oldRot = p.rotation, oldFH = p.flipH, oldFV = p.flipV;
  p.rotation = (p.rotation + 90) % 360;
  const nd = getSourceDimsFor(p);
  applyTransformToPoints(p, oldW, oldH, nd.w, nd.h,
                         oldRot, p.rotation, oldFH, p.flipH, oldFV, p.flipV);
  drawSource(); renderPages();
}
function flipH(){
  if (current < 0 || busy) return;
  const p = pages[current];
  const oldW = source.width, oldH = source.height;
  const oldRot = p.rotation, oldFH = p.flipH, oldFV = p.flipV;
  p.flipH = !p.flipH;
  const nd = getSourceDimsFor(p);
  applyTransformToPoints(p, oldW, oldH, nd.w, nd.h,
                         oldRot, p.rotation, oldFH, p.flipH, oldFV, p.flipV);
  drawSource(); renderPages();
}
function flipV(){
  if (current < 0 || busy) return;
  const p = pages[current];
  const oldW = source.width, oldH = source.height;
  const oldRot = p.rotation, oldFH = p.flipH, oldFV = p.flipV;
  p.flipV = !p.flipV;
  const nd = getSourceDimsFor(p);
  applyTransformToPoints(p, oldW, oldH, nd.w, nd.h,
                         oldRot, p.rotation, oldFH, p.flipH, oldFV, p.flipV);
  drawSource(); renderPages();
}

function resetCorners(){
  if (current < 0) return;
  const p = pages[current];
  p.corners = initialCorners();
  p.midpoints = [];
  drawOverlay();
  processCurrent();
}

/* ---------- Enhancement ---------- */
function percentile(hist, total, p){
  const goal = total * p;
  let sum = 0;
  for (let i = 0; i < 256; i++){ sum += hist[i]; if (sum >= goal) return i; }
  return 255;
}
function autoLevels(img, gamma){
  const d = img.data, hist = new Uint32Array(256);
  let samples = 0, br = 0, bg = 0, bb = 0, bright = 0;
  for (let i = 0; i < d.length; i += 8){
    const y = Math.max(0, Math.min(255, Math.round(.299 * d[i] + .587 * d[i+1] + .114 * d[i+2])));
    hist[y]++; samples++;
    if (y > 155){ br += d[i]; bg += d[i+1]; bb += d[i+2]; bright++; }
  }
  let lo = percentile(hist, samples, .012), hi = percentile(hist, samples, .992);
  if (hi - lo < 70){ lo = Math.max(0, lo - 25); hi = Math.min(255, hi + 25); }
  const span = Math.max(60, hi - lo);
  const avg = bright ? ((br + bg + bb) / (3 * bright)) : 1;
  const gains = bright ? [
    Math.max(.9, Math.min(1.1, avg / (br / bright || avg))),
    Math.max(.9, Math.min(1.1, avg / (bg / bright || avg))),
    Math.max(.9, Math.min(1.1, avg / (bb / bright || avg)))
  ] : [1, 1, 1];
  for (let i = 0; i < d.length; i += 4){
    for (let k = 0; k < 3; k++){
      let v = d[i + k] * gains[k];
      let n = Math.max(0, Math.min(1, (v - lo) / span));
      n = Math.pow(n, gamma);
      v = n * 255;
      if (v > 215) v += Math.min(12, (v - 215) * .18);
      d[i + k] = Math.max(0, Math.min(255, v));
    }
  }
}
function sharpen(img, w, h, amount){
  if (amount <= 0 || w < 3 || h < 3) return;
  const d = img.data, src = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++){
    const row = y * w;
    for (let x = 1; x < w - 1; x++){
      const p = (row + x) * 4, l = p - 4, r = p + 4, u = p - w * 4, b = p + w * 4;
      for (let k = 0; k < 3; k++){
        const v = src[p + k] * (1 + 4 * amount)
                - amount * (src[l + k] + src[r + k] + src[u + k] + src[b + k]);
        d[p + k] = Math.max(0, Math.min(255, v));
      }
    }
  }
}
function whitenPaper(img, amount){
  if (amount <= 0.005) return;
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4){
    const y = Math.max(0, Math.min(255, Math.round(.299 * d[i] + .587 * d[i+1] + .114 * d[i+2])));
    hist[y]++;
  }
  const total = d.length / 4;
  const p = 0.99 - amount * 0.64;
  let sum = 0, whitePoint = 255;
  for (let i = 0; i < 256; i++){
    sum += hist[i];
    if (sum >= total * p){ whitePoint = i; break; }
  }
  whitePoint = Math.max(60, whitePoint);
  const scale = 255 / whitePoint;
  for (let i = 0; i < d.length; i += 4){
    let r = d[i] * scale, g = d[i+1] * scale, b = d[i+2] * scale;
    d[i]   = r > 255 ? 255 : r;
    d[i+1] = g > 255 ? 255 : g;
    d[i+2] = b > 255 ? 255 : b;
  }
}
function invertColors(img){
  const d = img.data;
  for (let i = 0; i < d.length; i += 4){
    d[i]   = 255 - d[i];
    d[i+1] = 255 - d[i+1];
    d[i+2] = 255 - d[i+2];
  }
}
function applyEffects(img, mode, w, h){
  const d = img.data;
  if (mode === 'none'){
    if ($('invertToggle').checked) invertColors(img);
    return;
  }
  const enhInt    = FIXED_ENH;
  const grayInt   = FIXED_GRAY;
  const whitenInt = FIXED_WHITEN;

  const gmix = grayInt;
  if (gmix > 0){
    for (let i = 0; i < d.length; i += 4){
      const y = .299 * d[i] + .587 * d[i+1] + .114 * d[i+2];
      if (gmix >= 1){ d[i] = d[i+1] = d[i+2] = y; }
      else {
        d[i]   = d[i]   * (1 - gmix) + y * gmix;
        d[i+1] = d[i+1] * (1 - gmix) + y * gmix;
        d[i+2] = d[i+2] * (1 - gmix) + y * gmix;
      }
    }
  }
  if (enhInt > 0.001){
    autoLevels(img, 1 - 0.14 * enhInt);
    sharpen(img, w, h, 0.11 * enhInt);
  }
  if (whitenInt > 0.001){
    whitenPaper(img, whitenInt);
  }
  if ($('invertToggle').checked){
    invertColors(img);
  }
}

/* ---------- چرخش و آینه کردن خودِ خروجی ---------- */
function applyRotationFlipToCanvas(cv, rotation, flipH, flipV){
  const rot = ((rotation % 360) + 360) % 360;
  if (rot === 0 && !flipH && !flipV) return cv;

  const swap = rot === 90 || rot === 270;
  const out = document.createElement('canvas');
  out.width  = swap ? cv.height : cv.width;
  out.height = swap ? cv.width  : cv.height;
  const ctx = out.getContext('2d');
  ctx.save();
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rot * Math.PI / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(cv, -cv.width / 2, -cv.height / 2);
  ctx.restore();
  return out;
}

/* ---------- Process ---------- */
function processedCanvas(){
  if (current < 0) throw new Error('صفحه‌ای انتخاب نشده است.');
  const page = pages[current];
  const c = page.corners;
  const top    = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y);
  const bot    = Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y);
  const left   = Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y);
  const right  = Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y);
  let w = Math.max(64, Math.round((top + bot) / 2));
  let h = Math.max(64, Math.round((left + right) / 2));
  const HARD_CAP = 12000;
  const sc = Math.min(1, HARD_CAP / Math.max(w, h));
  w = Math.max(32, Math.round(w * sc));
  h = Math.max(32, Math.round(h * sc));

  const edgesRaw = edgesOf(page);
  const edgesSampled = edgesRaw.map(edge => {
    const arr = new Array(EDGE_SAMPLES + 1);
    for (let i = 0; i <= EDGE_SAMPLES; i++) arr[i] = sampleEdge(edge, i / EDGE_SAMPLES);
    return arr;
  });

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const src = sctx.getImageData(0, 0, source.width, source.height);
  const dst = cx.createImageData(w, h);
  const sd = src.data, dd = dst.data, sw = source.width, sh = source.height;

  for (let Y = 0; Y < h; Y++){
    const v = h > 1 ? Y / (h - 1) : 0;
    for (let X = 0; X < w; X++){
      const u = w > 1 ? X / (w - 1) : 0;
      const s = coonsPoint(edgesSampled, u, v, c);
      const di = (Y * w + X) * 4;
      bilinear(sd, sw, sh, s.x, s.y, dd, di);
    }
  }
  applyEffects(dst, getMode(), w, h);
  cx.putImageData(dst, 0, 0);
  // ✨ خروجی رو با همون چرخش/آینه عکس بچرخون
  return applyRotationFlipToCanvas(cv, page.rotation, page.flipH, page.flipV);
}

function bilinear(sd, sw, sh, sx, sy, dd, di){
  sx = Math.max(0, Math.min(sw - 1, sx));
  sy = Math.max(0, Math.min(sh - 1, sy));
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
  const fx = sx - x0, fy = sy - y0;
  const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
  const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy,       w11 = fx * fy;
  for (let k = 0; k < 3; k++)
    dd[di + k] = sd[i00 + k] * w00 + sd[i10 + k] * w10 + sd[i01 + k] * w01 + sd[i11 + k] * w11;
  dd[di + 3] = 255;
}
// پردازش سنگین رو با تأخیر کوتاه انجام می‌ده تا چرخش/آینه آنی دیده بشن
let _processTimer = null;
function processCurrent(){
  if (_processTimer) clearTimeout(_processTimer);
  _processTimer = setTimeout(() => {
    _processTimer = null;
    _processCurrentNow();
  }, 50);
}

function _processCurrentNow(){
  if (current < 0) return;
  try{
    const cv = processedCanvas();
    out.width = cv.width;
    out.height = cv.height;
    outctx.clearRect(0, 0, out.width, out.height);
    outctx.drawImage(cv, 0, 0);
    $('outputBox').classList.add('has-output');

    const key = out.width + 'x' + out.height + '@' + current;
    if (key !== prevOutKey){
      prevOutKey = key;
      requestAnimationFrame(fitOutView);
    }
  } catch (e){ console.error(e); }
}


/* ---------- Downloads ---------- */
function getQuality(){ return FIXED_QUALITY; }
function blobFromCanvas(cv, type, quality){ return new Promise(res => cv.toBlob(res, type, quality)); }
function downloadBlob(blob, name){
  const a = document.createElement('a');
  const u = URL.createObjectURL(blob);
  a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1800);
}


/* ---------- ذخیره‌ی مستقیم بدون دیالوگ ---------- */
function blobToDataURL(blob){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

async function saveBlobDirect(blob, filename){
  // ── مسیر ۱: chrome.downloads.download مستقیم از این صفحه
  //           (بدون دیالوگ، بدون محدودیت حجم dataURL)
  try {
    if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
      const url = URL.createObjectURL(blob);
      const ok = await new Promise((resolve) => {
        try {
          chrome.downloads.download(
            { url, filename, saveAs: false, conflictAction: 'uniquify' },
            (id) => {
              if (chrome.runtime.lastError || !id) {
                console.warn('[RPH-Editor] direct chrome.downloads failed:',
                  chrome.runtime.lastError && chrome.runtime.lastError.message);
                URL.revokeObjectURL(url);
                resolve(false);
              } else {
                // وقتی دانلود کامل/لغو شد، blob URL را آزاد کن
                const onChange = (delta) => {
                  if (delta.id === id &&
                      (delta.state?.current === 'complete' || delta.state?.current === 'interrupted')) {
                    URL.revokeObjectURL(url);
                    try { chrome.downloads.onChanged.removeListener(onChange); } catch(_){}
                  }
                };
                try { chrome.downloads.onChanged.addListener(onChange); } catch(_){}
                setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
                resolve(true);
              }
            }
          );
        } catch (e) {
          URL.revokeObjectURL(url);
          console.warn('[RPH-Editor] chrome.downloads threw:', e);
          resolve(false);
        }
      });
      if (ok) return true;
    }
  } catch(e) { console.warn('[RPH-Editor] direct path error:', e); }

  // ── مسیر ۲: sendMessage → background (همان مکانیزم content.js)
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const dataUrl = await blobToDataURL(blob);
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'rph-download', dataUrl, filename },
          (r) => {
            if (chrome.runtime.lastError)
              resolve({ success: false, error: chrome.runtime.lastError.message });
            else
              resolve(r || { success: false, error: 'no response' });
          }
        );
      });
      if (resp && resp.success) return true;
      console.warn('[RPH-Editor] background download failed:', resp && resp.error);
    }
  } catch(e) { console.warn('[RPH-Editor] sendMessage threw:', e); }

  // ── مسیر ۳: fallback قدیمی (a.click) برای وقتی افزونه در دسترس نیست
  downloadBlob(blob, filename);
  return false;
}

async function downloadImage(ext){
  if (current < 0 || busy) return;
  try{
    const cv = processedCanvas();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await blobFromCanvas(cv, mime, ext === 'png' ? undefined : getQuality());
    if (!blob) throw new Error('toBlob failed');
    await saveBlobDirect(blob, `scan-${current + 1}.${ext}`);
  } catch (e){ console.error(e); }
}

async function downloadAllJpg(){
  if (busy || !pages.length) return;
  try{
    busy = true; refreshControls();
    const old = current;
    for (let i = 0; i < pages.length; i++){
      current = i;
      drawSource();
      await nextPaint();
      const cv = processedCanvas();
      const blob = await blobFromCanvas(cv, 'image/jpeg', getQuality());
      if (blob) {
        await saveBlobDirect(blob, `scan-${String(i + 1).padStart(2, '0')}.jpg`);
      }
      // مکث کوتاه تا مرورگر درخواست‌ها را throttle نکند
      await new Promise(r => setTimeout(r, 200));
    }
    current = old >= 0 ? Math.min(old, pages.length - 1) : 0;
    drawSource();
    renderPages();
  } catch (e){ console.error(e); }
  finally{ busy = false; refreshControls(); }
}


/* ---------- PDF ---------- */
function bytes(s){ return new TextEncoder().encode(s); }
function joinBytes(parts){
  const n = parts.reduce((a, b) => a + b.length, 0);
  const o = new Uint8Array(n);
  let p = 0;
  for (const x of parts){ o.set(x, p); p += x.length; }
  return o;
}
async function buildPdfBlob(){
  if (!pages.length) throw new Error('صفحه‌ای وجود ندارد.');
  const old = current, imgs = [];
  for (let i = 0; i < pages.length; i++){
    current = i;
    drawSource();
    await nextPaint();
    const cv = processedCanvas();
    const blob = await blobFromCanvas(cv, 'image/jpeg', getQuality());
    const buf = new Uint8Array(await blob.arrayBuffer());
    imgs.push({ buf, w: cv.width, h: cv.height });
  }
  current = old >= 0 ? Math.min(old, pages.length - 1) : 0;
  drawSource();
  renderPages();
  const { W: PW, H: PH } = getPaperSize();
  const count = imgs.length, objCount = 2 + count * 3;
  const parts = [], offsets = Array(objCount + 1).fill(0);
  let pos = 0;
  const add = x => { parts.push(x); pos += x.length; };
  const addObj = (n, chunks) => {
    offsets[n] = pos;
    add(bytes(`${n} 0 obj\n`));
    chunks.forEach(add);
    add(bytes(`\nendobj\n`));
  };
  add(bytes('%PDF-1.4\n'));
  addObj(1, [bytes('<< /Type /Catalog /Pages 2 0 R >>')]);
  const kids = imgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  addObj(2, [bytes(`<< /Type /Pages /Count ${count} /Kids [${kids}] >>`)]);
  imgs.forEach((im, i) => {
    const page = 3 + i * 3, image = page + 1, content = page + 2;
    const margin = 22;
    const scale = Math.min((PW - 2 * margin) / im.w, (PH - 2 * margin) / im.h);
    const dw = im.w * scale, dh = im.h * scale;
    const x = (PW - dw) / 2, y = (PH - dh) / 2;
    const stream = `q\n${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im${i+1} Do\nQ\n`;
    const sb = bytes(stream);
    addObj(page, [bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}] /Resources << /XObject << /Im${i+1} ${image} 0 R >> >> /Contents ${content} 0 R >>`)]);
    addObj(image, [bytes(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.buf.length} >>\nstream\n`), im.buf, bytes('\nendstream')]);
    addObj(content, [bytes(`<< /Length ${sb.length} >>\nstream\n`), sb, bytes('endstream')]);
  });
  const xref = pos;
  add(bytes(`xref\n0 ${objCount + 1}\n0000000000 65535 f \n`));
  for (let i = 1; i <= objCount; i++)
    add(bytes(String(offsets[i]).padStart(10, '0') + ' 00000 n \n'));
  add(bytes(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return new Blob([joinBytes(parts)], { type: 'application/pdf' });
}
async function downloadPdf(){
  if (busy || !pages.length) return;
  try{
    busy = true; refreshControls();
    await nextPaint();
    const b = await buildPdfBlob();
    await saveBlobDirect(b, 'scan.pdf');
  } catch (e){ console.error(e); }
  finally{ busy = false; refreshControls(); }
}

/* ---------- Print ---------- */
async function printPdf(){
  if (busy || !pages.length) return;
  let url = '';
  try{
    busy = true; refreshControls();
    await nextPaint();
    const blob = await buildPdfBlob();
    url = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch(err){
        console.error('print failed', err);
        try { window.open(url, '_blank'); } catch(_){}
      }
    };

    iframe.onload = () => setTimeout(doPrint, 250);
    iframe.src = url;
    setTimeout(() => { if (!printed) doPrint(); }, 900);

    setTimeout(() => {
      try { iframe.remove(); } catch(_){}
      if (url) { try { URL.revokeObjectURL(url); } catch(_){} }
    }, 5 * 60 * 1000);
  } catch(e){
    console.error(e);
    if (url) { try { URL.revokeObjectURL(url); } catch(_){} }
  }
  finally{ busy = false; refreshControls(); }
}

/* ---------- پیام از content script ---------- */
function showEditorStatus(msg){
  const el = $('outputEmpty');
  if (el) el.textContent = msg;
}

window.addEventListener('message', async (e) => {
  const d = e.data;
  if (!d || d.type !== 'rph-editor-load') return;

  console.log('[RPH-Editor] got load message. items =', (d.items || []).length);
  const items = Array.isArray(d.items) ? d.items : [];
  if (!items.length) {
    showEditorStatus('هیچ عکسی دریافت نشد.');
    return;
  }

  showEditorStatus(`⏳ در حال بارگذاری ${items.length} عکس...`);

  pages = []; current = -1;
  renderPages();

  let okCount = 0;
  for (let i = 0; i < items.length; i++){
    const item = items[i];
    try{
      let img = null;
      if (item.blob instanceof Blob) {
        img = await loadImageFromBlob(item.blob);
      } else if (item.dataUrl) {
        img = await loadImageFromURL(item.dataUrl);
      } else if (item.url) {
        img = await loadImageFromURL(item.url);
      }
      if (!img) {
        console.warn('[RPH-Editor] no image for item', i, item);
        continue;
      }
      pages.push({
        name: item.filename || ('photo-' + (i + 1) + '.jpg'),
        img,
        rotation: 0, flipH: false, flipV: false,
        corners: null, midpoints: []
      });
      okCount++;
      console.log('[RPH-Editor] loaded', i + 1, '/', items.length);
    } catch(err){
      console.warn('[RPH-Editor] item load failed:', err, item);
    }
  }

  console.log('[RPH-Editor] loaded', okCount, 'of', items.length);

  if (!pages.length){
    showEditorStatus('هیچ عکسی لود نشد. کنسول رو چک کن.');
    return;
  }

  renderPages();
  selectPage(0);
});

/* ---------- اتصال دکمه‌ها ---------- */
function init(){
  $('rotLBtn').addEventListener('click', rotateLeft);
  $('rotRBtn').addEventListener('click', rotateRight);
  $('flipHBtn').addEventListener('click', flipH);
  $('flipVBtn').addEventListener('click', flipV);
  $('resetBtn').addEventListener('click', resetCorners);
  $('zoomResetBtn').addEventListener('click', zoomReset);
  $('zoomFitBtn').addEventListener('click', zoomFitPoints);
  $('enhanceToggle').addEventListener('change', onEnhanceToggle);
  $('paper').addEventListener('change', onPaperChange);
  $('invertToggle').addEventListener('change', onInvertChange);
  $('dlJpg').addEventListener('click', () => downloadImage('jpg'));
  $('dlAllJpg').addEventListener('click', downloadAllJpg);
  $('dlPdf').addEventListener('click', downloadPdf);
  $('printBtn').addEventListener('click', printPdf);
  $('closeBtn').addEventListener('click', closeEditor);

  $('enhanceLabel').classList.add('active');
  
  /* ---------- مخفی‌کردن راهنمای پایین وقتی موس نزدیک می‌شود ---------- */
	(function setupHintAutoHide(){
	  const shell = $('shell');
	  const hint  = document.querySelector('.hint');
	  if (!shell || !hint) return;
	  shell.addEventListener('pointermove', e => {
		const r = hint.getBoundingClientRect();
		const pad = 28;
		const near = e.clientX >= r.left - pad && e.clientX <= r.right + pad &&
					 e.clientY >= r.top  - pad && e.clientY <= r.bottom + pad;
		hint.classList.toggle('hint-hidden', near);
	  });
	  shell.addEventListener('pointerleave', () => hint.classList.remove('hint-hidden'));
	})();

  refreshControls();
}

// آماده‌بودن به parent اعلام می‌شه
(function announceReady(){
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'rph-editor-ready' }, '*');
    }
  } catch(_){}
})();

init();

})();