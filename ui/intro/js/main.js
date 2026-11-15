'use strict';
/* =====================================================================
   SPACE APPS MARS — Viaje Tierra → Marte
   Todo lo ajustable está en CONFIG.
   ===================================================================== */
const CONFIG = {
  title: 'ASTERTRAIL',
  totalHours: 5832,          // horas de misión (fijo)
  totalKm: 225e6,            // distancia total en km (fijo)
  realSeconds: 32,           // duración REAL de la animación
  px: { w: 480, h: 270, levels: 7 },   // resolución interna pixel art y niveles de color por canal
  assets: {                  // si un archivo no existe se usa una textura procedural
    // [Marswalk] rutas relativas a ui/index.html. '' = no cargar (textura procedural / sin música) para no generar errores 404.
    frame: 'intro/assets/marcodenave.png',   // marco de la cabina (PNG con la ventana TRANSPARENTE, 16:9)
    music: '',               // p. ej. 'intro/assets/audio/musica.mp3'
    earth: '',               // p. ej. 'intro/assets/tierra.jpg'
    moon: '',                // p. ej. 'intro/assets/luna.jpg'
    mars: ''                 // p. ej. 'intro/assets/marte.jpg'
  },
  arrivalHold: 2.5,          // segundos que se queda viendo Marte antes de empezar a oscurecer
  fadeSeconds: 3.5,          // duración del fundido lento a negro
  nextPage: null,            // página a la que se pasa al terminar (ej. 'mapa.html'); null = aún sin conectar
  menu: true,                // [Marswalk] al llegar se muestra el menú de módulos sobre la vista de Marte (en vez de fundir a negro)
  briefing: [                // [Marswalk] mensajes de misión (efecto máquina de escribir en la consola)
    'LLEGADA A <b>MARTE</b> · CRÁTER GALE, ZONA DE CURIOSITY.',
    'TEMPERATURA REAL DE <b>REMS</b> + PRONÓSTICO GP DE 3 SOLS.',
    'TERRENO REAL: <b>HiRISE</b> + DEM USGS. ELIGE UN MÓDULO.'
  ]
};

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const fmt = n => Math.round(n).toLocaleString('en-US');

const stage = $('#stage');
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px,${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit); fit();

/* ---------- perfil de velocidad y progreso ----------
   v(t): acelera suave, crucero, frena suave. p(t) = integral normalizada (0→1).
   Tiempo y distancia mostrados salen de p, por eso siempre son coherentes. */
const vAt = t => sstep(0, .22, t) * (1 - sstep(.55, 1, t));
const PT = (() => { const n = 1000, a = [0]; for (let i = 1; i <= n; i++) a[i] = a[i - 1] + vAt(i / n); return a.map(x => x / a[n]); })();
const pAt = t => { const f = clamp(t) * 1000, i = Math.min(999, f | 0); return lerp(PT[i], PT[i + 1], f - i); };

/* ---------- texturas procedurales (marcador de posición; tus texturas reales las sustituyen) ---------- */
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}
function fbm(x, y, o = 4) { let a = .5, s = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); x *= 2; y *= 2; a /= 2; } return s; }

function procTex(kind) {
  const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), im = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W * 6, v = y / H * 3; let r, gr, b;
    if (kind === 'earth') {
      const h = fbm(u, v, 5), cl = fbm(u * 1.3 + 9, v * 1.6 + 4, 4);
      if (h > .52) { const t = fbm(u * 2, v * 2, 3); [r, gr, b] = h > .66 ? [200, 185, 140] : t > .5 ? [72, 150, 52] : [44, 112, 40]; }
      else { [r, gr, b] = h > .46 ? [60, 170, 230] : [24, 80, 190]; }
      if (cl > .58 || y < 7 || y > H - 8) r = gr = b = 236;
    } else if (kind === 'mars') {
      const h = fbm(u * 1.2, v * 1.2, 5), d = fbm(u * 2 + 5, v * 2, 4), m = lerp(.7, 1.1, h);
      r = 205 * m; gr = 95 * m; b = 45 * m;
      if (d > .58) { r *= .55; gr *= .5; b *= .5; }
      if (y < 6 || y > H - 7) r = gr = b = 225;
    } else {
      const m = lerp(.5, 1, fbm(u * 2, v * 2, 5)), cr = fbm(u * 4 + 3, v * 4, 3) > .62 ? .6 : 1;
      r = 140 * m * cr; gr = 135 * m * cr; b = 128 * m * cr;
    }
    im.data.set([r, gr, b, 255], (y * W + x) * 4);
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
}

