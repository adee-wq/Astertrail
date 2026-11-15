/* =========================================================
   Astertrail · PxButton v2 — pixel art real
   Cada botón se dibuja en un canvas de baja resolución (1 px = 1 pixel de arte),
   el texto usa una fuente de mapa de bits 5x7 propia y se escala por un entero con
   image-rendering: pixelated. El texto real queda en el botón para accesibilidad.

   Uso:
     en el <head>: px-button.css (link) y px-button.js (script con defer)
     <button class="px-btn" data-size="lg">SEND ROVER</button>
     <button class="px-btn" data-size="sm" data-icon="sound" aria-label="Sonido"></button>
     <button class="px-btn" data-variant="danger" data-icon="close" aria-label="Cerrar"></button>
   Tamaños: sm | md | lg     Variantes: blue | danger
   Tras cambiar el texto por JS: PxButton.render(boton)
   ========================================================= */
(() => {
  const PAL = {
    blood: '#48090b', red: '#a10a04', orange: '#f26306',
    sky: '#51b4f5', blue: '#2276c0', navy: '#17365e', abyss: '#041734',
  };
  const VARIANTS = {
    blue:   { hi: PAL.sky,    face: PAL.blue, lo: PAL.navy,  glint: '#bfe6ff', hover: '#3a95db', dark: '#10294a' },
    danger: { hi: PAL.orange, face: PAL.red,  lo: PAL.blood, glint: '#ffb27a', hover: '#c8340a', dark: '#2a0406' },
    // herramientas del mapa: cara oscura y texto claro (se distinguen de la navegación y de las acciones principales)
    tool:   { hi: '#2e5a8a', face: '#0b2445', lo: '#06172e', glint: '#51b4f5', hover: '#163a66', dark: '#030c1a', text: '#bfe6ff' },
    // activo / seleccionado (apartado abierto, módulo actual)
    on:     { hi: '#ffe27a', face: '#f2a906', lo: '#8a5a00', glint: '#fff3c4', hover: '#ffbf2a', dark: '#3d2800' },
  };
  const DISABLED = { hi: '#3a5a80', face: PAL.navy, lo: '#0d2440', glint: '#5f7fa6', hover: PAL.navy, dark: '#081a30', text: '#5f7fa6' };
  const SCALE = { xs: 2, sm: 3, md: 4, lg: 5 };

  // iconos 9x9 (# = pixel)
  const ICONS = {
    sound: ['....#....', '...##..#.', '####.#..#', '####..#.#', '####..#.#', '####..#.#',
            '####.#..#', '...##..#.', '....#....'],
    close: ['##.....##', '###...###', '.###.###.', '..#####..', '...###...', '..#####..',
            '.###.###.', '###...###', '##.....##'],
    back:  ['...#.....', '..##.....', '.########', '#########', '.########', '..##.....',
            '...#.....', '.........', '.........'],
    thermo:   ['...##....', '..#..#...', '..#.##...', '..#..#...', '..#.##...', '..####...', '.######..', '.######..', '..####...'],
    mountain: ['.........', '....#....', '...###...', '...####..', '..######.', '..#######', '.########', '#########', '#########'],
    flag:     ['.####....', '.######..', '.#######.', '.######..', '.####....', '.#.......', '.#.......', '.#.......', '###......'],
    data:     ['.........', '.......##', '.......##', '....##.##', '....##.##', '.##.##.##', '.##.##.##', '.##.##.##', '#########'],
    image:    ['#########', '#.......#', '#.##....#', '#.##....#', '#.....#.#', '#..#.####', '#.#######', '#########', '.........'],
    pencil:   ['......##.', '.....####', '....####.', '...####..', '..####...', '.####....', '.###.....', '##.......', '#........'],
    target:   ['....#....', '..#####..', '.#..#..#.', '.#.....#.', '####.####', '.#.....#.', '.#..#..#.', '..#####..', '....#....'],
    play:     ['##.......', '####.....', '######...', '########.', '#########', '########.', '######...', '####.....', '##.......'],
    pause:    ['###...###', '###...###', '###...###', '###...###', '###...###', '###...###', '###...###', '###...###', '###...###'],
    plan:     ['..#####..', '#########', '#.......#', '#.#.###.#', '#.......#', '#.#.###.#', '#.......#', '#.#.###.#', '#########'],
    astro:    ['..#####..', '.#.....#.', '.#.###.#.', '.#.....#.', '..#####..', '.#######.', '#.#####.#', '..##.##..', '..##.##..'],
    sun:      ['....#....', '.#.....#.', '...###...', '..#####..', '#.#####.#', '..#####..', '...###...', '.#.....#.', '....#....'],
    profile:  ['.........', '......#..', '.....#.#.', '..#.#...#', '.#.#.....', '#........', '.........', '#########', '.........'],
    rad:      ['.##...##.', '###...###', '####.####', '....#....', '...###...', '....#....', '..#####..', '..#####..', '...###...'],
    help:     ['..#####..', '.##...##.', '......##.', '.....##..', '....##...', '....##...', '.........', '....##...', '....##...'],
    undo:     ['..#......', '.##......', '#######..', '.##....#.', '..#.....#', '........#', '........#', '.......#.', '..#####..'],
    trash:    ['...###...', '#########', '.#.....#.', '.#.#.#.#.', '.#.#.#.#.', '.#.#.#.#.', '.#.#.#.#.', '.#.....#.', '..#####..'],
    star:     ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '.#.....#.'],
    home:     ['....#....', '...###...', '..#####..', '.#######.', '#########', '.##...##.', '.##.#.##.', '.##.#.##.', '.#######.'],
    route:    ['#........', '##.......', '.#.......', '.##..###.', '..#.#...#', '..###...#', '.......#.', '......#..', '.....###.'],
    eye:      ['.........', '..#####..', '.#.....#.', '#..###..#', '#..###..#', '#..###..#', '.#.....#.', '..#####..', '.........'],
    rocket:   ['....#....', '...###...', '...#.#...', '...###...', '...###...', '..#####..', '.##.#.##.', '....#....', '...#.#...'],
    speed:    ['.........', '#...#....', '##..##...', '###.###..', '########.', '###.###..', '##..##...', '#...#....', '.........'],
  };

  const GLYPHS = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "Ñ": [".###.", ".....", "#...#", "##..#", "#.#.#", "#..##", "#...#"],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    " ": ["...", "...", "...", "...", "...", "...", "..."],
    ".": [".", ".", ".", ".", ".", ".", "#"],
    ",": ["..", "..", "..", "..", "..", ".#", "#."],
    ":": [".", ".", "#", ".", ".", "#", "."],
    "-": ["....", "....", "....", "####", "....", "....", "...."],
    "!": ["#", "#", "#", "#", "#", ".", "#"],
    "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
    "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
    "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", ".#.##", "#..##"],
    "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
    "(": ["..#", ".#.", "#..", "#..", "#..", ".#.", "..#"],
    ")": ["#..", ".#.", "..#", "..#", "..#", ".#.", "#.."],
    "±": ["..#..", "..#..", "#####", "..#..", "..#..", ".....", "#####"],
    "Σ": [".....", ".....", ".####", "#..#.", "#..#.", "#..#.", ".##.."],
    "σ": [".....", ".....", ".####", "#..#.", "#..#.", "#..#.", ".##.."],
    "·": [".", ".", ".", "#", ".", ".", "."],
    "°": [".##.", "#..#", ".##.", "....", "....", "....", "...."],
  };
  const ACCENTS = { 'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U' };
  // ---- texto -> máscara con la fuente de mapa de bits 5x7 en negrita ----
  function textMask(txt) {
    const px = []; let x = 0;
    for (const raw of txt) {
      const ch = ACCENTS[raw] || raw;
      const g = GLYPHS[ch] || GLYPHS['?'];
      // trazo doble horizontal (negrita pixel, como la referencia)
      g.forEach((row, y) => [...row].forEach((c, i) => { if (c === '#') { px.push([x + i, y]); px.push([x + i + 1, y]); } }));
      x += g[0].length + 2;
    }
    return { w: Math.max(0, x - 1), h: 7, px };
  }
  function iconMask(name) {
    const rows = ICONS[name]; if (!rows) return null;
    const px = [];
    rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && px.push([x, y])));
    return { w: rows[0].length, h: rows.length, px };
  }

  // ---- dibujo de un estado ----
  // state: normal | hover | active | disabled
  function draw(mask, minW, col, state, textCol) {
    const padX = mask.icon ? 3 : mask.mixed ? 5 : 6, padY = 3;
    const W = Math.max(minW, mask.w + padX * 2 + 4);           // 4 = contorno(2) + columnas de bisel(2)
    const H = 1 + 1 + 2 + padY + mask.h + padY + 2 + 1;        // contorno, brillo, franja, ..., sombra, contorno
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const rect = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
    const pressed = state === 'active';
    const face = state === 'hover' ? col.hover : col.face;

    // contorno con esquinas escalonadas de 2 pasos
    rect(2, 0, W - 4, H, PAL.abyss); rect(1, 1, W - 2, H - 2, PAL.abyss); rect(0, 2, W, H - 4, PAL.abyss);
    // interior (también escalonado)
    const ix = 1, iy = 1, iw = W - 2, ih = H - 2;
    const inner = (y, h, color) => { rect(ix + 1, y, iw - 2, h, color); };
    rect(ix + 1, iy, iw - 2, ih, face); rect(ix, iy + 1, iw, ih - 2, face);

    if (!pressed) {
      inner(iy, 1, col.glint);                        // brillo de 1 px
      rect(ix, iy + 1, iw, 2, col.hi);                // franja clara
      rect(ix, iy + ih - 3, iw, 2, col.lo);           // sombra inferior
      inner(iy + ih - 1, 1, col.dark);                // último px más oscuro
      rect(ix, iy + 3, 1, ih - 6, col.hi);            // columna clara izquierda
      rect(ix + iw - 1, iy + 3, 1, ih - 6, col.lo);   // columna oscura derecha
      // tramado (dither) en la parte baja de la cara
      g.fillStyle = col.lo;
      for (let x = ix + 1; x < ix + iw - 1; x++) if (x % 2 === 0) g.fillRect(x, iy + ih - 4, 1, 1);
    } else {
      inner(iy, 1, col.dark);                          // sombra interior arriba: se "hunde"
      rect(ix, iy + 1, iw, 1, col.lo);
      rect(ix, iy + 2, 1, ih - 3, col.lo);
      inner(iy + ih - 1, 1, col.lo);
    }

    // contenido (texto o icono)
    const ox = Math.floor((W - mask.w) / 2);
    const oy = 1 + 1 + 2 + padY + (pressed ? 1 : 0);
    g.fillStyle = textCol;
    for (const [x, y] of mask.px) g.fillRect(ox + x, oy + y, 1, 1);
    return { url: c.toDataURL(), W, H };
  }

  function render(btn) {
    const size = btn.dataset.size || 'md';
    const s = SCALE[size] || 4;
    const variant = VARIANTS[btn.dataset.variant] || VARIANTS.blue;
    const icon = btn.dataset.icon;
    let mask;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent.trim();
    const label = btn.dataset.label;
    if (icon && label) {                                   // icono + texto (el texto, centrado en la altura del icono)
      const im = iconMask(icon), tm = textMask(label.toUpperCase()), off = im.w + 5;
      mask = { w: off + tm.w, h: im.h, mixed: true, px: im.px.concat(tm.px.map(([x, y]) => [x + off, y + 1])) };
    } else if (icon) { mask = iconMask(icon); mask.icon = true; }
    else mask = textMask(label.toUpperCase());
    const minW = Math.max(icon && !label ? mask.h + 3 * 2 + 4 + 2 : 0, +btn.dataset.minw || 0);   // data-minw: ancho mínimo en px de arte (botones de igual ancho)
    const text = variant.text || PAL.abyss;
    const imgs = {
      normal: draw(mask, minW, variant, 'normal', text),
      hover: draw(mask, minW, variant, 'hover', text),
      active: draw(mask, minW, variant, 'active', text),
      disabled: draw(mask, minW, DISABLED, 'normal', DISABLED.text),
    };
    const st = btn.style;
    st.setProperty('--px-s', s + 'px');
    st.width = imgs.normal.W * s + 'px';
    st.height = imgs.normal.H * s + 'px';
    for (const k in imgs) st.setProperty('--img-' + k, `url(${imgs[k].url})`);
    btn.classList.add('px-ready');
  }

  // ---- etiquetas de texto pixel: <span class="px-label" data-size="md" data-color="#51b4f5">TEXTO</span>
  function label(el) {
    if (!el.dataset.label) el.dataset.label = el.textContent.trim();
    const s = SCALE[el.dataset.size || 'md'] || 4;
    const m = textMask(el.dataset.label.toUpperCase());
    const c = document.createElement('canvas'); c.width = Math.max(1, m.w); c.height = m.h;
    const g = c.getContext('2d'); g.fillStyle = el.dataset.color || PAL.sky;
    for (const [x, y] of m.px) g.fillRect(x, y, 1, 1);
    el.setAttribute('aria-label', el.dataset.label);
    el.textContent = '';
    Object.assign(el.style, { display: 'inline-block', width: m.w * s + 'px', height: m.h * s + 'px',
      background: `url(${c.toDataURL()}) 0 0 / 100% 100% no-repeat`, imageRendering: 'pixelated', verticalAlign: 'middle' });
  }

  function renderAll(root = document) {
    root.querySelectorAll('.px-btn').forEach(render);
    root.querySelectorAll('.px-label').forEach(label);
  }

  window.PxButton = { render, renderAll, label, textMask, PAL };
  const go = () => renderAll();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
