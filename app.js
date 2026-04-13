'use strict';
/* ═══════════════════════════════════════════════════════
   HAPTIC SHOWROOM v6 — Web Edition
   Ported from Python/OpenCV + MediaPipe to:
   Browser MediaPipe Hands + Canvas 2D
═══════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────
//  PRODUCT DATA
// ─────────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: 1,
    name: 'Apex Pro Sphere',
    brand: 'SportLab',
    category: 'Athletic Equipment',
    material: 'Carbon-Fiber Rubber Composite',
    temp: '22°C',
    weight: '120g',
    roughness: 0.15,
    elasticity: 0.9,
    haptic: 'Dynamic Bounce',
    color: [60, 160, 255],        // R,G,B
    auraColor: '#3B6FCC',
    auraRgb: [59, 111, 204],
    shape: 'sphere',
    price: 29.99,
    originalPrice: 49.99,
    discount: 40,
    rating: 4.8,
    reviews: 1247,
    prime: true,
    inStock: true,
    description: 'Engineered with aerospace-grade materials for unmatched performance. Ideal for training and professional use.',
    features: ['Anti-slip nano-grip', 'All-weather capable', 'ISO certified'],
    hapticWaveform: [0.3, 0.7, 0.9, 0.6, 0.4, 0.8, 0.5, 0.3, 0.6, 0.9, 0.4, 0.7],
  },
  {
    id: 2,
    name: 'Quantum Cube X',
    brand: 'CubeMaster',
    category: 'Precision Puzzles',
    material: 'Aviation Polycarbonate',
    temp: '20°C',
    weight: '95g',
    roughness: 0.6,
    elasticity: 0.1,
    haptic: 'Precision Click',
    color: [180, 80, 240],
    auraColor: '#9040E0',
    auraRgb: [144, 64, 224],
    shape: 'cube',
    price: 19.99,
    originalPrice: 34.99,
    discount: 43,
    rating: 4.9,
    reviews: 2843,
    prime: true,
    inStock: true,
    description: 'Magnetic-core competition cube with silicone-lubed internals. Competition-ready with smooth turning mechanism.',
    features: ['Magnetic alignment', 'Competition-legal', 'Color-matched stickers'],
    hapticWaveform: [0.9, 0.1, 0.9, 0.1, 0.8, 0.2, 0.9, 0.1, 0.8, 0.2, 0.9, 0.1],
  },
];

// ─────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────
const state = {
  currentIdx: 0,
  rx: 0, ry: 0, rz: 0,
  targetRx: 0, targetRy: 0, targetRz: 0,
  gesture: 'none',
  confidence: 0,
  squeeze: 0,
  smoothSqueeze: 0,
  grabActive: false,
  cursorX: 0, cursorY: 0,
  hoveredIdx: -1,
  gestureHold: 0,
  lastGesture: '',
  rightHand: null,
  leftHand: null,
  cameraActive: false,
  fps: 0,
  lastTime: performance.now(),
  sessionStats: PRODUCTS.map(() => ({ interactions: 0, timeViewed: 0, maxSqueeze: 0, startTime: Date.now() })),
};

// Smoothing
const smoothX = makeFilter(0.25);
const smoothY = makeFilter(0.25);
const smoothZ = makeFilter(0.25);

function makeFilter(alpha) {
  let v = 0;
  return { update(x) { v = alpha * x + (1 - alpha) * v; return v; } };
}

// Tips
const TIPS = [
  'Tip: Use both hands for full 3D rotation',
  'Tip: Pinch over a product in the sidebar to select it',
  'Tip: Squeeze both hands together to scale the object',
  'Insight: High bounce = softer haptic feedback feel',
  'Tip: Move index finger to control the cursor',
];
let tipIdx = 0;
setInterval(() => {
  tipIdx = (tipIdx + 1) % TIPS.length;
  document.getElementById('tipText').textContent = TIPS[tipIdx];
}, 5000);

// ─────────────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────────────
const videoEl        = document.getElementById('hiddenVideo');
const videoCanvas    = document.getElementById('videoCanvas');
const overlayCanvas  = document.getElementById('overlayCanvas');
const productCanvas  = document.getElementById('productCanvas');
const particleCanvas = document.getElementById('particleCanvas');
const waveformCanvas = document.getElementById('waveformCanvas');
const cursorEl       = document.getElementById('cursor');
const noCamOverlay   = document.getElementById('noCamOverlay');

const vCtx = videoCanvas.getContext('2d');
const oCtx = overlayCanvas.getContext('2d');
const pCtx = productCanvas.getContext('2d');
const partCtx = particleCanvas.getContext('2d');
const wCtx = waveformCanvas.getContext('2d');

// ─────────────────────────────────────────────────────
//  PARTICLES
// ─────────────────────────────────────────────────────
class Particle {
  constructor(w, h) { this.w = w; this.h = h; this.reset(); }
  reset() {
    this.x = Math.random() * this.w;
    this.y = Math.random() * this.h;
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = -Math.random() * 0.6 - 0.1;
    this.maxLife = Math.random() * 0.8 + 0.2;
    this.life = this.maxLife;
    this.size = Math.random() * 1.5 + 0.5;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.life -= 0.003;
    if (this.life <= 0 || this.y < -5) { this.reset(); this.y = this.h; }
  }
  draw(ctx) {
    const a = (this.life / this.maxLife) * 0.5;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#3B6FCC';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

let particles = [];
function initParticles(w, h) {
  particles = Array.from({ length: 60 }, () => new Particle(w, h));
}

function drawParticles(w, h) {
  partCtx.clearRect(0, 0, w, h);
  partCtx.save();
  for (const p of particles) { p.update(); p.draw(partCtx); }
  partCtx.globalAlpha = 1;
  partCtx.restore();
}

// ─────────────────────────────────────────────────────
//  3D MATH
// ─────────────────────────────────────────────────────
function project(pt, cx, cy, fov = 600) {
  const z = pt[2] + fov;
  return [(cx + (fov * pt[0]) / z), (cy + (fov * pt[1]) / z)];
}

function matMul(R, v) {
  return [
    R[0]*v[0] + R[1]*v[1] + R[2]*v[2],
    R[3]*v[0] + R[4]*v[1] + R[5]*v[2],
    R[6]*v[0] + R[7]*v[1] + R[8]*v[2],
  ];
}

function rotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1,0,0, 0,c,-s, 0,s,c];
}
function rotY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c,0,s, 0,1,0, -s,0,c];
}
function rotZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c,-s,0, s,c,0, 0,0,1];
}

function mulMat(A, B) {
  const C = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      C[r*3+c] = A[r*3+0]*B[0*3+c] + A[r*3+1]*B[1*3+c] + A[r*3+2]*B[2*3+c];
  return C;
}

// ─────────────────────────────────────────────────────
//  3D SPHERE
// ─────────────────────────────────────────────────────
function draw3DSphere(ctx, cx, cy, size, rx, ry, rz, color, auraIntensity) {
  const R = mulMat(rotZ(rz), mulMat(rotX(rx), rotY(ry)));
  const radius = size / 2;
  const slices = 20, stacks = 16;

  // Aura glow
  if (auraIntensity > 0.01) {
    for (let r = radius * 1.8; r > radius; r -= 5) {
      const a = auraIntensity * (1 - (r - radius) / (radius * 0.8)) * 0.15;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${a})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // Build faces
  const faces = [];
  for (let i = 0; i < slices; i++) {
    const t1 = (2 * Math.PI * i) / slices;
    const t2 = (2 * Math.PI * (i + 1)) / slices;
    for (let j = 0; j < stacks; j++) {
      const p1 = (Math.PI * j) / stacks - Math.PI / 2;
      const p2 = (Math.PI * (j + 1)) / stacks - Math.PI / 2;
      const pts = [];
      let avgZ = 0;
      for (const [theta, phi] of [[t1,p1],[t2,p1],[t2,p2],[t1,p2]]) {
        const x = radius * Math.cos(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi);
        const z = radius * Math.cos(phi) * Math.sin(theta);
        const rp = matMul(R, [x, y, z]);
        avgZ += rp[2];
        pts.push(project(rp, cx, cy));
      }
      const bright = Math.max(0.15, Math.min(1, 0.3 + 0.6 * Math.sin(p1 + Math.PI / 2)));
      faces.push({ pts, avgZ: avgZ / 4, bright });
    }
  }
  faces.sort((a, b) => a.avgZ - b.avgZ);

  for (const { pts, bright } of faces) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.closePath();
    const r = Math.round(color[0] * bright);
    const g = Math.round(color[1] * bright);
    const b = Math.round(color[2] * bright);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
  }

  // Specular highlight
  ctx.save();
  ctx.globalAlpha = 0.18;
  const hx = cx - radius * 0.3, hy = cy - radius * 0.3;
  const grd = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius * 0.4);
  grd.addColorStop(0, 'white');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(hx, hy, radius * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─────────────────────────────────────────────────────
//  3D CUBE
// ─────────────────────────────────────────────────────
function draw3DCube(ctx, cx, cy, size, rx, ry, rz, color, auraIntensity) {
  const R = mulMat(rotZ(rz), mulMat(rotX(rx), rotY(ry)));
  const s = size / 2;

  const corners8 = [
    [-s,-s,-s],[s,-s,-s],[s,s,-s],[-s,s,-s],
    [-s,-s, s],[s,-s, s],[s,s, s],[-s,s, s],
  ];
  const rotCorners = corners8.map(c => matMul(R, c));
  const pts2 = rotCorners.map(c => project(c, cx, cy));

  // Aura glow
  if (auraIntensity > 0.01) {
    for (let r = size * 1.2; r > size * 0.7; r -= 4) {
      const a = auraIntensity * (1 - (r - size * 0.7) / (size * 0.5)) * 0.12;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${a})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  const faceColors = [
    { idx: [0,1,2,3], col: [180, 80, 255] },
    { idx: [4,5,6,7], col: [ 90, 40, 140] },
    { idx: [0,1,5,4], col: [220,120, 255] },
    { idx: [2,3,7,6], col: [120, 50, 180] },
    { idx: [1,2,6,5], col: [140, 70, 200] },
    { idx: [0,3,7,4], col: [100, 55, 160] },
  ];

  const faces = faceColors.map(({ idx, col }) => {
    const avgZ = idx.reduce((sum, i) => sum + rotCorners[i][2], 0) / idx.length;
    return { idx, col, avgZ };
  });
  faces.sort((a, b) => a.avgZ - b.avgZ);

  for (const { idx, col } of faces) {
    ctx.beginPath();
    ctx.moveTo(pts2[idx[0]][0], pts2[idx[0]][1]);
    for (let k = 1; k < idx.length; k++) ctx.lineTo(pts2[idx[k]][0], pts2[idx[k]][1]);
    ctx.closePath();
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

// Ground shadow
function drawShadow(ctx, cx, cy, size, squeezeScale) {
  const ew = size * 1.4 * squeezeScale;
  const eh = ew * 0.18;
  const sy = cy + (size / 2) + 15;
  const grd = ctx.createRadialGradient(cx, sy, 0, cx, sy, ew);
  grd.addColorStop(0, 'rgba(0,0,0,0.5)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(cx, sy, ew, eh, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ─────────────────────────────────────────────────────
//  DRAW SQUEEZE BAR (on product canvas)
// ─────────────────────────────────────────────────────
function drawSqueezeBar(ctx, cx, cy, size, squeeze) {
  if (squeeze < 0.03) return;
  const barW = 120, barH = 5;
  const bx = cx - barW / 2, by = cy + size / 2 + 30;
  ctx.fillStyle = '#1a1d2c';
  ctx.beginPath();
  ctx.roundRect(bx, by, barW, barH, 3);
  ctx.fill();
  const fillW = Math.max(0, barW * squeeze);
  ctx.fillStyle = '#d4a84b';
  ctx.beginPath();
  ctx.roundRect(bx, by, fillW, barH, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,164,184,0.6)';
  ctx.font = '9px "DM Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`SQUEEZE ${Math.round(squeeze * 100)}%`, cx, by + barH + 14);
}

// ─────────────────────────────────────────────────────
//  WAVEFORM
// ─────────────────────────────────────────────────────
function drawWaveform(product, squeeze) {
  const w = waveformCanvas.width, h = waveformCanvas.height;
  wCtx.clearRect(0, 0, w, h);
  wCtx.fillStyle = 'rgba(0,0,0,0.3)';
  wCtx.fillRect(0, 0, w, h);

  const data = product.hapticWaveform;
  const n = data.length;
  const t = performance.now() / 1000;

  wCtx.beginPath();
  const pts = [];
  for (let i = 0; i < w; i++) {
    const frac = i / w;
    const idx = Math.floor(frac * n);
    const base = data[idx % n];
    const anim = Math.sin(t * 6 + i * 0.2) * 0.2 * (1 + squeeze);
    const v = base * (0.5 + 0.5 * squeeze) + anim;
    const py = h / 2 - v * h * 0.45;
    pts.push([i, py]);
  }

  // Fill
  wCtx.beginPath();
  wCtx.moveTo(0, h);
  for (const [x, y] of pts) wCtx.lineTo(x, y);
  wCtx.lineTo(w, h);
  wCtx.closePath();
  const [r, g, b] = product.auraRgb;
  wCtx.fillStyle = `rgba(${r},${g},${b},0.15)`;
  wCtx.fill();

  // Line
  wCtx.beginPath();
  wCtx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) wCtx.lineTo(pts[i][0], pts[i][1]);
  wCtx.strokeStyle = product.auraColor;
  wCtx.lineWidth = 1.5;
  wCtx.stroke();
}

// ─────────────────────────────────────────────────────
//  GAUGE
// ─────────────────────────────────────────────────────
const GAUGE_COLORS = ['#2ecfcf', '#9b6be8', '#d4a84b'];
const gaugeCanvases = document.querySelectorAll('.gauge__canvas');
const gaugeValEls = [
  document.getElementById('gaugeRoughVal'),
  document.getElementById('gaugeBounceVal'),
  document.getElementById('gaugeSqueezeVal'),
];

function drawGauge(canvas, value, colorIdx) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const r = W / 2 - 4;

  ctx.clearRect(0, 0, W, H);

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#1a1d2c';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Value arc
  const angle = value * 2 * Math.PI * 0.75;
  const startAngle = -Math.PI * 1.375;
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, startAngle + angle);
  ctx.strokeStyle = GAUGE_COLORS[colorIdx % GAUGE_COLORS.length];
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function updateGauges(product, squeeze) {
  const values = [product.roughness, product.elasticity, squeeze];
  const labels = [Math.round(product.roughness * 100), Math.round(product.elasticity * 100), Math.round(squeeze * 100)];
  gaugeCanvases.forEach((c, i) => drawGauge(c, values[i], i));
  gaugeValEls.forEach((el, i) => { el.textContent = labels[i]; });
}

// ─────────────────────────────────────────────────────
//  SIDEBAR PRODUCT LIST
// ─────────────────────────────────────────────────────
function buildSidebar() {
  const list = document.getElementById('productList');
  list.innerHTML = '';
  PRODUCTS.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'product-card' + (i === state.currentIdx ? ' active' : '');
    card.dataset.idx = i;

    // Mini 3D preview canvas
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 52; thumbCanvas.height = 52;
    thumbCanvas.style.width = '52px'; thumbCanvas.style.height = '52px';
    const tc = thumbCanvas.getContext('2d');

    card.innerHTML = `
      <div class="product-card__thumb"></div>
      <div class="product-card__info">
        <div class="product-card__name">${p.name}</div>
        <div class="product-card__brand">${p.brand}</div>
        <div>
          <span class="product-card__price">$${p.price.toFixed(2)}</span>
          <span class="product-card__discount">-${p.discount}%</span>
        </div>
      </div>
    `;
    card.querySelector('.product-card__thumb').appendChild(thumbCanvas);

    // Draw mini preview
    const t = performance.now() / 1000;
    if (p.shape === 'sphere') {
      draw3DSphere(tc, 26, 26, 40, 0.4, t * 0.3, 0, p.color, 0);
    } else {
      draw3DCube(tc, 26, 26, 32, 0.4, t * 0.3, 0.2, p.color, 0);
    }

    card.addEventListener('click', () => selectProduct(i));
    list.appendChild(card);
    p._thumbCanvas = thumbCanvas;
    p._thumbCtx = tc;
  });
}

function updateSidebarActive() {
  document.querySelectorAll('.product-card').forEach((card, i) => {
    card.classList.toggle('active', i === state.currentIdx);
  });
}

// Animate sidebar thumbs
function animateSidebarThumbs() {
  const t = performance.now() / 1000;
  PRODUCTS.forEach((p, i) => {
    if (!p._thumbCtx) return;
    const tc = p._thumbCtx;
    tc.clearRect(0, 0, 52, 52);
    const angle = t * (i === state.currentIdx ? 0.6 : 0.3);
    if (p.shape === 'sphere') {
      draw3DSphere(tc, 26, 26, 40, 0.4, angle, 0, p.color, i === state.currentIdx ? 0.3 : 0);
    } else {
      draw3DCube(tc, 26, 26, 32, 0.4, angle, 0.2, p.color, i === state.currentIdx ? 0.3 : 0);
    }
  });
}

// ─────────────────────────────────────────────────────
//  INFO PANEL UPDATE
// ─────────────────────────────────────────────────────
function updateInfoPanel() {
  const p = PRODUCTS[state.currentIdx];

  document.getElementById('infoName').textContent = p.name;
  document.getElementById('infoBrand').textContent = `by ${p.brand}  ·  ${p.category}`;
  document.getElementById('infoPrice').textContent = `$${p.price.toFixed(2)}`;
  document.getElementById('infoOriginalPrice').textContent = `$${p.originalPrice.toFixed(2)}`;
  document.getElementById('infoDiscount').textContent = `-${p.discount}%`;

  // Stars
  const starsEl = document.getElementById('infoStars');
  starsEl.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span');
    s.className = i < Math.floor(p.rating) ? 'star' : 'star empty';
    s.textContent = '★';
    starsEl.appendChild(s);
  }
  const rt = document.createElement('span');
  rt.className = 'info__rating-text';
  rt.textContent = `${p.rating}  (${p.reviews.toLocaleString()})`;
  starsEl.appendChild(rt);

  const primeEl = document.getElementById('infoPrime');
  primeEl.style.display = p.prime ? 'inline-block' : 'none';

  const stockEl = document.getElementById('infoStock');
  stockEl.textContent = p.inStock ? '✓ In Stock' : '✗ Out of Stock';
  stockEl.className = 'info__stock ' + (p.inStock ? 'in' : 'out');

  document.getElementById('infoDesc').textContent = p.description;
  const featEl = document.getElementById('infoFeatures');
  featEl.innerHTML = p.features.map(f => `<li>${f}</li>`).join('');

  document.getElementById('footerProduct').textContent = `Product: ${p.name}`;
}

// ─────────────────────────────────────────────────────
//  GESTURE STATUS
// ─────────────────────────────────────────────────────
const GESTURE_MAP = {
  point: { name: 'POINTING',  desc: 'Move cursor',       cls: 'point' },
  pinch: { name: 'PINCHING',  desc: 'Select / confirm',  cls: 'pinch' },
  fist:  { name: 'FIST',      desc: 'Grab mode active',  cls: 'fist' },
  open:  { name: 'OPEN HAND', desc: 'Release / idle',    cls: 'open' },
  idle:  { name: 'IDLE',      desc: 'Waiting for input', cls: 'idle' },
  none:  { name: 'NO HAND',   desc: 'Show your hand',    cls: 'none' },
};

function updateGestureUI(gesture, confidence) {
  const info = GESTURE_MAP[gesture] || GESTURE_MAP.none;
  const nameEl = document.getElementById('gestureName');
  nameEl.textContent = info.name;
  nameEl.className = 'gesture-name ' + info.cls;
  document.getElementById('gestureDesc').textContent = info.desc;

  const pct = Math.round(confidence * 100);
  document.getElementById('confBar').style.width = pct + '%';
  document.getElementById('confBar').style.background = confidence > 0.7 ? '#3fcf7f' : '#e09640';
  document.getElementById('confPct').textContent = pct + '%';
}

// ─────────────────────────────────────────────────────
//  SESSION STATS
// ─────────────────────────────────────────────────────
function updateStats() {
  const s = state.sessionStats[state.currentIdx];
  s.timeViewed = (Date.now() - s.startTime) / 1000;
  if (state.squeeze * 100 > s.maxSqueeze) s.maxSqueeze = state.squeeze * 100;

  document.getElementById('statInteractions').textContent = s.interactions;
  document.getElementById('statViewTime').textContent = Math.round(s.timeViewed) + 's';
  document.getElementById('statMaxSqueeze').textContent = Math.round(s.maxSqueeze) + '%';
}

// ─────────────────────────────────────────────────────
//  PRODUCT SELECTION
// ─────────────────────────────────────────────────────
function selectProduct(idx) {
  if (idx === state.currentIdx) return;
  state.currentIdx = idx;
  state.sessionStats[idx].startTime = Date.now();
  state.rx = state.ry = state.rz = 0;
  state.targetRx = state.targetRy = state.targetRz = 0;
  updateSidebarActive();
  updateInfoPanel();
}

// ─────────────────────────────────────────────────────
//  GESTURE DETECTION (MediaPipe)
// ─────────────────────────────────────────────────────
const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_PIPS = [3, 6, 10, 14, 18];

function fingerStates(lm) {
  const states = [lm[4].x < lm[3].x];
  for (let i = 0; i < 4; i++) states.push(lm[FINGER_TIPS[i+1]].y < lm[FINGER_PIPS[i+1]].y);
  return states;
}

function pinchDist(lm) {
  const dx = lm[4].x - lm[8].x, dy = lm[4].y - lm[8].y;
  return Math.sqrt(dx*dx + dy*dy);
}

function classifyGesture(lm) {
  const fs = fingerStates(lm);
  const extCount = fs.filter(Boolean).length;
  const isPinch = pinchDist(lm) < 0.055;

  const palmX = (lm[0].x+lm[5].x+lm[9].x+lm[13].x+lm[17].x)/5;
  const palmY = (lm[0].y+lm[5].y+lm[9].y+lm[13].y+lm[17].y)/5;
  let tipsFar = 0;
  for (const tip of FINGER_TIPS) {
    const dx = lm[tip].x - palmX, dy = lm[tip].y - palmY;
    if (Math.sqrt(dx*dx+dy*dy) > 0.15) tipsFar++;
  }
  const isFist = !fs.some(Boolean) || tipsFar <= 1;

  if (isPinch) return 'pinch';
  if (isFist)  return 'fist';
  if (extCount === 1 && fs[1]) return 'point';
  if (extCount >= 4) return 'open';
  return 'idle';
}

function getHandCenter(lm) {
  return {
    x: (lm[0].x+lm[5].x+lm[9].x+lm[13].x+lm[17].x)/5,
    y: (lm[0].y+lm[5].y+lm[9].y+lm[13].y+lm[17].y)/5,
    z: (lm[0].z+lm[5].z+lm[9].z+lm[13].z+lm[17].z)/5,
  };
}

function getHandRoll(lm) {
  const wx=lm[0].x, wy=lm[0].y, wz=lm[0].z;
  const mx=lm[9].x, my=lm[9].y, mz=lm[9].z;
  const ix=lm[5].x, iy=lm[5].y, iz=lm[5].z;
  const hlen = Math.sqrt((mx-wx)**2+(my-wy)**2+(mz-wz)**2)+1e-6;
  const hx=(mx-wx)/hlen, hy=(my-wy)/hlen;
  const ilen = Math.sqrt((ix-wx)**2+(iy-wy)**2+(iz-wz)**2)+1e-6;
  const iix=(ix-wx)/ilen, iiy=(iy-wy)/ilen;
  return Math.atan2(iiy-hy, iix-hx);
}

function getHandTilt(lm) {
  const wx=lm[0].x, wy=lm[0].y, wz=lm[0].z;
  const mx=lm[9].x, my=lm[9].y, mz=lm[9].z;
  const hlen = Math.sqrt((mx-wx)**2+(my-wy)**2+(mz-wz)**2)+1e-6;
  return Math.asin(Math.max(-1, Math.min(1, (my-wy)/hlen)));
}

function deadzone(v, t=0.05) {
  return Math.abs(v) < t ? 0 : v - Math.sign(v)*t;
}

function twoHandSqueeze(lm1, lm2) {
  const c1 = getHandCenter(lm1), c2 = getHandCenter(lm2);
  const d = Math.sqrt((c1.x-c2.x)**2+(c1.y-c2.y)**2+(c1.z-c2.z)**2);
  return Math.max(0, Math.min(1, 1 - (d - 0.1) / 0.5));
}

// ─────────────────────────────────────────────────────
//  HAND STATUS UI
// ─────────────────────────────────────────────────────
function updateHandStatus(right, left) {
  const dot = document.getElementById('handDot');
  const txt = document.getElementById('handStatusText');
  if (right && left) {
    dot.className = 'hand-dot full';
    txt.textContent = 'BOTH HANDS · FULL CONTROL';
    txt.style.color = 'var(--success)';
  } else if (right || left) {
    dot.className = 'hand-dot partial';
    txt.textContent = 'ONE HAND · PARTIAL CONTROL';
    txt.style.color = 'var(--warning)';
  } else {
    dot.className = 'hand-dot';
    txt.textContent = 'NO HANDS DETECTED';
    txt.style.color = 'var(--gray-500)';
  }
}

// ─────────────────────────────────────────────────────
//  CANVAS SIZING
// ─────────────────────────────────────────────────────
function resizeCanvases() {
  const wrap = document.querySelector('.viewer__canvas-wrap');
  const W = wrap.offsetWidth, H = wrap.offsetHeight;
  [videoCanvas, overlayCanvas, productCanvas, particleCanvas].forEach(c => {
    c.width = W; c.height = H;
  });
  initParticles(W, H);
}

// ─────────────────────────────────────────────────────
//  MEDIAPIPE SETUP
// ─────────────────────────────────────────────────────
let handsModel = null;
let cameraInstance = null;

function initMediaPipe() {
  handsModel = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  handsModel.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.6,
  });
  handsModel.onResults(onHandResults);
}

function onHandResults(results) {
  const W = videoCanvas.width, H = videoCanvas.height;

  // Draw mirrored video
  vCtx.save();
  vCtx.clearRect(0, 0, W, H);
  if (results.image) {
    vCtx.drawImage(results.image, 0, 0, W, H);
  }
  vCtx.restore();

  // Draw hand skeleton on overlay
  oCtx.clearRect(0, 0, W, H);

  let rightHand = null, leftHand = null;

  if (results.multiHandLandmarks) {
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const lm = results.multiHandLandmarks[i];
      const label = results.multiHandedness[i].label;
      if (label === 'Right') rightHand = lm;
      else leftHand = lm;

      // Draw skeleton
      drawConnectors(oCtx, lm, HAND_CONNECTIONS, { color: 'rgba(212,168,75,0.4)', lineWidth: 1.5 });
      drawLandmarks(oCtx, lm, { color: 'rgba(212,168,75,0.8)', lineWidth: 1, radius: 3 });
    }
  }

  state.rightHand = rightHand;
  state.leftHand = leftHand;

  const primary = rightHand || leftHand;
  if (primary) {
    const lm = primary;
    state.confidence = 0.9;
    const rawG = classifyGesture(lm);

    // Cursor from index tip (flipped because video is mirrored)
    state.cursorX = (1 - lm[8].x) * W;
    state.cursorY = lm[8].y * H;

    if (rawG === state.lastGesture) {
      state.gestureHold++;
    } else {
      state.gestureHold = 0;
      state.lastGesture = rawG;
      if (rawG !== 'fist') state.grabActive = false;
      state.sessionStats[state.currentIdx].interactions++;
    }
    state.gesture = rawG;

    // Pinch to select — check sidebar hover
    if (state.gesture === 'pinch' && state.gestureHold >= 10) {
      if (state.hoveredIdx >= 0 && state.hoveredIdx !== state.currentIdx) {
        selectProduct(state.hoveredIdx);
      }
      state.gestureHold = 0;
    }
    if (state.gesture === 'fist' && state.gestureHold >= 10) state.grabActive = true;
    if (state.gesture === 'open') state.grabActive = false;

    // Rotation from hand orientation
    if (rightHand || leftHand) {
      let rX = rightHand ? deadzone(getHandRoll(rightHand) * 2.5, 0.08) : 0;
      let rY = leftHand  ? deadzone(getHandRoll(leftHand) * 2.5, 0.08) : 0;
      let rZ = 0;
      if (rightHand && leftHand) {
        const avgTilt = (getHandTilt(rightHand) + getHandTilt(leftHand)) / 2;
        rZ = deadzone(avgTilt * 3.0, 0.08);
      }
      rX = Math.max(-2, Math.min(2, rX));
      rY = Math.max(-2, Math.min(2, rY));
      rZ = Math.max(-2, Math.min(2, rZ));
      state.targetRx = smoothX.update(rX * 1.5);
      state.targetRy = smoothY.update(rY * 1.5);
      state.targetRz = smoothZ.update(rZ * 1.2);
    }

    // Two-hand squeeze
    if (rightHand && leftHand) {
      const rawSq = twoHandSqueeze(rightHand, leftHand);
      state.smoothSqueeze = state.smoothSqueeze * 0.7 + rawSq * 0.3;
      state.squeeze = state.smoothSqueeze;
    } else {
      state.smoothSqueeze *= 0.95;
      state.squeeze = state.grabActive ? state.smoothSqueeze : state.smoothSqueeze * 0.3;
    }
  } else {
    state.gesture = 'none';
    state.confidence = 0;
    state.gestureHold = 0;
    state.lastGesture = '';
    state.smoothSqueeze *= 0.95;
    state.squeeze = state.smoothSqueeze;
    state.targetRx *= 0.97;
    state.targetRy *= 0.97;
    state.targetRz *= 0.97;
  }

  updateHandStatus(rightHand, leftHand);
}

// ─────────────────────────────────────────────────────
//  CAMERA
// ─────────────────────────────────────────────────────
async function startCamera() {
  if (!handsModel) initMediaPipe();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    videoEl.srcObject = stream;
    await videoEl.play();

    cameraInstance = new Camera(videoEl, {
      onFrame: async () => {
        if (handsModel) await handsModel.send({ image: videoEl });
      },
      width: 1280,
      height: 720,
    });
    await cameraInstance.start();

    state.cameraActive = true;
    noCamOverlay.classList.add('hidden');
    document.getElementById('btnCamera').classList.add('active');
    document.getElementById('liveDot').className = 'header__live-dot live';
    document.getElementById('liveLabel').className = 'header__live-label live';
    document.getElementById('liveLabel').textContent = 'LIVE';
  } catch (err) {
    console.error('Camera error:', err);
    document.getElementById('liveDot').className = 'header__live-dot error';
    document.getElementById('liveLabel').className = 'header__live-label error';
    document.getElementById('liveLabel').textContent = 'CAMERA ERROR';
    alert('Could not access camera: ' + err.message);
  }
}

function stopCamera() {
  if (cameraInstance) { cameraInstance.stop(); cameraInstance = null; }
  if (videoEl.srcObject) { videoEl.srcObject.getTracks().forEach(t => t.stop()); videoEl.srcObject = null; }
  state.cameraActive = false;
  noCamOverlay.classList.remove('hidden');
  document.getElementById('btnCamera').classList.remove('active');
  document.getElementById('liveDot').className = 'header__live-dot';
  document.getElementById('liveLabel').className = 'header__live-label';
  document.getElementById('liveLabel').textContent = 'OFFLINE';
  vCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
  oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// ─────────────────────────────────────────────────────
//  MAIN RENDER LOOP
// ─────────────────────────────────────────────────────
function renderLoop() {
  requestAnimationFrame(renderLoop);

  const now = performance.now();
  const dt = (now - state.lastTime) / 1000;
  state.lastTime = now;
  state.fps = state.fps * 0.9 + (1 / (dt + 0.0001)) * 0.1;

  const W = productCanvas.width, H = productCanvas.height;
  const cx = W / 2, cy = H / 2 + 10;

  // Smooth rotation
  state.rx += (state.targetRx - state.rx) * 0.15;
  state.ry += (state.targetRy - state.ry) * 0.15;
  state.rz += (state.targetRz - state.rz) * 0.15;

  // ── Particles ──
  drawParticles(W, H);

  // ── Product 3D ──
  pCtx.clearRect(0, 0, W, H);

  const p = PRODUCTS[state.currentIdx];
  const sqScale = 1 - state.squeeze * 0.35;
  const objSize = Math.round(Math.min(W, H) * 0.28 * sqScale);
  const auraIntensity = state.squeeze * 0.8 + 0.1 * Math.abs(Math.sin(now / 1000 * 2));

  drawShadow(pCtx, cx, cy, objSize, sqScale);

  if (p.shape === 'sphere') {
    draw3DSphere(pCtx, cx, cy, objSize * 2, state.rx, state.ry, state.rz, p.color, auraIntensity);
  } else {
    draw3DCube(pCtx, cx, cy, objSize, state.rx, state.ry, state.rz, p.color, auraIntensity);
  }

  drawSqueezeBar(pCtx, cx, cy, objSize, state.squeeze);

  // ── Cursor ──
  if (state.cameraActive) {
    cursorEl.style.left = state.cursorX + 'px';
    cursorEl.style.top  = state.cursorY + 'px';
    cursorEl.className = 'cursor ' + (state.gesture === 'pinch' ? 'pinch' : state.gesture === 'fist' ? 'fist' : '');
  }

  // ── Angles display ──
  const ax = ((state.rx * 180 / Math.PI) % 360 + 360) % 360;
  const ay = ((state.ry * 180 / Math.PI) % 360 + 360) % 360;
  const az = ((state.rz * 180 / Math.PI) % 360 + 360) % 360;
  document.getElementById('viewerAngles').textContent =
    `X:${Math.round(ax)}°  Y:${Math.round(ay)}°  Z:${Math.round(az)}°`;

  const sqPct = Math.round(state.squeeze * 100);
  document.getElementById('viewerSqueeze').textContent = sqPct > 3 ? `SQUEEZE ${sqPct}%` : '';

  // ── Waveform ──
  drawWaveform(p, state.squeeze);

  // ── Gauges ──
  updateGauges(p, state.squeeze);

  // ── Gesture UI ──
  updateGestureUI(state.gesture, state.confidence);

  // ── Session stats ──
  updateStats();

  // ── Sidebar thumb animations ──
  animateSidebarThumbs();

  // ── FPS ──
  document.getElementById('footerFPS').textContent = `FPS ${Math.round(state.fps)}`;
}

// ─────────────────────────────────────────────────────
//  KEYBOARD
// ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 's' || e.key === 'S') {
    selectProduct((state.currentIdx + 1) % PRODUCTS.length);
  }
  if (e.key === 'r' || e.key === 'R') {
    state.rx = state.ry = state.rz = 0;
    state.targetRx = state.targetRy = state.targetRz = 0;
  }
});

// ─────────────────────────────────────────────────────
//  BUTTON HANDLERS
// ─────────────────────────────────────────────────────
document.getElementById('btnCamera').addEventListener('click', () => {
  state.cameraActive ? stopCamera() : startCamera();
});
document.getElementById('btnStartCamera').addEventListener('click', startCamera);
document.getElementById('btnReset').addEventListener('click', () => {
  state.rx = state.ry = state.rz = 0;
  state.targetRx = state.targetRy = state.targetRz = 0;
});

// ─────────────────────────────────────────────────────
//  RESIZE
// ─────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  resizeCanvases();
});

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
function init() {
  resizeCanvases();
  buildSidebar();
  updateInfoPanel();
  initMediaPipe();
  renderLoop();
}

// Wait for DOM + fonts
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