/* ---------- escena Three.js ---------- */
const { w: W, h: H, levels } = CONFIG.px;
const renderer = new THREE.WebGLRenderer({ canvas: $('#space'), antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, W / H, .1, 3000); scene.add(cam);

const amb = new THREE.AmbientLight(0x6a7aa8, .55); scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff0dd, 1.3); sun.position.set(.6, .5, .8); scene.add(sun);

function planet(kind, r, url) {
  const mat = new THREE.MeshLambertMaterial({ map: procTex(kind) });
  if (url) new THREE.TextureLoader().load(url, t => { t.magFilter = THREE.NearestFilter; mat.map = t; mat.needsUpdate = true; }, undefined, () => {});
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat); scene.add(m); return m;
}
const MARS_POS = new THREE.Vector3(250, 6, -420), MARS_R = 9, ARRIVE_D = 30;
const earth = planet('earth', 8, CONFIG.assets.earth);
earth.add(new THREE.Mesh(new THREE.SphereGeometry(8.5, 32, 24),
  new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: .28, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })));
const moon = planet('moon', 4.5, CONFIG.assets.moon);
const mars = planet('mars', MARS_R, CONFIG.assets.mars); mars.position.copy(MARS_POS);
const phobos = planet('moon', 1.8, ''), deimos = planet('moon', 1.4, '');
phobos.material.color.setHex(0xc9a98a); deimos.material.color.setHex(0xd8c3a0);

// Estrellas de fondo (mundo) + nebulosas
function starField(n, size) {
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = Math.sqrt(1 - u * u);
    p.set([r * Math.cos(a) * 1500, u * 1500, r * Math.sin(a) * 1500], i * 3);
    col.setHSL([.6, .12, .08][Math.random() * 3 | 0], .5, .65 + Math.random() * .35); c.set([col.r, col.g, col.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true }));
  m.frustumCulled = false; scene.add(m); return m;
}
const skyA = starField(1700, 1), skyB = starField(160, 2);

function glowTex(col) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, col + 'aa'); gr.addColorStop(1, col + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
[['#5a2a9a', 300, 200, -1200, 1300], ['#2a3a9a', -600, -100, -1200, 1200], ['#6a2a8a', 520, -300, -900, 1000]].forEach(([col, x, y, z, s]) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(col), transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.position.set(x, y, z); sp.scale.set(s, s, 1); sp.userData.sky = true; scene.add(sp);
});

// Campo cercano (en el sistema de la cámara): polvo + líneas de velocidad con profundidad real
const NEAR = 450, ZR = 260, nPos = new Float32Array(NEAR * 3), lPos = new Float32Array(NEAR * 6);
function place(i, z) {
  const a = Math.random() * 6.2832, r = 1.5 + Math.pow(Math.random(), .7) * 45;
  nPos[i * 3] = Math.cos(a) * r * 1.78; nPos[i * 3 + 1] = Math.sin(a) * r; nPos[i * 3 + 2] = z;
}
for (let i = 0; i < NEAR; i++) place(i, -Math.random() * ZR);
const dGeo = new THREE.BufferGeometry(), lGeo = new THREE.BufferGeometry();
dGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3)); lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ size: 1, sizeAttenuation: false, color: 0xdfeaff, transparent: true, opacity: 0, depthWrite: false }));
const streaks = new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
dust.frustumCulled = streaks.frustumCulled = false; cam.add(dust, streaks);

