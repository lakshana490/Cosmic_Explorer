(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var narrow = window.innerWidth < 700;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  /* ---------- 1. Typing Intro ---------- */
  var lines = window.COSMIC_CONFIG.introLines.map(function (item) {
    return { el: $(item.id), text: item.text, speed: item.speed, pause: item.pause };
  });
  var skipped = false;

  function paintLine(l, n, active) {
    var el = l.el;
    el.textContent = '';
    var a = document.createElement('span'); a.className = 't'; a.textContent = l.text.slice(0, n);
    var b = document.createElement('span'); b.className = 'ghost'; b.setAttribute('aria-hidden', 'true'); b.textContent = l.text.slice(n);
    el.appendChild(a); el.appendChild(b);
    el.classList.toggle('active', !!active);
  }
  function finishTyping() {
    skipped = true;
    lines.forEach(function (l) { paintLine(l, l.text.length, false); });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function runTyping() {
    lines.forEach(function (l) { paintLine(l, 0, false); });
    if (reduce) { finishTyping(); return; }
    await sleep(500);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      for (var n = 1; n <= l.text.length; n++) {
        if (skipped) return;
        paintLine(l, n, true);
        await sleep(l.speed + Math.random() * l.speed * 0.6);
      }
      paintLine(l, l.text.length, false);
      await sleep(l.pause);
    }
  }

  /* ---------- 2. 3D Renderer & Scene Setup ---------- */
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) { renderer = null; }
  if (!renderer || !renderer.getContext()) {
    $('nogl').style.display = 'block';
    $('loader').classList.add('off');
    finishTyping();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x02030a, 1);
  $('stage').appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 7000);

  /* ---------- 3. Procedural Fallback Textures ---------- */
  function h2(x, y) {
    var h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vn(x, y, px) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
    var a = h2(x0, yi), b = h2(x1, yi), c = h2(x0, yi + 1), d = h2(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, px, oct) {
    var s = 0, amp = 0.5, tot = 0;
    for (var i = 0; i < oct; i++) {
      s += vn(x, y, px) * amp; tot += amp;
      x *= 2; y *= 2; px *= 2; amp *= 0.5;
    }
    return s / tot;
  }
  var C = [0, 0, 0, 255];
  function set(r, g, b, a) { C[0] = r; C[1] = g; C[2] = b; C[3] = a === undefined ? 255 : a; }
  function mix(a, b, t) { return a + (b - a) * t; }
  function paint(w, h, fn) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'), im = x.createImageData(w, h), d = im.data, i = 0;
    for (var j = 0; j < h; j++) {
      var v = j / h;
      for (var k = 0; k < w; k++) { fn(k / w, v); d[i++] = C[0]; d[i++] = C[1]; d[i++] = C[2]; d[i++] = C[3]; }
    }
    x.putImageData(im, 0, 0);
    return c;
  }
  function craters(canvas, count, minR, maxR, seed) {
    var x = canvas.getContext('2d'), w = canvas.width, h = canvas.height, s = seed;
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    for (var i = 0; i < count; i++) {
      var cx = rnd() * w, cy = (0.12 + rnd() * 0.76) * h, r = minR + Math.pow(rnd(), 2.2) * (maxR - minR);
      var g = x.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,0.32)'); g.addColorStop(0.72, 'rgba(0,0,0,0.16)');
      g.addColorStop(0.86, 'rgba(255,255,255,0.20)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill();
    }
    return canvas;
  }
  function tex(canvas) {
    var t = new THREE.CanvasTexture(canvas);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  var painters = {
    sun: function () {
      return paint(512, 256, function (u, v) {
        var n = fbm(u * 8, v * 4, 8, 5), m = fbm(u * 24, v * 12, 24, 3);
        var t = clamp(Math.pow(n * 1.15 + m * 0.35, 2.2), 0, 1);
        set(mix(235, 255, t), mix(105, 232, t), mix(15, 150, t * t));
      });
    },
    mercury: function () {
      var c = paint(512, 256, function (u, v) {
        var n = fbm(u * 10, v * 5, 10, 5), m = fbm(u * 48, v * 24, 48, 3);
        var g = 58 + n * 110 + m * 36;
        set(g * 1.03, g * 0.98, g * 0.92);
      });
      return craters(c, 150, 2, 16, 11);
    },
    venus: function () {
      return paint(512, 256, function (u, v) {
        var w = fbm(u * 4, v * 3, 4, 4);
        var n = fbm(u * 6 + w * 2.5, v * 5 + w * 1.5, 6, 5);
        var b = 0.5 + 0.5 * Math.sin(v * 22 + n * 5);
        var t = clamp(n * 0.7 + b * 0.3, 0, 1);
        set(mix(196, 246, t), mix(158, 222, t), mix(96, 160, t));
      });
    },
    earth: function () {
      return paint(1024, 512, function (u, v) {
        var lat = Math.abs(v - 0.5) * 2;
        var n = fbm(u * 5, v * 2.5, 5, 6) + (0.5 - lat) * 0.06;
        var m = fbm(u * 18, v * 9, 18, 4);
        if (lat > 0.9 + (m - 0.5) * 0.06) { set(238, 244, 248); return; }
        if (n > 0.535) {
          var dry = clamp((m - 0.38) * 2.4 - lat * 1.1 + 0.15, 0, 1);
          if (lat > 0.78) { set(mix(220, 245, m), mix(228, 248, m), mix(232, 250, m)); return; }
          set(mix(38, 164, dry) * (0.8 + m * 0.4), mix(92, 138, dry) * (0.8 + m * 0.4), mix(44, 84, dry) * (0.8 + m * 0.3));
        } else {
          var deep = clamp((0.535 - n) * 4.5, 0, 1);
          set(mix(34, 6, deep), mix(116, 34, deep), mix(158, 78, deep));
        }
      });
    },
    clouds: function () {
      return paint(1024, 512, function (u, v) {
        var w = fbm(u * 4, v * 3, 4, 3);
        var c = fbm(u * 7 + w, v * 4 + w, 7, 6);
        var a = smooth(0.52, 0.74, c);
        set(255, 255, 255, a * 225);
      });
    },
    moon: function () {
      var c = paint(256, 128, function (u, v) {
        var n = fbm(u * 8, v * 4, 8, 4), g = 100 + n * 90;
        set(g, g, g * 0.98);
      });
      return craters(c, 60, 2, 10, 5);
    },
    mars: function () {
      var c = paint(512, 256, function (u, v) {
        var lat = Math.abs(v - 0.5) * 2;
        var n = fbm(u * 6, v * 3, 6, 5), m = fbm(u * 30, v * 15, 30, 3);
        if (lat > 0.94) { set(244, 240, 236); return; }
        var t = smooth(0.34, 0.68, n);
        var r = mix(96, 214, t) * (0.9 + m * 0.2), g = mix(46, 132, t) * (0.9 + m * 0.2), b = mix(28, 88, t) * (0.9 + m * 0.2);
        set(r, g, b);
      });
      return craters(c, 50, 2, 12, 23);
    },
    jupiter: function () {
      return paint(1024, 512, function (u, v) {
        var w = fbm(u * 5, v * 16, 5, 4);
        var s = 0.5 + 0.5 * Math.sin(v * 3.14159 * 15 + w * 4.2);
        var f = fbm(u * 22, v * 40, 22, 3);
        var t = clamp(s * 0.75 + f * 0.35, 0, 1);
        var r, g, b;
        if (t < 0.4) { var k = t / 0.4; r = mix(150, 190, k); g = mix(96, 134, k); b = mix(66, 96, k); }
        else if (t < 0.7) { var k2 = (t - 0.4) / 0.3; r = mix(190, 232, k2); g = mix(134, 208, k2); b = mix(96, 172, k2); }
        else { var k3 = (t - 0.7) / 0.3; r = mix(232, 246, k3); g = mix(208, 236, k3); b = mix(172, 218, k3); }
        var du = (u - 0.3 + 1.5) % 1 - 0.5, dv = v - 0.64;
        var e = du * du / (0.07 * 0.07) + dv * dv / (0.04 * 0.04);
        if (e < 1) { var q = Math.pow(1 - e, 0.6); r = mix(r, 196, q * 0.9); g = mix(g, 84, q * 0.9); b = mix(b, 52, q * 0.9); }
        set(r, g, b);
      });
    },
    saturn: function () {
      return paint(512, 256, function (u, v) {
        var w = fbm(u * 4, v * 12, 4, 3);
        var s = 0.5 + 0.5 * Math.sin(v * 3.14159 * 11 + w * 2.4);
        var f = fbm(u * 18, v * 30, 18, 3);
        var t = clamp(s * 0.6 + f * 0.4, 0, 1);
        set(mix(196, 238, t), mix(172, 220, t), mix(120, 168, t));
      });
    },
    uranus: function () {
      return paint(512, 256, function (u, v) {
        var n = fbm(u * 6, v * 8, 6, 3);
        var b = 0.5 + 0.5 * Math.sin(v * 3.14159 * 7);
        var t = clamp(n * 0.5 + b * 0.3, 0, 1);
        set(mix(120, 176, t), mix(196, 232, t), mix(206, 238, t));
      });
    },
    neptune: function () {
      return paint(512, 256, function (u, v) {
        var w = fbm(u * 4, v * 8, 4, 3);
        var s = 0.5 + 0.5 * Math.sin(v * 3.14159 * 9 + w * 3);
        var f = fbm(u * 14 + w, v * 20, 14, 4);
        var t = clamp(s * 0.5 + f * 0.5, 0, 1);
        var r = mix(28, 78, t), g = mix(56, 120, t), b = mix(160, 232, t);
        var streak = smooth(0.74, 0.86, f) * 0.5;
        r = mix(r, 235, streak); g = mix(g, 240, streak); b = mix(b, 250, streak);
        var du = (u - 0.4), dv = v - 0.56, e = du * du / 0.0036 + dv * dv / 0.0016;
        if (e < 1) { var q = 1 - e; r = mix(r, 12, q * 0.7); g = mix(g, 28, q * 0.7); b = mix(b, 96, q * 0.7); }
        set(r, g, b);
      });
    }
  };

  /* ---------- 4. Star Field & Milky Way ---------- */
  function dotTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  var dot = dotTexture();
  var starGroup = new THREE.Group();
  scene.add(starGroup);
  var palette = [[155, 176, 255], [190, 205, 255], [236, 240, 255], [255, 247, 238], [255, 232, 204], [255, 208, 160], [255, 178, 130]];
  var palW = [0.07, 0.1, 0.2, 0.26, 0.2, 0.12, 0.05];
  function pickColor() {
    var r = Math.random(), a = 0;
    for (var i = 0; i < palette.length; i++) { a += palW[i]; if (r <= a) return palette[i]; }
    return palette[3];
  }
  function addStars(n, size, minB, maxB) {
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * 6.2832, r = Math.sqrt(1 - u * u);
      pos[i * 3] = r * Math.cos(th) * 3000; pos[i * 3 + 1] = u * 3000; pos[i * 3 + 2] = r * Math.sin(th) * 3000;
      var c = pickColor(), b = minB + Math.random() * (maxB - minB);
      col[i * 3] = c[0] / 255 * b; col[i * 3 + 1] = c[1] / 255 * b; col[i * 3 + 2] = c[2] / 255 * b;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.PointsMaterial({ size: size, map: dot, vertexColors: true, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    var p = new THREE.Points(g, m); p.frustumCulled = false; starGroup.add(p);
  }
  addStars(narrow ? 3500 : 7000, 2.2, 0.35, 0.9);
  addStars(narrow ? 500 : 1100, 3.6, 0.6, 1.0);
  addStars(narrow ? 40 : 90, 7, 0.85, 1.0);

  var mwObjs = [];
  (function milkyWay() {
    var axis = new THREE.Vector3(0.5, 0.82, 0.12).normalize();
    var e1 = new THREE.Vector3(1, 0, 0).cross(axis).normalize();
    var e2 = axis.clone().cross(e1).normalize();
    var n = narrow ? 5000 : 15000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 0.55; }
    for (var i = 0; i < n; i++) {
      var t = Math.random() * 6.2832, g = gauss() * 0.34;
      var d = e1.clone().multiplyScalar(Math.cos(t)).add(e2.clone().multiplyScalar(Math.sin(t))).add(axis.clone().multiplyScalar(g)).normalize();
      var dens = 0.5 + 0.5 * Math.sin(t * 3 + 1.2);
      var b = (0.25 + Math.random() * 0.5) * (0.6 + dens * 0.6);
      var warm = Math.random() < 0.55;
      pos[i * 3] = d.x * 2990; pos[i * 3 + 1] = d.y * 2990; pos[i * 3 + 2] = d.z * 2990;
      col[i * 3] = (warm ? 1.0 : 0.72) * b; col[i * 3 + 1] = (warm ? 0.88 : 0.8) * b; col[i * 3 + 2] = (warm ? 0.72 : 1.0) * b;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, map: dot, vertexColors: true, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; starGroup.add(pts); mwObjs.push(pts);
    for (var k = 0; k < 44; k++) {
      var a = k / 44 * 6.2832;
      var dir = e1.clone().multiplyScalar(Math.cos(a)).add(e2.clone().multiplyScalar(Math.sin(a))).add(axis.clone().multiplyScalar((Math.random() - 0.5) * 0.12)).normalize();
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: k % 3 === 0 ? 0xbcc8ee : 0xffe2c0, transparent: true, opacity: 0.05 + Math.random() * 0.035, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.copy(dir.multiplyScalar(2800)); sp.scale.setScalar(820 + Math.random() * 420); starGroup.add(sp); mwObjs.push(sp);
    }
  })();

  /* ---------- 5. Sun & Planets ---------- */
  var SUN_R = window.COSMIC_CONFIG.sunRadius;
  var sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 48), new THREE.MeshBasicMaterial({ map: tex(painters.sun()) }));
  scene.add(sun);
  var sunGlows = [];
  [[78, 0xffb25a, 0.55], [190, 0xff8a3a, 0.22], [420, 0xff7a2a, 0.08]].forEach(function (g) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: g[1], transparent: true, opacity: g[2], depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(g[0] * 1.6); s.userData.o = g[2]; sunGlows.push(s); scene.add(s);
  });
  scene.add(new THREE.PointLight(0xfff0dc, 2.3, 0, 0));
  scene.add(new THREE.AmbientLight(0x1a2033, 1.0));

  var atmMat = function (color, power) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power || 3 } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uPower; varying vec3 vN; varying vec3 vP; void main(){ vec3 V = normalize(cameraPosition - vP); vec3 S = normalize(-vP); float rim = pow(1.0 - max(dot(normalize(vN), V), 0.0), uPower); float lit = smoothstep(-0.25, 0.55, dot(normalize(vN), S)); float a = rim * lit; gl_FragColor = vec4(uColor * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
  };

  var K = window.COSMIC_CONFIG.orbitSpeedFactor;
  var planets = [];
  window.PLANET_DEFS.forEach(function (d) {
    var group = new THREE.Group();
    var tilt = new THREE.Group(); tilt.rotation.z = d.tilt; group.add(tilt); d.tiltGroup = tilt;
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(d.r, 64, 48), new THREE.MeshStandardMaterial({ map: tex(painters[d.tex]()), roughness: 0.95, metalness: 0 }));
    tilt.add(mesh);
    if (d.clouds) {
      var cm = new THREE.Mesh(new THREE.SphereGeometry(d.r * 1.012, 64, 48), new THREE.MeshStandardMaterial({ map: tex(painters.clouds()), transparent: true, roughness: 1, depthWrite: false }));
      tilt.add(cm); d.cloudMesh = cm;
    }
    if (d.glow) { var gl = new THREE.Mesh(new THREE.SphereGeometry(d.r * 1.07, 48, 32), atmMat(d.glow[0], d.glow[1])); group.add(gl); }
    if (d.rings) {
      var inner = d.r * 1.3, outer = d.r * 2.35;
      var rg = new THREE.RingGeometry(inner, outer, 160, 1);
      var p = rg.attributes.position, uv = rg.attributes.uv;
      for (var i = 0; i < p.count; i++) { var rr = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (rr - inner) / (outer - inner), 0.5); }
      var rc = document.createElement('canvas'); rc.width = 512; rc.height = 4;
      var rx = rc.getContext('2d'), im = rx.createImageData(512, 4);
      for (var x = 0; x < 512; x++) {
        var t = x / 512, den;
        if (t < 0.08) den = 0.05 + t * 3; else if (t < 0.3) den = 0.3 + 0.1 * Math.sin(t * 90);
        else if (t < 0.56) den = 0.88 + 0.1 * Math.sin(t * 140); else if (t < 0.62) den = 0.04;
        else if (t < 0.93) den = 0.62 + 0.14 * Math.sin(t * 110); else den = Math.max(0, (1 - t) * 6);
        den = clamp(den, 0, 1);
        var shade = 0.82 + 0.18 * Math.sin(t * 60 + 1);
        for (var y = 0; y < 4; y++) { var o = (y * 512 + x) * 4; im.data[o] = 214 * shade; im.data[o + 1] = 194 * shade; im.data[o + 2] = 152 * shade; im.data[o + 3] = den * 235; }
      }
      rx.putImageData(im, 0, 0);
      var rt = new THREE.CanvasTexture(rc); rt.encoding = THREE.sRGBEncoding;
      rg.rotateX(-Math.PI / 2);
      var rm = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, roughness: 1, depthWrite: false }));
      tilt.add(rm); d.ringMesh = rm;
    }
    if (d.moon) {
      var moon = new THREE.Mesh(new THREE.SphereGeometry(1.25, 32, 24), new THREE.MeshStandardMaterial({ map: tex(painters.moon()), roughness: 1 }));
      group.add(moon); d.moonMesh = moon;
    }
    d.group = group; d.mesh = mesh; d.omega = K / Math.pow(d.a, 1.5);
    scene.add(group);
    planets.push(d);

    var pts = [];
    for (var s = 0; s <= 256; s++) { var an = s / 256 * 6.2832; pts.push(new THREE.Vector3(Math.cos(an) * d.a, 0, Math.sin(an) * d.a)); }
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8a97b4, transparent: true, opacity: 0.28 }));
    scene.add(line);

    var lab = document.createElement('div'); lab.className = 'plabel'; lab.textContent = d.name.toUpperCase();
    document.body.appendChild(lab); d.label = lab;
  });

  // Asteroid belt
  (function () {
    var n = narrow ? 1800 : 4200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, r = 96 + (Math.random() + Math.random() + Math.random()) / 3 * 22;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (Math.random() - 0.5) * 3.2; pos[i * 3 + 2] = Math.sin(a) * r;
      var b = 0.3 + Math.random() * 0.5;
      col[i * 3] = b * 0.82; col[i * 3 + 1] = b * 0.74; col[i * 3 + 2] = b * 0.66;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var belt = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, map: dot, vertexColors: true, sizeAttenuation: false, transparent: true, depthWrite: false }));
    belt.frustumCulled = false; scene.add(belt); window.__belt = belt;
  })();

  /* ---------- 6. Sun, Moon & Asteroid Belt Bodies ---------- */
  var moonAng = 0, sunDim = 0, rocksVis = 0;
  var BELT_A = 1.1, BELT_R = 107;
  var beltU = new THREE.Vector3(Math.cos(BELT_A), 0, Math.sin(BELT_A)), beltW = new THREE.Vector3(-Math.sin(BELT_A), 0, Math.cos(BELT_A));
  var beltAnchor = beltU.clone().multiplyScalar(BELT_R);
  var rockGroup = new THREE.Group(); rockGroup.position.copy(beltAnchor); rockGroup.visible = false; rockGroup.scale.setScalar(0.001); scene.add(rockGroup);
  (function () {
    var g = new THREE.IcosahedronGeometry(1, 2), pa = g.attributes.position;
    function hash(x, y, z) { var v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return v - Math.floor(v); }
    for (var i = 0; i < pa.count; i++) {
      var x = Math.round(pa.getX(i) * 100) / 100, y = Math.round(pa.getY(i) * 100) / 100, z = Math.round(pa.getZ(i) * 100) / 100;
      var f = 0.72 + hash(x, y, z) * 0.5; pa.setXYZ(i, pa.getX(i) * f, pa.getY(i) * f, pa.getZ(i) * f);
    }
    g.computeVertexNormals();
    var N = narrow ? 260 : 560, im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true }), N);
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color(), n = 0, guard = 0;
    while (n < N && guard++ < 4000) {
      var rho = -10 + Math.random() * 24, tau = (Math.random() * 2 - 1) * 42, yy = (Math.random() + Math.random() + Math.random() - 1.5) * 3.8;
      if (Math.hypot(rho + 18, tau - 30) < 8) continue;
      var size = 0.2 + Math.pow(Math.random(), 4) * 1.7;
      pos.copy(beltU).multiplyScalar(rho).addScaledVector(beltW, tau); pos.y = yy;
      e.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28); q.setFromEuler(e);
      sc.set(size * (0.7 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.5), size * (0.7 + Math.random() * 0.6));
      m.compose(pos, q, sc); im.setMatrixAt(n, m);
      var b = 0.3 + Math.random() * 0.3, warm = Math.random();
      c.setRGB(b * (0.95 + warm * 0.15), b * (0.88 + warm * 0.05), b * (0.8 - warm * 0.08)); im.setColorAt(n, c);
      n++;
    }
    im.count = n; im.frustumCulled = false; rockGroup.add(im);
  })();

  var earthD = planets.filter(function (q) { return q.name === 'Earth'; })[0];
  var sunBody = { name: 'Sun', isSun: true, r: SUN_R, group: sun, mesh: sun, tiltGroup: sun, fact: 'Our star. It holds 99.8% of all the mass in the Solar System.' };
  var moonBody = { name: 'Moon', isMoon: true, r: 1.25, group: earthD.moonMesh, mesh: earthD.moonMesh, tiltGroup: earthD.moonMesh, userYaw: 0, minHit: 11, fact: 'Earth’s only natural satellite, 384,400 km away.' };
  var beltBody = { name: 'Asteroid Belt', isBelt: true, r: 8, group: rockGroup, mesh: rockGroup, tiltGroup: rockGroup, anchor: beltAnchor, u: beltU, w: beltW, fact: 'Over a million known rocks between Mars and Jupiter.' };
  function byName(n) { return planets.filter(function (q) { return q.name === n; })[0]; }
  var bodies = [sunBody, byName('Mercury'), byName('Venus'), byName('Earth'), moonBody, byName('Mars'), beltBody, byName('Jupiter'), byName('Saturn'), byName('Uranus'), byName('Neptune')];

  [[sunBody, 'SUN'], [beltBody, 'ASTEROID BELT']].forEach(function (a) {
    var lab = document.createElement('div'); lab.className = 'plabel'; lab.textContent = a[1]; document.body.appendChild(lab); a[0].label = lab;
  });
  sunBody.labelBelow = true;
  var beltSamples = [];
  for (var bs = 0; bs < 180; bs++) { var ba = bs / 180 * 6.2832; beltSamples.push(new THREE.Vector3(Math.cos(ba) * BELT_R, 0, Math.sin(ba) * BELT_R)); }

  /* ---------- 7. Load Real Textures from tex/ ---------- */
  (function () {
    var loader = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    function load(url, cb) {
      loader.load(url, function (t) { t.encoding = THREE.sRGBEncoding; t.anisotropy = aniso; cb(t); }, undefined, function () {});
    }
    function swap(mat, key, t) { if (mat[key] && mat[key] !== t) mat[key].dispose(); mat[key] = t; mat.needsUpdate = true; }
    var files = { Mercury: 'mercury.jpg', Venus: 'venus_atmosphere.jpg', Earth: 'earth_day.jpg', Mars: 'mars.jpg', Jupiter: 'jupiter.jpg', Saturn: 'saturn.jpg', Uranus: 'uranus.jpg', Neptune: 'neptune.jpg' };
    planets.forEach(function (d) {
      load('tex/' + files[d.name], function (t) { swap(d.mesh.material, 'map', t); });
      if (d.name === 'Earth') {
        load('tex/earth_lights.jpg', function (t) {
          var m = d.mesh.material; m.emissiveMap = t; m.emissive = new THREE.Color(1.0, 0.82, 0.55); m.emissiveIntensity = 0.9; m.needsUpdate = true;
        });
        load('tex/earth_clouds.png', function (t) { swap(d.cloudMesh.material, 'map', t); });
      }
      if (d.name === 'Saturn') load('tex/saturn_ring.png', function (t) { swap(d.ringMesh.material, 'map', t); });
      if (d.moonMesh) load('tex/moon.jpg', function (t) { swap(d.moonMesh.material, 'map', t); });
    });
    load('tex/sun.jpg', function (t) { swap(sun.material, 'map', t); });
    load('tex/milkyway.jpg', function (t) {
      var sky = new THREE.Mesh(new THREE.SphereGeometry(3300, 64, 32), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, color: new THREE.Color(2.4, 2.4, 2.4) }));
      sky.renderOrder = -2; sky.frustumCulled = false; starGroup.add(sky);
      mwObjs.forEach(function (o) { o.visible = false; });
    });
  })();

  /* ---------- 8. Camera, Scroll & Pointer Controls ---------- */
  var P0 = new THREE.Vector3(150, 46, 640), T0 = new THREE.Vector3(-118, 0, 0);
  var P1 = new THREE.Vector3(0, 235, 300), T1 = new THREE.Vector3(0, 0, 4);
  var pRaw = 0, pS = 0, pointer = { x: 0, y: 0, px: -999, py: -999, down: false };

  function readScroll() {
    if (mode === 'planet') return;
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    pRaw = clamp(window.scrollY / max, 0, 1);
    if (pRaw > 0.02 && !skipped) finishTyping();
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX / window.innerWidth * 2 - 1; pointer.y = e.clientY / window.innerHeight * 2 - 1;
    pointer.px = e.clientX; pointer.py = e.clientY;
  }, { passive: true });
  window.addEventListener('pointerdown', function (e) { pointer.px = e.clientX; pointer.py = e.clientY; }, { passive: true });
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    readScroll();
  });
  $('skip').addEventListener('click', function () {
    finishTyping();
    var max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max, behavior: reduce ? 'auto' : 'smooth' });
  });

  /* ---------- 9. Planet Page State & Navigation ---------- */
  var mode = 'overview', focusIdx = -1, tr = 1, trDur = 2.4, uiIdx = -1;
  var pm = 0, orbitSpeed = 1, orbT = 0, drag = null;
  var zoom = 1, zoomT = 1, settled = false, settleTime = 0;
  var ry = 0, rp = 0, ryT = 0, rpT = 0, ovDrag = null, dragDist = 0, hasDragged = false;
  var from = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  var curTgt = T0.clone(), toPos = new THREE.Vector3(), toTgt = new THREE.Vector3();
  var vS = new THREE.Vector3(), vF = new THREE.Vector3(), vR = new THREE.Vector3(), vC = new THREE.Vector3(), vP = new THREE.Vector3(), vUp = new THREE.Vector3(0, 1, 0);
  var pui = $('pui');

  var PD = window.PLANET_DATA;
  var ROW_LABELS = window.DEFAULT_ROW_LABELS;

  function overviewPose(ev, p, t) {
    p.lerpVectors(P0, P1, ev); t.lerpVectors(T0, T1, ev);
    var rk = smooth(0.5, 0.85, pS);
    if (rk > 0.001 && (ry !== 0 || rp !== 0)) {
      var vx = p.x - t.x, vy = p.y - t.y, vz = p.z - t.z, r = Math.sqrt(vx * vx + vy * vy + vz * vz);
      var yaw = Math.atan2(vx, vz) + ry * rk, pitch = clamp(Math.asin(vy / r) + rp * rk, -1.48, 1.48);
      p.set(t.x + r * Math.cos(pitch) * Math.sin(yaw), t.y + r * Math.sin(pitch), t.z + r * Math.cos(pitch) * Math.cos(yaw));
    }
    var drift = reduce ? 0 : 1;
    p.x += (pointer.x * 14 + Math.sin(time * 0.07) * 8 * drift) * (1 - ev * 0.5);
    p.y += (-pointer.y * 8 + Math.cos(time * 0.05) * 4 * drift);
  }
  function planetPose(idx, p, t) {
    var d = bodies[idx], asp = window.innerWidth / window.innerHeight, portrait = asp < 0.9;
    var tf0 = Math.tan(camera.fov * Math.PI / 360);
    if (d.isBelt) {
      p.copy(d.anchor).addScaledVector(d.u, -18 * zoom).addScaledVector(d.w, 30 * zoom); p.y += 4 * zoom;
      t.copy(d.anchor).addScaledVector(d.u, 6);
      vF.copy(t).sub(p).normalize(); vR.crossVectors(vF, vUp).normalize();
      var bh = p.distanceTo(d.anchor) * tf0;
      if (portrait) { vC.crossVectors(vR, vF); t.addScaledVector(vC, -0.5 * bh); } else t.addScaledVector(vR, -0.4 * bh * asp);
      p.x += pointer.x * 1.2; p.y += -pointer.y * 0.9;
      return;
    }
    var dist = portrait ? d.r * (d.rings ? 2.4 : 1.0) / (0.62 * tf0 * asp) : d.r * (d.rings ? 4.8 : 2.95);
    dist *= zoom;
    d.group.getWorldPosition(vP);
    if (d.isSun) vS.set(0.35, 0, 0.94).normalize(); else vS.copy(vP).multiplyScalar(-1).normalize();
    for (var k = 0; k < 2; k++) {
      vF.copy(vS).applyAxisAngle(vUp, k === 0 ? 0.95 : -0.95);
      p.copy(vP).addScaledVector(vF, dist); p.y += dist * 0.1;
      vF.copy(vP).sub(p).normalize();
      vR.crossVectors(vF, vUp).normalize();
      if (vS.dot(vR) < 0) break;
    }
    var tf = Math.tan(camera.fov * Math.PI / 360), halfH = dist * tf, halfW = halfH * asp;
    t.copy(vP);
    if (portrait) { vC.crossVectors(vR, vF); t.addScaledVector(vC, -0.55 * halfH); }
    else { t.addScaledVector(vR, -(d.rings ? 0.38 : 0.52) * halfW); }
    p.x += pointer.x * dist * 0.02; p.y += -pointer.y * dist * 0.015;
  }
  function startTransition(newMode, idx, dur) {
    from.pos.copy(camera.position); from.tgt.copy(curTgt);
    mode = newMode; focusIdx = idx; tr = 0; trDur = dur; uiIdx = -1; settled = false; zoomT = 1;
  }
  function lockScroll(on) { document.body.classList.toggle('in-planet', on); }
  function showData(on) {
    pui.classList.toggle('data', !!on);
    $('p-explore').setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function enterPlanet(i) { if (i < 0 || mode !== 'overview') return; showData(false); lockScroll(true); startTransition('planet', i, 2.6); }
  function exitPlanet() {
    if (mode !== 'planet') return;
    showData(false); lockScroll(false);
    window.scrollTo(0, document.documentElement.scrollHeight); pRaw = 1; pS = 1;
    startTransition('overview', -1, 2.2);
  }
  function zoomBy(f) {
    if (mode !== 'planet' || !settled) return;
    zoomT = clamp(zoomT * f, 0.55, 1.6);
    if (zoomT > 1.3) exitPlanet();
  }
  function goPlanet(j) { if (mode !== 'planet' || j === focusIdx || tr < 0.5) return; showData(false); startTransition('planet', j, 1.9); }
  function fillPlanet(i) {
    var d = bodies[i], P = PD[d.name], n = bodies.length;
    $('p-eyebrow').textContent = 'LEVEL 01 · ' + P.type;
    pui.classList.toggle('scrim', !!d.isBelt);
    $('p-name').textContent = d.name; $('p-name').style.fontSize = d.name.length > 8 ? 'clamp(52px, 9vw, 124px)' : '';
    $('p-tot').textContent = (n < 10 ? '0' : '') + n; $('p-tag').textContent = P.tag || 'MEASURED';
    $('p-src').textContent = P.src || 'Source: NASA Planetary Fact Sheet';
    $('p-note').textContent = P.note || 'Moon counts keep growing as astronomers find new ones. Temperatures for the giant planets are measured at the 1 bar pressure level.';
    $('p-sub').textContent = P.sub; $('p-story').textContent = P.story;
    for (var j = 0; j < 3; j++) { $('s' + j + 'v').textContent = P.stats[j][0]; $('s' + j + 'l').textContent = P.stats[j][1]; }
    $('p-cur').textContent = (i < 9 ? '0' : '') + (i + 1);
    var rows = $('p-rows'); rows.textContent = '';
    for (var r = 0; r < ROW_LABELS.length; r++) {
      var row = document.createElement('div'); row.className = 'row';
      var l = document.createElement('span'); l.textContent = (P.labels || ROW_LABELS)[r];
      var v = document.createElement('b'); v.textContent = P.rows[r];
      row.appendChild(l); row.appendChild(v); rows.appendChild(row);
    }
    var pv = bodies[(i + n - 1) % n].name, nx = bodies[(i + 1) % n].name;
    $('p-prev-name').textContent = pv.toUpperCase(); $('p-next-name').textContent = nx.toUpperCase();
    $('p-prev').setAttribute('aria-label', 'Previous: ' + pv); $('p-next').setAttribute('aria-label', 'Next: ' + nx);
    bodies.forEach(function (q, k) { q.dash.classList.toggle('cur', k === i); if (k === i) q.dash.setAttribute('aria-current', 'true'); else q.dash.removeAttribute('aria-current'); });
  }

  (function wirePlanetUi() {
    var wrap = $('pg-dashes');
    bodies.forEach(function (d, j) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'dash'; b.setAttribute('aria-label', 'Go to ' + d.name);
      b.appendChild(document.createElement('i'));
      b.addEventListener('click', function () { goPlanet(j); });
      wrap.appendChild(b); d.dash = b;
    });
    $('p-explore').addEventListener('click', function () { showData(true); });
    $('p-story-btn').addEventListener('click', function () { showData(false); });
    $('p-back').addEventListener('click', exitPlanet);
    $('p-back2').addEventListener('click', exitPlanet);
    $('p-prev').addEventListener('click', function () { goPlanet((focusIdx + bodies.length - 1) % bodies.length); });
    $('p-next').addEventListener('click', function () { goPlanet((focusIdx + 1) % bodies.length); });
    window.addEventListener('keydown', function (e) {
      if (mode !== 'planet') return;
      if (e.key === 'Escape') { if (pui.classList.contains('data')) showData(false); else exitPlanet(); }
      else if (e.key === 'ArrowRight') goPlanet((focusIdx + 1) % bodies.length);
      else if (e.key === 'ArrowLeft') goPlanet((focusIdx + bodies.length - 1) % bodies.length);
    });
    var ptrs = new Map(), lastPinch = 0;
    window.addEventListener('pointerdown', function (e) {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragDist = 0;
      if (ptrs.size === 2) {
        drag = null; ovDrag = null;
        var a = Array.from(ptrs.values()); lastPinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        return;
      }
      if (e.target !== renderer.domElement) return;
      if (mode === 'planet' && tr >= 1) drag = { x: e.clientX, y: e.clientY };
      else if (mode === 'overview' && tr >= 1 && pS > 0.6) ovDrag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', function (e) {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2 && mode === 'planet') {
        var a = Array.from(ptrs.values()), dd = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (lastPinch > 0 && dd > 0) zoomBy(lastPinch / dd);
        lastPinch = dd; return;
      }
      if (ovDrag && mode === 'overview') {
        var ox = e.clientX - ovDrag.x, oy = e.clientY - ovDrag.y;
        ovDrag.x = e.clientX; ovDrag.y = e.clientY; dragDist += Math.abs(ox) + Math.abs(oy); if (dragDist > 30) hasDragged = true;
        ryT += ox * 0.006;
        rpT = clamp(rpT - oy * 0.005, -2.3, 1.0);
        return;
      }
      if (!drag || mode !== 'planet' || focusIdx < 0) return;
      var f = bodies[focusIdx], dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (f.userYaw !== undefined) f.userYaw += dx * 0.006; else f.mesh.rotation.y += dx * 0.006;
      f.tiltGroup.rotation.x = clamp(f.tiltGroup.rotation.x + dy * 0.004, -0.8, 0.8);
    });
    window.addEventListener('wheel', function (e) {
      if (mode !== 'planet') return;
      e.preventDefault();
      if (!settled || time - settleTime < 0.9) return;
      zoomBy(Math.exp(clamp(e.deltaY, -120, 120) * 0.0014));
    }, { passive: false });
    $('z-in').addEventListener('click', function () { zoomBy(1 / 1.25); });
    $('z-out').addEventListener('click', function () { zoomBy(1.25); });
    $('v-reset').addEventListener('click', function () { ryT = Math.round(ryT / 6.2832) * 6.2832; rpT = 0; });
    $('v-top').addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
    var endDrag = function (e) { drag = null; ovDrag = null; if (e && e.pointerId !== undefined) ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = 0; };
    window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
    window.cosmicExplorer = { state: function () { return { mode: mode, tr: tr, zoomT: zoomT, ry: ryT, rp: rpT }; }, open: function (name) { var i = bodies.findIndex(function (q) { return q.name.toLowerCase() === String(name).toLowerCase(); }); if (i >= 0) { if (mode === 'planet') goPlanet(i); else { window.scrollTo(0, document.documentElement.scrollHeight); pRaw = 1; pS = 1; enterPlanet(i); } } }, close: exitPlanet };
  })();

  /* ---------- 10. Hover & Click Projection ---------- */
  var hovered = null, toastTimer = 0;
  function showToast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }
  window.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('button')) return;
    pointer.px = e.clientX; pointer.py = e.clientY;
    if (mode !== 'overview' || tr < 1 || dragDist > 6) return;
    updateHover(true);
    if (hovered && pS > 0.6) enterPlanet(bodies.indexOf(hovered));
  });

  var tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  var screenInfo = [];
  function project() {
    var w = window.innerWidth, h = window.innerHeight, tf = Math.tan(camera.fov * Math.PI / 360);
    for (var i = 0; i < bodies.length; i++) {
      var d = bodies[i];
      d.group.getWorldPosition(tmp);
      var dist = tmp.distanceTo(camera.position);
      tmp2.copy(tmp).project(camera);
      var rpx = d.r / (dist * tf) * (h / 2);
      var sx = (tmp2.x * 0.5 + 0.5) * w, sy = (-tmp2.y * 0.5 + 0.5) * h, vis = tmp2.z < 1 && Math.abs(tmp2.x) < 1.1 && Math.abs(tmp2.y) < 1.1;
      if (d.isBelt) rpx = 3;
      screenInfo[i] = { x: sx, y: sy, r: rpx, vis: vis, lr: rpx };
    }
  }
  function beltHit(i) {
    var w = window.innerWidth, h = window.innerHeight, bd = 26, bx = 0, by = 0, found = false;
    for (var k = 0; k < beltSamples.length; k++) {
      tmp.copy(beltSamples[k]).project(camera);
      if (tmp.z >= 1) continue;
      var x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h, dd = Math.hypot(pointer.px - x, pointer.py - y);
      if (dd < bd) { bd = dd; bx = x; by = y; found = true; }
    }
    if (found) { var s = screenInfo[i]; s.x = bx; s.y = by; s.r = 14; s.vis = true; }
    return found;
  }
  function updateHover() {
    var best = null, bd = 1e9;
    if (pS > 0.6 && mode === 'overview' && tr >= 1) {
      for (var i = 0; i < bodies.length; i++) {
        if (bodies[i].isBelt) continue;
        var s = screenInfo[i]; if (!s || !s.vis) continue;
        var dx = pointer.px - s.x, dy = pointer.py - s.y, dd = Math.sqrt(dx * dx + dy * dy);
        var hit = Math.max(s.r + 12, bodies[i].minHit || 22);
        if (dd < hit && dd < bd) { bd = dd; best = i; }
      }
      if (best === null) { var bi = bodies.indexOf(beltBody); if (beltHit(bi)) best = bi; }
    }
    hovered = best === null ? null : bodies[best];
    hovered && (hovered._i = best);
  }

  /* ---------- 11. Main Animation Loop ---------- */
  var ring = $('ring'), tip = $('tip');
  var clock = new THREE.Clock(), time = 0;

  function frame() {
    var dt = Math.min(clock.getDelta(), 0.05); time += dt;
    readScroll();
    pS += (pRaw - pS) * (1 - Math.exp(-dt * (reduce ? 14 : 4.2)));
    var e = ease(clamp(pS, 0, 1));
    var inPlanet = mode === 'planet';
    pm += ((inPlanet ? 1 : 0) - pm) * (1 - Math.exp(-dt * 5));
    orbitSpeed += ((inPlanet ? 0 : 1) - orbitSpeed) * (1 - Math.exp(-dt * 5));
    orbT += dt * orbitSpeed; moonAng += dt * 1.6 * orbitSpeed;
    var fb = inPlanet ? bodies[focusIdx] : null;
    sunDim += ((fb && fb.isSun ? 1 : 0) - sunDim) * (1 - Math.exp(-dt * 3));
    rocksVis += ((fb && fb.isBelt ? 1 : 0) - rocksVis) * (1 - Math.exp(-dt * 2.5));
    sunGlows.forEach(function (g) { g.material.opacity = g.userData.o * (1 - 0.82 * sunDim); });
    rockGroup.visible = rocksVis > 0.01; rockGroup.scale.setScalar(Math.max(0.001, rocksVis));
    zoom += (zoomT - zoom) * (1 - Math.exp(-dt * 6));
    if (mode === 'overview' && pS < 0.5) {
      ryT += (Math.round(ryT / 6.2832) * 6.2832 - ryT) * (1 - Math.exp(-dt * 3)); rpT += (0 - rpT) * (1 - Math.exp(-dt * 3));
    }
    ry += (ryT - ry) * (1 - Math.exp(-dt * 7)); rp += (rpT - rp) * (1 - Math.exp(-dt * 7));

    for (var i = 0; i < planets.length; i++) {
      var d = planets[i], a = d.ang + orbT * d.omega;
      d.group.position.set(Math.cos(a) * d.a, 0, Math.sin(a) * d.a);
      d.mesh.rotation.y += dt * d.spin * 0.25 * (inPlanet ? 0.6 : 1);
      if (d.cloudMesh) d.cloudMesh.rotation.y += dt * 0.05;
      if (d.moonMesh) { d.moonMesh.position.set(Math.cos(moonAng) * 8, 0.4, Math.sin(moonAng) * 8); d.moonMesh.rotation.y = Math.PI - moonAng + moonBody.userYaw; }
      if (d.tiltGroup && !(drag && focusIdx === i)) d.tiltGroup.rotation.x *= (1 - Math.min(1, dt * 1.5));
    }
    sun.rotation.y += dt * 0.02;
    [sunBody, moonBody, beltBody].forEach(function (b) { if (!(drag && bodies[focusIdx] === b)) b.tiltGroup.rotation.x *= (1 - Math.min(1, dt * 1.5)); });

    if (inPlanet) planetPose(focusIdx, toPos, toTgt); else overviewPose(e, toPos, toTgt);
    if (tr < 1) tr = Math.min(1, tr + dt / trDur);
    if (tr >= 1 && !settled) { settled = true; settleTime = time; }
    var k = ease(tr);
    camera.position.lerpVectors(from.pos, toPos, k);
    curTgt.lerpVectors(from.tgt, toTgt, k);
    if (tr < 1) camera.position.y += Math.sin(Math.PI * k) * 26;
    camera.lookAt(curTgt);
    starGroup.position.copy(camera.position);
    starGroup.rotation.x = e * 0.45; starGroup.rotation.y = time * 0.0025 * (reduce ? 0 : 1);

    var th = Math.max(smooth(0.0, 0.28, pS), pm);
    $('hero').style.opacity = String(1 - th);
    $('hero').style.transform = 'translate3d(0,' + (-th * 70).toFixed(1) + 'px,0) scale(' + (1 - th * 0.04).toFixed(4) + ')';
    $('hero').style.visibility = th >= 1 ? 'hidden' : 'visible';
    $('veil').style.opacity = String(Math.max(1 - smooth(0.02, 0.3, pS), pm * 0.9));
    $('cue-a').style.opacity = String(Math.max(0, 1 - smooth(0.0, 0.1, pS) - pm));
    $('cue-b').style.opacity = String(smooth(0.72, 0.9, pS) * (1 - pm) * (hasDragged ? 0 : 1));
    var hud = smooth(0.45, 0.7, pS);
    $('brand').style.opacity = String(hud); $('level').style.opacity = String(hud * (1 - pm));
    $('skip').style.opacity = String(Math.max(0, 1 - smooth(0.5, 0.75, pS) - pm));
    $('skip').style.pointerEvents = (pS > 0.7 || pm > 0.2) ? 'none' : 'auto';
    var vb = smooth(0.8, 0.95, pS) * (1 - pm), vbEl = $('vbtns');
    vbEl.style.opacity = String(vb); vbEl.style.visibility = vb < 0.05 ? 'hidden' : 'visible';
    renderer.domElement.style.touchAction = (inPlanet || (mode === 'overview' && pS > 0.65)) ? 'none' : 'pan-y';

    var wantOn = inPlanet && tr > 0.55;
    if (wantOn) {
      if (uiIdx !== focusIdx) { fillPlanet(focusIdx); uiIdx = focusIdx; }
      if (!pui.classList.contains('on')) { pui.classList.add('on'); pui.inert = false; }
    } else if (pui.classList.contains('on')) { pui.classList.remove('on'); pui.inert = true; }

    project();
    updateHover();
    var showLabels = smooth(0.7, 0.92, pS) * (window.innerWidth >= 700 ? 1 : 0) * (1 - pm);
    for (var j = 0; j < bodies.length; j++) {
      var s = screenInfo[j], L = bodies[j].label;
      if (!L) continue;
      if (!s.vis) { L.style.opacity = '0'; continue; }
      var lx = s.x, ly = s.y, lr = s.lr !== undefined ? s.lr : s.r;
      if (bodies[j].isBelt) { tmp.copy(beltAnchor).project(camera); lx = (tmp.x * 0.5 + 0.5) * window.innerWidth; ly = (-tmp.y * 0.5 + 0.5) * window.innerHeight; lr = 3; }
      if (bodies[j].labelBelow) L.style.transform = 'translate(' + (lx - lr - 8).toFixed(1) + 'px,' + (ly - 7).toFixed(1) + 'px) translateX(-100%)';
      else L.style.transform = 'translate(' + (lx + lr + 8).toFixed(1) + 'px,' + (ly - 7).toFixed(1) + 'px)';
      L.style.opacity = String(showLabels * (hovered === bodies[j] ? 0 : 1));
    }
    if (hovered && pS > 0.6 && !inPlanet) {
      var hs = screenInfo[hovered._i], rr = Math.max(hs.r + 8, 18);
      ring.style.width = ring.style.height = (rr * 2).toFixed(0) + 'px';
      ring.style.transform = 'translate(' + (hs.x - rr).toFixed(1) + 'px,' + (hs.y - rr).toFixed(1) + 'px)';
      ring.style.opacity = '1';
      $('tip-name').textContent = hovered.name; $('tip-fact').textContent = hovered.fact;
      var tx = hs.x + rr + 14, ty = hs.y - 30;
      if (tx + 270 > window.innerWidth) tx = hs.x - rr - 274;
      tip.style.transform = 'translate(' + Math.max(8, tx).toFixed(0) + 'px,' + clamp(ty, 8, window.innerHeight - 110).toFixed(0) + 'px)';
      tip.style.opacity = '1';
      document.body.style.cursor = 'pointer';
    } else {
      ring.style.opacity = '0'; tip.style.opacity = '0';
      document.body.style.cursor = (inPlanet && tr >= 1) ? (drag ? 'grabbing' : 'grab') : (!inPlanet && pS > 0.7 && tr >= 1 ? (ovDrag ? 'grabbing' : 'grab') : '');
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  readScroll(); pS = pRaw;
  renderer.render(scene, camera);
  requestAnimationFrame(function () {
    $('loader').classList.add('off');
    runTyping();
    frame();
  });
})();