// Post-proceso pixel art: gamma + tinte ambiental + cuantización con dithering Bayer 4x4
const post = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: rt.texture }, lv: { value: levels }, haze: { value: 0 }, warm: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader: `
    uniform sampler2D t; uniform float lv, haze, warm; varying vec2 vUv;
    float b2(vec2 p){ p = mod(floor(p), 2.); return mod(p.x*2. + p.y*3., 4.); }
    float b4(vec2 p){ return (b2(p)*4. + b2(p*.5)) / 16.; }
    void main(){
      vec3 c = pow(texture2D(t, vUv).rgb, vec3(.62));
      c += vec3(.25,.5,1.) * haze * (1.-vUv.y) * (1.-vUv.x*.6) * .5;
      c = mix(c, c*vec3(1.12,.92,.82) + vec3(.04,.012,0.), warm);
      float d = b4(gl_FragCoord.xy) - .5;
      c = floor(c*lv + .5 + d*.9) / lv;
      gl_FragColor = vec4(c, 1.);
    }`
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat); quad.frustumCulled = false; post.add(quad);

/* ---------- estado del viaje ---------- */
let state = 'title', t0 = 0, prog = 0, spd = 0, time = 0, last = performance.now();
const P = new THREE.Vector3(), L = new THREE.Vector3(), FWD = new THREE.Vector3();

function updateScene(dt) {
  const p = prog;
  // Cámara: avanza hacia Marte con trayectoria curva y mira hacia él progresivamente
  P.set(lerp(0, MARS_POS.x, Math.pow(p, 1.7)), lerp(0, MARS_POS.y, Math.pow(p, 1.7)), lerp(0, MARS_POS.z + ARRIVE_D, p));
  cam.position.set(P.x + Math.sin(time * .4) * .12, P.y + Math.cos(time * .33) * .1, P.z);
  FWD.set(P.x, P.y, P.z - 100); L.lerpVectors(FWD, MARS_POS, sstep(.05, .92, p));
  cam.lookAt(L); cam.rotateZ(Math.sin(time * .27) * .008);

  // Tierra y Luna se alejan (escala de distancia) hasta perderse
  const fE = 1 + 22 * sstep(0, .5, p), fM = 1 + 30 * sstep(0, .3, p);
  earth.position.set(cam.position.x - 12 * fE, cam.position.y - 2 * fE, cam.position.z - 18 * fE); earth.rotation.y += dt * .05;
  moon.position.set(cam.position.x - 3 * fM, cam.position.y - 9 * fM, cam.position.z - 30 * fM);
  earth.visible = moon.visible = p < .55;
  mars.rotation.y += dt * .01;
  phobos.position.set(MARS_POS.x - 14 + Math.sin(time * .2) * 1.2, MARS_POS.y - 6, MARS_POS.z + 3);
  deimos.position.set(MARS_POS.x + 15, MARS_POS.y + 6.5 + Math.cos(time * .2), MARS_POS.z + 2);

  // Estrellas de fondo siguen a la cámara (infinito); nebulosas fijas al cielo
  skyA.position.copy(cam.position); skyB.position.copy(cam.position);
  scene.children.forEach(o => { if (o.userData.sky) o.position.z = cam.position.z - 1200; });

  // Efectos de velocidad
  const dist = spd * 230 * dt, len = spd * spd * 70;
  for (let i = 0; i < NEAR; i++) {
    let z = nPos[i * 3 + 2] + dist;
    if (z > -1) { place(i, -ZR); z = -ZR; } else nPos[i * 3 + 2] = z;
    const x = nPos[i * 3], y = nPos[i * 3 + 1];
    lPos.set([x, y, z, x, y, z - len], i * 6);
  }
  dGeo.attributes.position.needsUpdate = lGeo.attributes.position.needsUpdate = true;
  dust.material.opacity = sstep(0, .08, p) * (1 - sstep(.88, 1, p)) * .9;
  streaks.material.opacity = sstep(.04, .3, spd) * .75;

  // Ambiente: atmósfera azul al salir → tono cálido al aproximarse a Marte
  const warm = sstep(.72, 1, p);
  postMat.uniforms.haze.value = 1 - sstep(0, .12, p); postMat.uniforms.warm.value = warm;
  sun.color.setRGB(1, lerp(.94, .78, warm), lerp(.87, .6, warm));
}

function render() {
  renderer.setRenderTarget(rt); renderer.render(scene, cam);
  renderer.setRenderTarget(null); renderer.render(post, postCam);
}

/* ---------- panel de misión ---------- */
const bar = $('#bar'), SEGS = 40, segEls = [];
for (let i = 0; i < SEGS; i++) { const s = document.createElement('i'); bar.appendChild(s); segEls.push(s); }
let litPrev = -1;
function missionStatus() {
  return prog < .015 ? 'PREPARANDO DESPEGUE' : prog < .12 ? 'SALIENDO DE LA ATMÓSFERA' : prog < .8 ? 'TRÁNSITO INTERPLANETARIO'
       : prog < 1 ? 'APROXIMACIÓN A MARTE' : 'LLEGADA COMPLETADA';
}
function updatePanel() {
  $('#pStatus').textContent = missionStatus();
  $('#pHours').textContent = `${fmt(prog * CONFIG.totalHours)} h de ${fmt(CONFIG.totalHours)} h`;
  $('#pKm').textContent = `${fmt(prog * CONFIG.totalKm)} km`;
  const lit = Math.floor(prog * SEGS + (prog >= 1 ? .5 : 0));
  if (lit !== litPrev) { segEls.forEach((s, i) => s.classList.toggle('on', i < lit)); litPrev = lit; }
}

/* ---------- audio (música + motor sintetizado + hooks de efectos) ---------- */
const audio = { ctx: null, master: null, music: null, eng: null, filt: null, muted: false };
function initAudio() {
  if (audio.ctx) return;
  try {
    const ctx = audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.master = ctx.createGain(); audio.master.gain.value = audio.muted ? 0 : 1; audio.master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0); let l = 0;
    for (let i = 0; i < d.length; i++) { l = (l + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; }   // ruido marrón
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    audio.filt = ctx.createBiquadFilter(); audio.filt.type = 'lowpass'; audio.filt.frequency.value = 120;
    audio.eng = ctx.createGain(); audio.eng.gain.value = 0;
    src.connect(audio.filt).connect(audio.eng).connect(audio.master); src.start();
  } catch (e) { console.warn('Audio no disponible', e); }
  if (!CONFIG.assets.music) return;   // [Marswalk] sin archivo de música: solo el motor sintetizado
  audio.music = new Audio(CONFIG.assets.music); audio.music.loop = true; audio.music.volume = .5; audio.music.muted = audio.muted;
  audio.music.play().catch(() => {});
}
function sfx(name, f = 660) {   // GANCHO: aquí enlazarás tus efectos de sonido reales (name = 'click', 'hover', 'send', 'arrive'...)
  if (!audio.ctx || audio.muted) return;
  const o = audio.ctx.createOscillator(), g = audio.ctx.createGain(); o.type = 'square'; o.frequency.value = f;
  g.gain.setValueAtTime(.06, audio.ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.ctx.currentTime + .09);
  o.connect(g).connect(audio.master); o.start(); o.stop(audio.ctx.currentTime + .1);
}
const muteBtn = $('#mute');
const px = pts => pts.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');
const ICON_ON = px([[11, 5], [12, 6], [12, 7], [12, 8], [12, 9], [11, 10]]) + 'M2 6h3l4-3v10l-4-3H2z';
const ICON_OFF = px([[11, 5], [12, 6], [13, 7], [14, 8], [15, 9], [15, 5], [14, 6], [12, 8], [11, 9]]) + 'M2 6h3l4-3v10l-4-3H2z';
function setMute(m) {
  audio.muted = m; muteBtn.innerHTML = `<svg viewBox="0 0 17 16"><path d="${m ? ICON_OFF : ICON_ON}"/></svg>`;
  if (audio.master) audio.master.gain.value = m ? 0 : 1; if (audio.music) audio.music.muted = m;
}
setMute(false);
muteBtn.onclick = () => { initAudio(); setMute(!audio.muted); sfx('click', 520); };

/* ---------- flujo del juego ---------- */
const $title = $('#title'), $panel = $('#panel'), $fade = $('#fade'), $toast = $('#toast');

function buildTitle() {
  $('#gameTitle').innerHTML = [...CONFIG.title].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  const s = $('#start'); s.style.animation = 'none'; void s.offsetWidth; s.style.animation = '';
}
function toast(msg) { $toast.textContent = msg; $toast.classList.add('on'); setTimeout(() => $toast.classList.remove('on'), 3200); }

$('#start').onclick = () => {
  if (state !== 'title') return;
  initAudio(); sfx('click', 780);
  $title.classList.add('off'); $panel.classList.remove('off'); $('#skip').classList.remove('off');
  state = 'travel'; t0 = performance.now() + 900;      // pequeña pausa de "preparando despegue"
};
$('#skip').onclick = () => { if (state === 'travel') { sfx('click', 620); t0 = performance.now() - CONFIG.realSeconds * 1000; } };   // [Marswalk]
addEventListener('keydown', e => { if (e.code === 'Space' && state === 'travel') t0 = performance.now() - CONFIG.realSeconds * 1000; });   // saltar viaje (pruebas)

function arrive() {
  state = 'arrival'; prog = 1; spd = 0; sfx('arrive', 440); $('#skip').classList.add('off');
  setTimeout(CONFIG.menu ? showMenu : leave, CONFIG.arrivalHold * 1000);   // se queda un momento viendo Marte
}

/* ---------- [Marswalk] menú de módulos ---------- */
const OFFLINE_Q = /[?&]offline=1\b/.test(location.search);
function showMenu() {
  state = 'menu'; $panel.classList.add('off'); $title.classList.add('off'); $('#skip').classList.add('off');
  $('#menu').classList.remove('off'); $('#brief').classList.remove('off');
  typewriter(CONFIG.briefing);
}
let twTimer = null;
function typewriter(lines) {
  const el = $('#brief'); clearTimeout(twTimer); let li = 0, ci = 0;
  const html = (l, n) => {          // escribe n caracteres visibles respetando las etiquetas <b>
    let out = '', vis = 0;
    for (let i = 0; i < l.length && vis < n; i++) { if (l[i] === '<') { const j = l.indexOf('>', i); out += l.slice(i, j + 1); i = j; } else { out += l[i]; vis++; } }
    return out + (/<b>(?:(?!<\/b>).)*$/.test(out) ? '</b>' : '');
  };
  const plain = (l) => l.replace(/<[^>]+>/g, '').length;
  const tick = () => {
    const done = lines.slice(0, li).map((l) => l + '<br>').join('');
    el.innerHTML = done + (li < lines.length ? html(lines[li], ci) : '') + '<span class="cur"></span>';
    if (li >= lines.length) return;
    if (++ci > plain(lines[li])) { li++; ci = 0; twTimer = setTimeout(tick, 380); } else { if (ci % 3 === 0) sfx('type', 1200); twTimer = setTimeout(tick, 28); }
  };
  tick();
}
document.querySelectorAll('#menu [data-go]').forEach((b) => b.onclick = () => {
  initAudio(); sfx('click', 780);
  let url = b.dataset.go;
  if (OFFLINE_Q) url = url.replace(/(#|$)/, (m) => (url.includes('?') ? '&' : '?') + 'offline=1' + m);
  $fade.classList.add('on'); setTimeout(() => { location.href = url; }, 480);
});
// Volver desde un módulo (index.html#menu): sin repetir el viaje, directo a Marte con el menú.
if (location.hash === '#menu') { prog = 1; spd = 0; setTimeout(showMenu, 50); }
function leave() {                                        // fundido lento a negro + música que se apaga
  state = 'leaving';
  $fade.style.transition = `opacity ${CONFIG.fadeSeconds}s linear`; $fade.classList.add('on');
  const v0 = audio.music ? audio.music.volume : 0, t1 = performance.now();
  const iv = setInterval(() => {
    const k = clamp((performance.now() - t1) / (CONFIG.fadeSeconds * 1000));
    if (audio.music) audio.music.volume = v0 * (1 - k);
    if (k >= 1) clearInterval(iv);
  }, 50);
  setTimeout(goNext, CONFIG.fadeSeconds * 1000 + 300);
}
function goNext() {
  document.dispatchEvent(new CustomEvent('mars:arrived'));
  if (CONFIG.nextPage) { location.href = CONFIG.nextPage; return; }
  toast('LLEGADA COMPLETADA · falta conectar CONFIG.nextPage');   // mientras no haya página destino, vuelve al inicio
  setTimeout(() => {
    state = 'title'; prog = 0; spd = 0; litPrev = -1; $panel.classList.add('off'); $title.classList.remove('off'); buildTitle();
    if (audio.music) audio.music.volume = .5;
    $fade.style.transition = ''; $fade.classList.remove('on');
  }, 3500);
}

/* ---------- bucle principal ---------- */
function frame(ts) {
  const dt = Math.min(.05, (ts - last) / 1000); last = ts; time += dt;
  if (state === 'travel') {
    const tt = clamp((ts - t0) / 1000 / CONFIG.realSeconds); prog = pAt(tt); spd = vAt(tt);
    if (tt >= 1) arrive();
  }
  updateScene(dt); render();
  if (state !== 'title') updatePanel();
  if (audio.eng) { audio.eng.gain.value = spd * .5; audio.filt.frequency.value = 120 + spd * 520; }
  requestAnimationFrame(frame);
}

/* ---------- marco provisional de cabina (se elimina solo si existe assets/cabina.png) ---------- */
(function drawFallbackFrame() {
  const c = $('#frameFallback'); if (!c) return; const g = c.getContext('2d'), k = .25;
  g.fillStyle = '#0d1222'; g.fillRect(0, 0, 480, 270);
  for (let i = 0; i < 90; i++) { g.fillStyle = hash(i, 1) > .5 ? '#16304a' : '#241c3a'; g.fillRect(hash(i, 2) * 480, hash(i, 3) < .5 ? hash(i, 4) * 50 : 225 + hash(i, 5) * 45, 14 + hash(i, 6) * 30, 6); }
  g.fillStyle = '#e9a63a'; [[100, 6], [370, 6], [158, 238], [300, 238]].forEach(([x, y]) => g.fillRect(x, y, 14, 4));
  g.fillStyle = '#2cc8ff'; for (let i = 0; i < 40; i++) g.fillRect(80 + hash(i, 9) * 320, 232 + hash(i, 8) * 30, 2, 2);
  const poly = [[350, 212], [1585, 212], [1885, 620], [1640, 888], [290, 888], [40, 620]], path = () => { g.beginPath(); poly.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x * k, y * k)); g.closePath(); };
  g.globalCompositeOperation = 'destination-out'; path(); g.fill(); g.globalCompositeOperation = 'source-over';
  path(); g.lineWidth = 3; g.strokeStyle = '#2a3a5a'; g.stroke(); g.lineWidth = 1; g.strokeStyle = '#4b6a9a'; g.stroke();
})();

/* ---------- marco de la cabina: carga tu PNG; si no existe usa el provisional ---------- */
const frameImg = $('#frame');
frameImg.onload = () => { const f = $('#frameFallback'); if (f) f.remove(); console.log('[Cabina] marco cargado:', CONFIG.assets.frame); };
frameImg.onerror = () => { frameImg.remove(); console.warn('[Cabina] NO se encontró "' + CONFIG.assets.frame + '". Se usa el marco provisional.'); };
frameImg.src = CONFIG.assets.frame + '?v=' + Date.now();   // ?v= evita que el navegador use una versión vieja en caché

buildTitle();
requestAnimationFrame(frame);