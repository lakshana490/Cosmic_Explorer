(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var narrow = window.innerWidth < 700;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  /* ---------- typing intro ---------- */
  var lines = [
    { el: $('l1'), text: 'WELCOME TO', speed: 70, pause: 350 },
    { el: $('l2'), text: 'Cosmic Explorer', speed: 70, pause: 450 },
    { el: $('l3'), text: 'A journey through the Solar System in 3D. Scroll down, choose a planet, and fly to it.', speed: 18, pause: 400 },
    { el: $('l4'), text: 'ONE STAR · EIGHT PLANETS · ONE JOURNEY', speed: 38, pause: 0 }
  ];
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
      paintLine(l, l.text.length, i === lines.length - 1 ? false : false);
      await sleep(l.pause);
    }
  }

  /* ---------- 3D scene ---------- */
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

  /* seamless value noise */
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
        var du = (u - 0.4) , dv = v - 0.56, e = du * du / 0.0036 + dv * dv / 0.0016;
        if (e < 1) { var q = 1 - e; r = mix(r, 12, q * 0.7); g = mix(g, 28, q * 0.7); b = mix(b, 96, q * 0.7); }
        set(r, g, b);
      });
    }
  };

  /* ---------- star field ---------- */
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

  /* ---------- sun ---------- */
  var SUN_R = 17;
  var sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 48), new THREE.MeshBasicMaterial({ map: tex(painters.sun()) }));
  scene.add(sun);
  var sunGlows = [];
  [[78, 0xffb25a, 0.55], [190, 0xff8a3a, 0.22], [420, 0xff7a2a, 0.08]].forEach(function (g) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: g[1], transparent: true, opacity: g[2], depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(g[0] * 1.6); s.userData.o = g[2]; sunGlows.push(s); scene.add(s);
  });
  scene.add(new THREE.PointLight(0xfff0dc, 2.3, 0, 0));
  scene.add(new THREE.AmbientLight(0x1a2033, 1.0));

  /* ---------- planets ---------- */
  var atmMat = function (color, power) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power || 3 } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uPower; varying vec3 vN; varying vec3 vP; void main(){ vec3 V = normalize(cameraPosition - vP); vec3 S = normalize(-vP); float rim = pow(1.0 - max(dot(normalize(vN), V), 0.0), uPower); float lit = smoothstep(-0.25, 0.55, dot(normalize(vN), S)); float a = rim * lit; gl_FragColor = vec4(uColor * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
  };
  var defs = [
    { name: 'Mercury', a: 32, r: 2.6, tex: 'mercury', ang: 0.6, tilt: 0.03, spin: 0.25, fact: 'The smallest planet. One year lasts 88 days.' },
    { name: 'Venus', a: 48, r: 4.4, tex: 'venus', ang: 2.4, tilt: 3.09, spin: -0.1, fact: 'The hottest surface, around 465 °C.', glow: [0xffd9a0, 2.6] },
    { name: 'Earth', a: 65, r: 4.7, tex: 'earth', ang: 4.1, tilt: 0.41, spin: 0.7, fact: 'Our home, and the only world known to have life.', glow: [0x5aa0ff, 3.0], clouds: true, moon: true },
    { name: 'Mars', a: 83, r: 3.4, tex: 'mars', ang: 5.5, tilt: 0.44, spin: 0.68, fact: 'Home of Olympus Mons, the tallest known volcano.', glow: [0xff8a5a, 4.2] },
    { name: 'Jupiter', a: 126, r: 11.5, tex: 'jupiter', ang: 6.0, tilt: 0.05, spin: 1.4, fact: 'The largest planet. Its Great Red Spot is a giant storm.' },
    { name: 'Saturn', a: 166, r: 9.6, tex: 'saturn', ang: 3.3, tilt: 0.47, spin: 1.2, fact: 'Famous for its wide rings of ice and rock.', rings: true },
    { name: 'Uranus', a: 202, r: 6.6, tex: 'uranus', ang: 4.8, tilt: 1.7, spin: -0.8, fact: 'An ice giant that spins on its side.', glow: [0x9fe6ee, 3.2] },
    { name: 'Neptune', a: 234, r: 6.3, tex: 'neptune', ang: 4.0, tilt: 0.5, spin: 0.9, fact: 'The windiest planet, with the fastest winds measured.', glow: [0x4f7cff, 3.2] }
  ];
  var K = 48.7;
  var planets = [];
  var ringPts = [];
  defs.forEach(function (d) {
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
    // orbit line
    var pts = [];
    for (var s = 0; s <= 256; s++) { var an = s / 256 * 6.2832; pts.push(new THREE.Vector3(Math.cos(an) * d.a, 0, Math.sin(an) * d.a)); }
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8a97b4, transparent: true, opacity: 0.28 }));
    scene.add(line);
    // label
    var lab = document.createElement('div'); lab.className = 'plabel'; lab.textContent = d.name.toUpperCase();
    document.body.appendChild(lab); d.label = lab;
  });

  // asteroid belt
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

  /* ---------- the Sun, the Moon and the asteroid belt as pages of their own ---------- */
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
      if (Math.hypot(rho + 18, tau - 30) < 8) continue;      // keep clear of the camera
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

  /* ---------- zoom-out levels: Milky Way, Local Group, observable universe ---------- */
  var cl = 0;                                     // 0 = solar system, 1 = Milky Way, 2 = Local Group, 3 = universe
  var LEVEL_K = [1, 0.01, 0.03, 0.015];           // how small the level below looks inside this level
  var solarGroup = new THREE.Group();
  scene.children.slice().forEach(function (o) { if (o !== starGroup) solarGroup.add(o); });
  scene.add(solarGroup);
  var levels = [null], discMats = [];
  function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 0.6; }
  function lvMat(lv, size, op) {
    var m = new THREE.PointsMaterial({ size: size, map: dot, vertexColors: true, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op });
    lv.mats.push({ m: m, o: op }); return m;
  }
  function lvSprite(lv, color, scale, op, parent, keep) {
    var m = new THREE.SpriteMaterial({ map: dot, color: color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
    var sp = new THREE.Sprite(m); sp.scale.setScalar(scale); (parent || lv.group).add(sp); lv.mats.push({ m: m, o: op, glow: !keep }); return sp;
  }
  function galaxy(lv, R, n, o) {
    o = o || {};
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color(), arms = o.arms || 4;
    for (var i = 0; i < n; i++) {
      var x, y, z, b = 0.4 + Math.random() * 0.6;
      if (Math.random() < (o.bulge === undefined ? 0.2 : o.bulge)) {
        var rr = R * 0.2 * Math.pow(Math.random(), 1.5), th = Math.random() * 6.2832, ph = Math.acos(2 * Math.random() - 1);
        x = rr * Math.sin(ph) * Math.cos(th) * (1 + (o.bar || 0) * 2.2); z = rr * Math.sin(ph) * Math.sin(th); y = rr * Math.cos(ph) * 0.5;
        c.setRGB(1.0 * b, 0.8 * b, 0.52 * b);
      } else {
        var rf = Math.pow(Math.random(), 0.72), r = R * (0.05 + 0.95 * rf), arm = Math.floor(Math.random() * arms);
        var a = o.uniform ? Math.random() * 6.2832 : arm * 6.2832 / arms + rf * (o.wind || 5.0) + gauss() * 0.24 * (0.45 + rf);
        x = Math.cos(a) * r; z = Math.sin(a) * r; y = gauss() * R * 0.018 * (1.2 - rf);
        var k = rf, hii = Math.random() < 0.07;
        if (hii) c.setRGB(1.0, 0.45, 0.62); else c.setRGB((1.0 - 0.42 * k) * b, (0.85 - 0.08 * k) * b, (0.6 + 0.4 * k) * b);
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var pts = new THREE.Points(g, lvMat(lv, o.size || 2.3, o.op || 0.9)); pts.frustumCulled = false; return pts;
  }

  /* a painted galaxy disc: log-spiral arms, dust lanes, bar, bulge and clumpy star clouds */
  function galaxyTexture(size, o) {
    var arms = o.arms || 4, wind = o.wind || 2.2, bar = o.bar || 0, seed = o.seed || 1, ph = o.phase || 0;
    function h(x, y) { var v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return v - Math.floor(v); }
    function vn(x, y) { var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v; }
    function fbm(x, y) { return vn(x, y) * 0.5 + vn(x * 2.1, y * 2.1) * 0.25 + vn(x * 4.3, y * 4.3) * 0.15 + vn(x * 8.7, y * 8.7) * 0.1; }
    function sm(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
    var c = document.createElement('canvas'); c.width = c.height = size; var cx = c.getContext('2d'), im = cx.createImageData(size, size), d = im.data;
    for (var py = 0; py < size; py++) for (var px = 0; px < size; px++) {
      var u = (px / (size - 1)) * 2 - 1, v = (py / (size - 1)) * 2 - 1, r = Math.sqrt(u * u + v * v), th = Math.atan2(v, u), o4 = (py * size + px) * 4;
      if (r >= 1) { d[o4 + 3] = 255; continue; }
      var warp = (fbm(u * 3 + 5, v * 3 + 9) - 0.5) * 1.4;
      var phase = arms * (th + wind * Math.log(r + 0.06)) + warp + ph;
      var s1 = 0.5 + 0.5 * Math.cos(phase), arm = Math.pow(s1, 2.4);
      var dust = Math.pow(0.5 + 0.5 * Math.cos(phase - 0.65), 3.2) * sm(0.1, 0.34, r) * (0.55 + 0.9 * fbm(u * 11 + 2, v * 11 + 4));
      var clump = 0.35 + 1.25 * fbm(u * 14 + 7, v * 14 + 1), armAmp = sm(0.08, 0.28, r) * (1 - sm(0.62, 0.98, r));
      var disc = Math.exp(-r * 3.4) * 0.55, bulge = Math.exp(-Math.pow(r / 0.15, 2)) * 1.9;
      var bx = u * Math.cos(0.55) + v * Math.sin(0.55), by = -u * Math.sin(0.55) + v * Math.cos(0.55);
      var barI = bar * Math.exp(-(bx * bx / 0.045 + by * by / 0.0035));
      var I = (disc + bulge + barI + arm * armAmp * clump * 1.15) * (1 - 0.62 * Math.min(1, dust)) * (1 - sm(0.82, 1, r));
      var k = sm(0.08, 0.6, r), hii = Math.max(0, fbm(u * 18 + 3, v * 18 + 8) - 0.58) * 5 * arm * armAmp;
      var R = (1.0 - 0.42 * k) * I + hii * 1.0, G = (0.82 - 0.1 * k) * I + hii * 0.4, B = (0.58 + 0.42 * k) * I + hii * 0.55;
      d[o4] = 255 * (1 - Math.exp(-R * 1.5)); d[o4 + 1] = 255 * (1 - Math.exp(-G * 1.5)); d[o4 + 2] = 255 * (1 - Math.exp(-B * 1.5)); d[o4 + 3] = 255;
    }
    cx.putImageData(im, 0, 0);
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  }
  function galaxyPlane(lv, parent, R, size, o) {
    var m = new THREE.MeshBasicMaterial({ map: galaxyTexture(size, o), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 1 });
    var g = new THREE.PlaneGeometry(R * 2.1, R * 2.1); g.rotateX(-Math.PI / 2);
    var mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; parent.add(mesh); lv.mats.push({ m: m, o: 1, plane: true }); discMats.push(m); return mesh;
  }
  function mkLevel(i) { var lv = { group: new THREE.Group(), mats: [], labels: [] }; lv.group.visible = false; scene.add(lv.group); levels[i] = lv; return lv; }
  function addLabel(lv, text, local, hot, parent, off, target) {
    var el = document.createElement('div'); el.className = 'plabel'; el.textContent = text; if (hot) el.style.color = 'var(--accent)';
    document.body.appendChild(el); lv.labels.push({ el: el, pos: local, parent: parent || lv.group, dx: off ? off[0] : 12, dy: off ? off[1] : -7, clk: !!target });
    if (target) {
      el.classList.add('clk'); el.setAttribute('role', 'button');
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var j = bodies.findIndex(function (b) { return b.name === target; });
        if (mode === 'planet' && j >= 0) goPlanet(j);
      });
    }
  }
  // level 1: the Milky Way, with the Sun at the world origin
  (function () {
    var lv = mkLevel(1), R = 1100, inner = new THREE.Group(); lv.group.add(inner); lv.spin = inner; lv.spinRate = 0.03;
    inner.position.set(0, 0, -R * 0.52);              // galaxy centre sits 26,000 ly (0.52 R) behind the Sun
    galaxyPlane(lv, inner, R, narrow ? 512 : 900, { arms: 4, wind: 2.1, bar: 0.9, seed: 3 });
    inner.add(galaxy(lv, R * 0.95, narrow ? 7000 : 16000, { uniform: true, bulge: 0.12, size: 1.5, op: 0.6 }));
    lvSprite(lv, 0xffc886, 260, 0.3, inner); lvSprite(lv, 0xff9a55, 700, 0.07, inner);
    var rc = document.createElement('canvas'); rc.width = rc.height = 64; var rx = rc.getContext('2d');
    rx.strokeStyle = '#fff'; rx.lineWidth = 3; rx.beginPath(); rx.arc(32, 32, 24, 0, 6.2832); rx.stroke();
    var rm = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(rc), color: 0xe8a33d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    var mk = new THREE.Sprite(rm); mk.scale.setScalar(60); lv.group.add(mk); lv.mats.push({ m: rm, o: 1 });
    addLabel(lv, 'YOU ARE HERE · THE SUN', new THREE.Vector3(0, 0, 0), true, null, [-205, -8]);
    addLabel(lv, 'SAGITTARIUS A*', new THREE.Vector3(0, 0, 0), false, inner, [34, -52], 'Sagittarius A*');
    addLabel(lv, 'CRAB PULSAR', new THREE.Vector3(70, 4, 125), false, null, [14, -2], 'Crab Pulsar');
  })();
  // level 2: the Local Group
  (function () {
    var lv = mkLevel(2), root = new THREE.Group(); lv.group.add(root); lv.spin = root; lv.spinRate = 0.008;
    function gal(R, n, at, rx, rz, sd) {
      var w = new THREE.Group(); w.position.copy(at); root.add(w);
      var tg = new THREE.Group(); w.add(tg); var sg = new THREE.Group(); tg.add(sg);
      var g = new THREE.Group(); g.rotation.set(rx, 0, rz); sg.add(g);
      galaxyPlane(lv, g, R, narrow ? 128 : 256, { arms: 2, wind: 1.6, bar: 0.4, seed: sd, phase: sd }); return { wrap: w, tilt: tg, spin: sg };
    }
    var A = new THREE.Vector3(1500, 300, -700), M33 = A.clone().add(new THREE.Vector3(-320, -120, 380));
    lv.gals = { mw: gal(70, 0, new THREE.Vector3(0, 0, 0), 0.5, 0.15, 3), and: gal(150, 0, A, 0.9, 0.5, 5), tri: gal(48, 0, M33, 1.2, -0.4, 8) };
    [[0, 0, 0, 0xffc886, 300, 0.6], [A.x, A.y, A.z, 0xffd6a0, 420, 0.6], [M33.x, M33.y, M33.z, 0xaecbff, 140, 0.4], [75, -40, 95, 0xbfd4ff, 46, 0.55], [115, -70, 60, 0xbfd4ff, 34, 0.5]].forEach(function (q) {
      var sp = lvSprite(lv, q[3], q[4], q[5], root); sp.position.set(q[0], q[1], q[2]);
    });
    var n = 70, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var d = new THREE.Vector3(gauss(), gauss() * 0.7, gauss()).multiplyScalar(800).add(new THREE.Vector3(750, 100, -300));
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z; var b = 0.5 + Math.random() * 0.5; col[i * 3] = 0.75 * b; col[i * 3 + 1] = 0.85 * b; col[i * 3 + 2] = b;
    }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    root.add(new THREE.Points(g, lvMat(lv, 3.2, 0.85)));
    addLabel(lv, 'MILKY WAY', new THREE.Vector3(0, 0, 0), true, root);
    addLabel(lv, 'ANDROMEDA', A, false, root, [14, -7], 'Andromeda');
    addLabel(lv, 'TRIANGULUM', M33, false, root, [12, -7], 'Triangulum');
  })();
  // level 3: the observable universe, shown as a tilted circular map
  (function () {
    var lv = mkLevel(3), root = new THREE.Group(); lv.group.add(root); root.rotation.x = 0.1;
    var spinG = new THREE.Group(); root.add(spinG); lv.spin = spinG; lv.spinAxis = 'z'; lv.spinRate = 0.004;
    var R = 1150, m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 1 });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.1, R * 2.1), m); mesh.frustumCulled = false; spinG.add(mesh);
    lv.mats.push({ m: m, o: 1 }); lv.mapMat = m;
    lvSprite(lv, 0xffc886, 70, 0.5, root);
    addLabel(lv, 'WE ARE HERE · THE CENTRE', new THREE.Vector3(0, 0, 0), true, root, [14, 18]);
    addLabel(lv, 'EDGE OF THE OBSERVABLE UNIVERSE', new THREE.Vector3(R * 0.62, R * 0.72, 0), false, root, [-270, -22]);
  })();

  /* ---------- deep-space close-ups: Sagittarius A* (black hole) and the Crab Pulsar (neutron star) ---------- */
  var closeK = 0, closeK1 = 0, labelK = 0, sgrK = 0, crabK = 0, qTmp = new THREE.Quaternion();
  var GLSL_NOISE2 = `
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h21(i), h21(i+vec2(1.0,0.0)), f.x), mix(h21(i+vec2(0.0,1.0)), h21(i+vec2(1.0,1.0)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a*vn(p); p = p*2.03 + vec2(7.1,3.7); a *= 0.5; } return s; }
    vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
  `;
  var BH_FS = `precision highp float;
    varying vec2 vUv; uniform float uTime, uElev, uRoll, uFade;
    ` + GLSL_NOISE2 + `
    float h31d(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
    // the sky behind the hole: stars and the dusty band of the Milky Way
    vec3 sky(vec3 d){
      vec3 sc = d*48.0, id = floor(sc), f = fract(sc) - 0.5;
      float st = step(0.955, h31d(id))*smoothstep(0.34, 0.0, length(f - (vec3(h31d(id+1.7), h31d(id+3.1), h31d(id+5.3)) - 0.5)*0.5));
      vec3 sc2 = d*130.0, id2 = floor(sc2), f2 = fract(sc2) - 0.5;
      float st2 = step(0.975, h31d(id2+9.0))*smoothstep(0.38, 0.0, length(f2));
      float band = exp(-pow(d.y*3.2, 2.0));
      float lon = atan(d.z, d.x);
      vec2 np = vec2(cos(lon), sin(lon))*2.0 + vec2(d.y*6.0, 0.0);
      float dust = fbm(np*1.8), lane = smoothstep(0.45, 0.7, fbm(np*3.2 + 4.0));
      vec3 c = vec3(1.0,0.82,0.62)*band*(0.10 + 0.5*dust)*(1.0 - 0.8*lane*band);
      c += vec3(0.8,0.9,1.0)*(st*(0.6 + 1.6*band) + st2*0.5);
      return c;
    }
    vec3 plasma(float t){
      vec3 c = mix(vec3(0.5,0.12,0.02), vec3(1.0,0.46,0.1), smoothstep(0.12, 0.45, t));
      c = mix(c, vec3(1.0,0.78,0.38), smoothstep(0.4, 0.75, t));
      return mix(c, vec3(1.0,0.97,0.9), smoothstep(0.75, 1.05, t));
    }
    void main(){
      const float HALF = 8.5;
      const float BCRIT = 5.196152;          // shadow radius for a hole of mass M = 1
      vec2 p = rot((vUv - 0.5)*2.0*HALF, uRoll);
      float pl = length(p);
      float edge = 1.0 - smoothstep(HALF*0.72, HALF*0.98, pl);
      if (edge <= 0.0) { gl_FragColor = vec4(0.0); return; }
      float ce = cos(uElev), se = sin(uElev);
      vec3 e1 = vec3(0.0, se, ce);           // from the hole towards the viewer
      vec3 up = vec3(0.0, ce, -se);
      vec3 w = (pl > 0.0001) ? (vec3(1.0,0.0,0.0)*p.x + up*p.y)/pl : vec3(1.0,0.0,0.0);
      float b = max(pl, 0.0001)*BCRIT;
      // follow the light ray backwards: u = 1/r obeys u'' = -u + 3 M u^2
      float u = 0.0, v = 1.0/b, phi = 0.0;
      const float dphi = 0.075;
      vec3 acc = vec3(0.0); float T = 1.0;
      float prevY = 1.0e4*e1.y; vec3 prevPos = e1*1.0e4;
      bool escaped = false;
      for (int i = 0; i < 84; i++) {
        v += (-u + 3.0*u*u)*dphi; u += v*dphi; phi += dphi;
        if (u >= 0.5) break;                                  // fell through the horizon
        if (u <= 0.0 || (v < 0.0 && u < 0.004)) { escaped = true; break; }
        float r = 1.0/u;
        vec3 dp = cos(phi)*e1 + sin(phi)*w;
        vec3 pos = r*dp;
        if (prevY*pos.y < 0.0 && T > 0.02) {                 // the ray crosses the plane of the disc
          vec3 pc = mix(prevPos, pos, prevY/(prevY - pos.y));
          float rc = length(pc);
          if (rc > 6.0 && rc < 26.0) {
            float a = atan(pc.z, pc.x);
            float om = 0.45*pow(6.0/rc, 1.5);
            float a2 = a - uTime*om;
            vec2 np = vec2(cos(a2), sin(a2))*2.2 + vec2(rc*0.55, 0.0);
            float n1 = fbm(np), n2 = fbm(np*2.7 + vec2(3.0,8.0));
            float tex = (0.3 + 1.5*n1*n2 + 0.5*n1)*(0.75 + 0.25*sin(rc*3.0 + n1*5.0));
            float temp = pow(6.0/rc, 0.75);
            vec3 th = normalize(vec3(-pc.z, 0.0, pc.x));
            vec3 dtr = -v*r*r*dp + r*(-sin(phi)*e1 + cos(phi)*w);
            vec3 dn = -normalize(dtr);
            float beta = sqrt(1.0/rc);
            float dop = 1.0/(1.0 - beta*dot(th, dn));
            float boost = clamp(mix(1.0, pow(dop, 3.0), 0.55), 0.3, 3.5);
            float al = 0.85*smoothstep(6.0, 6.7, rc)*(1.0 - smoothstep(13.0, 26.0, rc));
            float Ie = 2.6*pow(6.0/rc, 1.9)*tex*boost;
            acc += T*al*Ie*plasma(temp*pow(boost, 0.25));
            T *= 1.0 - 0.9*al;
          }
        }
        prevY = pos.y; prevPos = pos;
      }
      if (escaped && pl >= 0.997) acc += T*sky(normalize(cos(phi)*e1 + sin(phi)*w));
      // sharp photon ring and the bloom around the disc
      acc += vec3(1.0,0.84,0.6)*exp(-pow((pl - 1.0)*10.0, 2.0))*0.75*step(0.985, pl);
      acc += vec3(1.0,0.55,0.18)*0.14*exp(-pow(length(vec2(p.x*0.32, p.y*1.5)), 1.3));
      float occl = 1.0 - smoothstep(0.994, 1.004, pl);
      vec3 light = vec3(1.0) - exp(-acc*1.15);
      float alpha = max(max(occl, 1.0 - T), 0.5);
      gl_FragColor = vec4(light*edge*uFade, alpha*edge*uFade);
    }`;
  var GLSL_NOISE3 = `
    float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
    float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
                 mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a*vn3(p); p = p*2.02 + vec3(3.1,1.7,5.3); a *= 0.5; } return s; }
  `;
  var PULSAR_R = 22;
  var PULSAR_VS = `varying vec3 vN; varying vec3 vP; varying vec3 vV;
    void main(){ vP = position/` + PULSAR_R.toFixed(1) + `; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
  var PULSAR_FS = `precision highp float; uniform float uTime, uFlash; varying vec3 vN; varying vec3 vP; varying vec3 vV;
    ` + GLSL_NOISE3 + `
    void main(){
      vec3 P = normalize(vP);
      float n = fbm3(P*3.6 + vec3(0.0, uTime*0.12, 0.0));
      float m = 0.5 + 0.5*sin(P.y*10.0 + n*13.0 + uTime*0.5);
      float m2 = fbm3(P*9.0 - vec3(uTime*0.08));
      vec3 deep = vec3(0.03,0.32,0.72), mid = vec3(0.25,0.8,1.0), hi = vec3(0.95,1.0,1.0);
      vec3 c = mix(deep, mid, smoothstep(0.1, 0.7, m*0.6 + n*0.6));
      c = mix(c, hi, smoothstep(0.62, 0.95, m*0.7 + m2*0.5));
      float wave = pow(0.5 + 0.5*sin(abs(P.y)*16.0 - uTime*3.2 + n*2.0), 6.0);
      c += vec3(0.5,0.95,1.0)*wave*0.7;
      float fr = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.2);
      c += vec3(0.45,0.9,1.0)*fr*1.3;
      c *= 1.0 + 0.6*uFlash; c += vec3(0.4,0.8,1.0)*uFlash*0.25;
      gl_FragColor = vec4(c, 1.0);
    }`;
  var BEAM_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
  var BEAM_FS = `precision highp float; uniform vec3 uColor; uniform float uPow, uGain, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      float along = pow(max(1.0 - vUv.y, 0.0), uPow);
      float fr = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
      float pulse = 0.88 + 0.12*sin(vUv.y*40.0 - uTime*14.0);
      gl_FragColor = vec4(uColor*along*fr*pulse*uGain, 1.0);
    }`;
  var RING_FS = `precision highp float; uniform float uTime; varying vec3 vP;
    void main(){
      float r = length(vP.xz);
      float a = smoothstep(30.0, 36.0, r)*(1.0 - smoothstep(44.0, 80.0, r));
      a *= 0.55 + 0.45*sin(r*0.35 - uTime*2.0);
      gl_FragColor = vec4(vec3(0.3,0.8,1.0)*a*0.55, 1.0);
    }`;
  var sgrBody, crabBody, bhU, bhMesh, crabObj;
  (function () {
    var lv = levels[1], inner = lv.spin;
    // Sagittarius A*: a lensing shader on a quad that always faces the camera
    bhU = { uTime: { value: 0 }, uElev: { value: 0.14 }, uRoll: { value: 0 }, uFade: { value: 0 } };
    var bhMat = new THREE.ShaderMaterial({ uniforms: bhU, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: BH_FS,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    bhMesh = new THREE.Mesh(new THREE.PlaneGeometry(204, 204), bhMat); bhMesh.renderOrder = 20; bhMesh.frustumCulled = false; bhMesh.visible = false; inner.add(bhMesh);
    (function () {                                       // the dense stars of the galactic bulge and the nucleus around the hole
      var n = narrow ? 3600 : 8000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
      for (var k = 0; k < n; k++) {
        var nuc = k < n * 0.35, sx = nuc ? 26 : 150, sy = nuc ? 20 : 42, b = 0.45 + Math.random() * 0.55;
        pos[k * 3] = gauss() * sx; pos[k * 3 + 1] = gauss() * sy; pos[k * 3 + 2] = gauss() * sx;
        c.setRGB(1.0 * b, (0.82 + Math.random() * 0.1) * b, (0.55 + Math.random() * 0.2) * b); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      var pts = new THREE.Points(g, lvMat(lv, 2.0, 0.9)); pts.frustumCulled = false; inner.add(pts);
    })();
    var sgrTilt = new THREE.Object3D();
    sgrBody = { name: 'Sagittarius A*', isCosmos: true, close: true, level: 1, r: 0.001, group: inner, follow: inner, mesh: sgrTilt, tiltGroup: sgrTilt, userYaw: 0, dist: 150, el: 0.14, fact: '' };

    // Crab Pulsar: marbled plasma sphere, energy waves and two spinning beams, in the Perseus arm
    var crab = new THREE.Group(); crab.position.set(70, 4, 125); crab.visible = false; lv.group.add(crab);
    var view = new THREE.Group(); crab.add(view);
    var spin = new THREE.Group(); view.add(spin);
    var uT = { value: 0 }, uF = { value: 0 }, beamMats = [];
    var pSphere = new THREE.Mesh(
      new THREE.SphereGeometry(PULSAR_R, 64, 48),
      new THREE.ShaderMaterial({ uniforms: { uTime: uT, uFlash: uF }, vertexShader: PULSAR_VS, fragmentShader: PULSAR_FS })
    );
    spin.add(pSphere);

    // Magnetic axis tilted relative to spin axis so beams sweep in a wide cone like a lighthouse
    var axis = new THREE.Group();
    axis.rotation.z = 0.48;
    spin.add(axis);

    function beam(r0, r1, len, color, pw, gain) {
      var g = new THREE.CylinderGeometry(r1, r0, len, 24, 1, true);
      g.translate(0, len / 2 + PULSAR_R * 0.75, 0);
      var m = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: pw }, uGain: { value: gain }, uTime: uT },
        vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      m.userData.base = gain; beamMats.push(m);
      var a = new THREE.Mesh(g, m), b = new THREE.Mesh(g, m);
      b.rotation.x = Math.PI;
      axis.add(a); axis.add(b);
    }
    beam(1.4, 4.4, 125, 0x7fe9ff, 0.7, 1.7);
    beam(0.45, 1.4, 125, 0xffffff, 0.5, 2.2);
    beam(3.8, 19, 125, 0x35b8ff, 1.2, 0.38);

    var ring = new THREE.Mesh(
      new THREE.RingGeometry(28, 78, 96, 1),
      new THREE.ShaderMaterial({
        uniforms: { uTime: uT },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: RING_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    view.add(ring);

    var halos = [[0x7fe9ff, 130, 0.5], [0x35b8ff, 260, 0.16]].map(function (q) {
      var sp = lvSprite(lv, q[0], q[1], q[2], crab, true);
      return { sp: sp, rec: lv.mats[lv.mats.length - 1], size: q[1], o: q[2] };
    });
    var crabTilt = new THREE.Object3D();
    crabObj = { group: crab, view: view, spin: spin, axis: axis, pSphere: pSphere, uT: uT, uF: uF, beams: beamMats, halos: halos, qa: new THREE.Quaternion(), da: new THREE.Vector3(), cp: new THREE.Vector3(), tc: new THREE.Vector3(), tilt: crabTilt };
    crabBody = { name: 'Crab Pulsar', isCosmos: true, close: true, level: 1, r: 0.001, group: crab, follow: crab, mesh: crabTilt, tiltGroup: crabTilt, userYaw: 0, dist: 165, el: 0.18, fact: '' };

    // small markers so both can be found from far away
    lvSprite(lv, 0xffd9a0, 36, 0.9, inner); lvSprite(lv, 0x9ff0ff, 40, 0.9, lv.group).position.set(70, 4, 125);
  })();
  var lg = levels[2].gals;
  var andBody = { name: 'Andromeda', isCosmos: true, close: true, level: 2, r: 0.001, group: lg.and.wrap, follow: lg.and.wrap, mesh: lg.and.spin, tiltGroup: lg.and.tilt, dist: 560, el: 0.4, fact: '' };
  var triBody = { name: 'Triangulum', isCosmos: true, close: true, level: 2, r: 0.001, group: lg.tri.wrap, follow: lg.tri.wrap, mesh: lg.tri.spin, tiltGroup: lg.tri.tilt, dist: 190, el: 0.4, fact: '' };
  var cosCam = [null, { t: new THREE.Vector3(0, 0, -330), dist: 4200, el: 0.62 }, { t: new THREE.Vector3(750, 120, -330), dist: 4400, el: 0.5 }, { t: new THREE.Vector3(0, 0, 0), dist: 4300, el: 0.45 }];
  var lvBodies = [1, 2, 3].map(function (i) {
    return { name: ['', 'Milky Way', 'Local Group', 'Observable Universe'][i], isCosmos: true, level: i, r: 0.001, group: levels[i].group, mesh: levels[i].group, tiltGroup: levels[i].group, camT: cosCam[i].t, dist: cosCam[i].dist, el: cosCam[i].el, fact: '' };
  });
  var levelStop = [null, lvBodies[0], lvBodies[1], lvBodies[2]];
  var cosBodies = [lvBodies[0], sgrBody, crabBody, lvBodies[1], andBody, triBody, lvBodies[2]];   // Crab, Sgr A*, Milky Way, Local Group, M31, M33, Universe
  lvBodies[0].zin = 'exit'; lvBodies[0].zout = sgrBody; sgrBody.zin = lvBodies[0]; sgrBody.zout = crabBody; crabBody.zin = sgrBody; crabBody.zout = lvBodies[1]; lvBodies[1].zin = crabBody;
  bodies = bodies.concat(cosBodies);

  /* ---------- real textures (Solar System Scope, CC BY 4.0) ---------- */
  (function () {
    var loader = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    function load(url, cb) {
      loader.load(url, function (t) { t.encoding = THREE.sRGBEncoding; t.anisotropy = aniso; cb(t); }, undefined, function () { /* keep generated surface */ });
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
    load('tex/spiral_galaxy.jpg', function (t) { discMats.forEach(function (m) { swap(m, 'map', t); m.color.setScalar(1.3); }); });
    load('tex/universe_map.png', function (t) { var m = levels[3].mapMat; m.map = t; m.needsUpdate = true; });
    load('tex/milkyway.jpg', function (t) {
      var sky = new THREE.Mesh(new THREE.SphereGeometry(3300, 64, 32), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, color: new THREE.Color(2.4, 2.4, 2.4) }));
      sky.renderOrder = -2; sky.frustumCulled = false; starGroup.add(sky);
      mwObjs.forEach(function (o) { o.visible = false; });
    });
  })();

  /* ---------- camera path, scroll, pointer ---------- */
  var P0 = new THREE.Vector3(150, 46, 640), T0 = new THREE.Vector3(-118, 0, 0);
  var P1 = new THREE.Vector3(0, 235, 300), T1 = new THREE.Vector3(0, 0, 4);
  var scroller = $('scroller') || document.createElement('div');
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

  /* ---------- planet pages: state, camera poses, UI ---------- */
  var mode = 'overview', focusIdx = -1, tr = 1, trDur = 2.4, uiIdx = -1;
  var pm = 0, orbitSpeed = 1, orbT = 0, drag = null;
  var zoom = 1, zoomT = 1, settled = false, settleTime = 0;
  var ry = 0, rp = 0, ryT = 0, rpT = 0, ovDrag = null, dragDist = 0, hasDragged = false;
  var from = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  var curTgt = T0.clone(), toPos = new THREE.Vector3(), toTgt = new THREE.Vector3();
  var vS = new THREE.Vector3(), vF = new THREE.Vector3(), vR = new THREE.Vector3(), vC = new THREE.Vector3(), vP = new THREE.Vector3(), vUp = new THREE.Vector3(0, 1, 0);
  var pui = $('pui');

  var PD = COSMIC_DATA.PD, ROW_LABELS = COSMIC_DATA.ROW_LABELS;

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
    if (d.isCosmos) {
      var cd = d.dist * zoom;
      if (d.follow) d.follow.getWorldPosition(t); else t.copy(d.camT);
      p.set(t.x, t.y + Math.sin(d.el) * cd, t.z + Math.cos(d.el) * cd);
      vF.copy(t).sub(p).normalize(); vR.crossVectors(vF, vUp).normalize();
      var ch = cd * tf0;
      if (portrait) { vC.crossVectors(vR, vF); t.addScaledVector(vC, -0.5 * ch); } else t.addScaledVector(vR, -0.4 * ch * asp);
      p.x += pointer.x * cd * 0.01; p.y += -pointer.y * cd * 0.008;
      return;
    }
    if (d.isBelt) {                                           // the camera floats inside the belt, looking across it
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
    if (d.isSun) vS.set(0.35, 0, 0.94).normalize(); else vS.copy(vP).multiplyScalar(-1).normalize();   // direction from the body to the Sun
    for (var k = 0; k < 2; k++) {
      vF.copy(vS).applyAxisAngle(vUp, k === 0 ? 0.95 : -0.95);
      p.copy(vP).addScaledVector(vF, dist); p.y += dist * 0.1;
      vF.copy(vP).sub(p).normalize();                       // camera forward
      vR.crossVectors(vF, vUp).normalize();                 // camera right
      if (vS.dot(vR) < 0) break;                            // keep the Sun on the left of the screen
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
  function lockScroll(on) {
    document.body.classList.toggle('in-planet', on);
  }
  /* ---------- live NASA data (needs internet access to api.nasa.gov; set your own key in config.js) ---------- */
  var NASA_KEY = (window.COSMIC_CONFIG && window.COSMIC_CONFIG.NASA_KEY) || 'DEMO_KEY', liveCache = {};
  function isoDay(d) { return d.toISOString().slice(0, 10); }
  function getJSON(url) {
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 10000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function fmtKm(k) { return Math.round(k).toLocaleString('en-US') + ' km'; }
  var LIVE = {
    Sun: { title: 'SOLAR FLARES · LAST 30 DAYS', load: function () {
      var e = new Date(), st = new Date(e.getTime() - 30 * 864e5);
      return getJSON('https://api.nasa.gov/DONKI/FLR?startDate=' + isoDay(st) + '&endDate=' + isoDay(e) + '&api_key=' + NASA_KEY).then(function (list) {
        list = Array.isArray(list) ? list.filter(function (f) { return f && f.classType; }) : [];
        function rank(c) { return 'ABCMX'.indexOf(c.charAt(0)) * 100 + (parseFloat(c.slice(1)) || 0); }
        var rows = [['FLARES RECORDED', String(list.length)]];
        if (list.length) {
          var big = list.slice().sort(function (a, b) { return rank(b.classType) - rank(a.classType); })[0];
          rows.push(['STRONGEST', big.classType + ' · ' + String(big.peakTime || big.beginTime || '').slice(0, 10)]);
          list.slice(-1).reverse().forEach(function (f) { rows.push(['RECENT', f.classType + ' · ' + String(f.peakTime || f.beginTime || '').replace('T', ' ').replace('Z', ' UTC')]); });
        }
        return { rows: rows, foot: 'X-class flares are the strongest, then M, C, B and A. Source: NASA DONKI.' };
      });
    } },
    'Asteroid Belt': { title: 'NEAR-EARTH ASTEROIDS · NEXT 7 DAYS', load: function () {
      var e = new Date(), en = new Date(e.getTime() + 6 * 864e5);
      return getJSON('https://api.nasa.gov/neo/rest/v1/feed?start_date=' + isoDay(e) + '&end_date=' + isoDay(en) + '&api_key=' + NASA_KEY).then(function (j) {
        var all = []; Object.keys(j.near_earth_objects || {}).forEach(function (k) { all = all.concat(j.near_earth_objects[k]); });
        all = all.filter(function (a) { return a.close_approach_data && a.close_approach_data[0]; });
        var rows = [['ASTEROIDS PASSING', String(all.length)], ['POTENTIALLY HAZARDOUS', String(all.filter(function (a) { return a.is_potentially_hazardous_asteroid; }).length)]];
        if (all.length) {
          all.sort(function (a, b) { return parseFloat(a.close_approach_data[0].miss_distance.kilometers) - parseFloat(b.close_approach_data[0].miss_distance.kilometers); });
          var c = all[0], ca = c.close_approach_data[0], km = parseFloat(ca.miss_distance.kilometers);
          rows.push(['CLOSEST', String(c.name).replace(/[()]/g, '')]);
          rows.push(['MISS DISTANCE', fmtKm(km) + ' (' + (km / 384400).toFixed(1) + ' × Moon)']);
          rows.push(['SPEED', (parseFloat(ca.relative_velocity.kilometers_per_hour) / 3600).toFixed(1) + ' km/s']);
          if (c.estimated_diameter) rows.push(['SIZE (MAX)', Math.round(c.estimated_diameter.meters.estimated_diameter_max) + ' m']);
        }
        return { rows: rows, foot: 'These rocks orbit close to Earth. Most main-belt asteroids stay between Mars and Jupiter. Source: NASA NeoWs.' };
      });
    } },
    Earth: { title: 'EARTH RIGHT NOW · DSCOVR EPIC', load: function () {
      return getJSON('https://api.nasa.gov/EPIC/api/natural?api_key=' + NASA_KEY).then(function (list) {
        var it = list && list[list.length - 1]; if (!it) throw new Error('empty');
        var ds = String(it.date).slice(0, 10).split('-');
        return { img: 'https://api.nasa.gov/EPIC/archive/natural/' + ds[0] + '/' + ds[1] + '/' + ds[2] + '/jpg/' + it.image + '.jpg?api_key=' + NASA_KEY,
          rows: [['SATELLITE', 'DSCOVR · 1.5 million km away'], ['PHOTO TAKEN', String(it.date) + ' UTC']], foot: 'The sunlit side of Earth, as seen from the point between Earth and the Sun. Source: NASA EPIC.' };
      });
    } },
    Mars: { title: 'LATEST PHOTO FROM CURIOSITY', load: function () {
      return getJSON('https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/latest_photos?api_key=' + NASA_KEY).then(function (j) {
        var ph = j && j.latest_photos && j.latest_photos[0]; if (!ph) throw new Error('empty');
        return { img: String(ph.img_src).replace(/^http:/, 'https:'), rows: [['CAMERA', ph.camera.full_name], ['EARTH DATE', ph.earth_date], ['MARTIAN DAY (SOL)', String(ph.sol)]], foot: 'A real photo taken on the surface of Mars. Source: NASA Mars Rover Photos.' };
      });
    } }
  };
  function renderLive(box, L, r, err) {
    box.hidden = false; box.textContent = '';
    var h = document.createElement('div'); h.className = 'live-head';
    var dot = document.createElement('i'); dot.className = 'live-dot' + (err ? ' off' : ''); h.appendChild(dot);
    var t = document.createElement('span'); t.textContent = (err ? 'NASA · ' : 'LIVE · NASA · ') + L.title; h.appendChild(t); box.appendChild(h);
    if (!r) { var m0 = document.createElement('p'); m0.className = 'live-msg'; m0.textContent = err || 'Connecting to NASA…'; box.appendChild(m0); return; }
    if (r.img && /^https:\/\//.test(r.img)) { var im = document.createElement('img'); im.alt = L.title; im.referrerPolicy = 'no-referrer'; im.src = r.img; im.onerror = function () { im.remove(); }; box.appendChild(im); }
    r.rows.forEach(function (q) {
      var row = document.createElement('div'); row.className = 'row'; var a = document.createElement('span'); a.textContent = q[0]; var b = document.createElement('b'); b.textContent = q[1]; row.appendChild(a); row.appendChild(b); box.appendChild(row);
    });
    var f = document.createElement('p'); f.className = 'live-msg'; f.textContent = r.foot; box.appendChild(f);
  }
  function loadLive(d) {
    var box = $('p-live'), L = d && LIVE[d.name];
    if (!L) { box.hidden = true; return; }
    if (liveCache[d.name]) { renderLive(box, L, liveCache[d.name]); return; }
    renderLive(box, L, null);
    L.load().then(function (r) { liveCache[d.name] = r; if (bodies[focusIdx] === d) renderLive(box, L, r); })
      .catch(function () { if (bodies[focusIdx] === d) renderLive(box, L, null, 'Live NASA data could not be loaded. This needs internet access to api.nasa.gov (the published preview blocks it), and the free DEMO_KEY allows only a few requests per hour. Put your own free key in config.js.'); });
  }
  function showData(on) {
    pui.classList.toggle('data', !!on);
    if (on && focusIdx >= 0) loadLive(bodies[focusIdx]); else if (!on) $('p-live').hidden = true;
    $('p-explore').setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function enterPlanet(i) { if (i < 0 || mode !== 'overview') return; showData(false); lockScroll(true); startTransition('planet', i, bodies[i].isCosmos ? 3.8 : 2.6); }
  function exitPlanet() {
    if (mode !== 'planet') return;
    showData(false); lockScroll(false);
    window.scrollTo(0, document.documentElement.scrollHeight); pRaw = 1; pS = 1;
    startTransition('overview', -1, 2.2);
  }
  function zoomBy(f) {
    if (mode !== 'planet' || !settled) return;
    var fb0 = bodies[focusIdx];
    zoomT = clamp(zoomT * f, 0.55, fb0.isCosmos ? 1.35 : 1.6);
    if (fb0.isCosmos) {                                   // zoom out: the level overview, then the next level; zoom in: the level below
      if (zoomT > 1.3) {
        var nx = fb0.zout || (fb0.close ? levelStop[fb0.level] : (fb0.level < 3 ? levelStop[fb0.level + 1] : null));
        if (nx) goPlanet(bodies.indexOf(nx));
      } else if (zoomT < 0.6) {
        var pv = fb0.zin !== undefined ? fb0.zin : (fb0.close ? null : (fb0.level > 1 ? levelStop[fb0.level - 1] : 'exit'));
        if (pv === 'exit') exitPlanet(); else if (pv) goPlanet(bodies.indexOf(pv));
      }
      return;
    }
    if (zoomT > 1.3) exitPlanet();
  }
  function goPlanet(j) { if (mode !== 'planet' || j === focusIdx || tr < 0.5) return; showData(false); startTransition('planet', j, bodies[j].isCosmos ? 3.4 : 1.9); }
  function fillPlanet(i) {
    var d = bodies[i], P = PD[d.name], n = bodies.length;
    $('p-eyebrow').textContent = (P.level || 'LEVEL 01') + ' · ' + P.type;
    $('p-hint').textContent = d.close ? 'DRAG TO TILT · SCROLL OUT TO GO BACK' : d.isCosmos ? (d.level < 3 ? 'CLICK A LABEL TO FLY THERE · SCROLL TO CHANGE LEVEL' : 'DRAG TO ROTATE · SCROLL TO CHANGE LEVEL') : 'DRAG TO ROTATE · SCROLL OUT TO LEAVE';
    pui.classList.toggle('scrim', !!(d.isBelt || d.isCosmos));
    $('p-name').textContent = d.name; $('p-name').style.fontSize = d.name.length > 14 ? 'clamp(40px, 5.8vw, 84px)' : d.name.length > 8 ? 'clamp(52px, 9vw, 124px)' : '';
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
        ryT += ox * 0.006;                      // drag left: see the system from the left
        rpT = clamp(rpT - oy * 0.005, -2.3, 1.0); // drag up: top view, drag down: bottom view
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
      if (!settled || time - settleTime < 1.4) return;
      zoomBy(Math.exp(clamp(e.deltaY, -120, 120) * 0.0009));
    }, { passive: false });
    $('z-in').addEventListener('click', function () { zoomBy(1 / 1.25); });
    $('z-out').addEventListener('click', function () { zoomBy(1.25); });
    $('v-out').addEventListener('click', function () { if (mode === 'overview' && tr >= 1) enterPlanet(bodies.indexOf(cosBodies[0])); });
    $('v-reset').addEventListener('click', function () { ryT = Math.round(ryT / 6.2832) * 6.2832; rpT = 0; });
    $('v-top').addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
    var endDrag = function (e) { drag = null; ovDrag = null; if (e && e.pointerId !== undefined) ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = 0; };
    window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
    window.cosmicExplorer = { state: function () { return { mode: mode, tr: tr, zoomT: zoomT, ry: ryT, rp: rpT }; }, open: function (name) { var i = bodies.findIndex(function (q) { return q.name.toLowerCase() === String(name).toLowerCase(); }); if (i >= 0) { if (mode === 'planet') goPlanet(i); else { window.scrollTo(0, document.documentElement.scrollHeight); pRaw = 1; pS = 1; enterPlanet(i); } } }, close: exitPlanet };
  })();

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
  function beltHit(i) {                       // is the pointer over the ring of rocks?
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
  function updateHover(force) {
    var best = null, bd = 1e9;
    if (pS > 0.6 && mode === 'overview' && tr >= 1 && cl < 0.02) {
      for (var i = 0; i < bodies.length; i++) {
        if (bodies[i].isBelt || bodies[i].isCosmos) continue;
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
    var clT = fb && fb.isCosmos ? fb.level : 0;
    cl += (clT - cl) * (1 - Math.exp(-dt * 1.3)); if (Math.abs(cl - clT) < 0.012) cl = clT;
    solarGroup.scale.setScalar(Math.max(1e-4, Math.pow(LEVEL_K[1], cl))); solarGroup.visible = cl < 0.95;
    for (var li = 1; li <= 3; li++) {
      var lv = levels[li], dc = cl - li, ls = dc <= 0 ? Math.pow(1 / LEVEL_K[li], -dc) : Math.pow(LEVEL_K[li + 1] || 0.01, dc);
      lv.alpha = Math.abs(dc) < 0.01 ? 1 : clamp(1 - Math.abs(dc) * 1.35, 0, 1);
      lv.group.scale.setScalar(ls); lv.group.visible = lv.alpha > 0.01;
      if (lv.group.visible) {
        lv.spin.rotation[lv.spinAxis || 'y'] += dt * lv.spinRate;
        lv.mats.forEach(function (q) { var k = lv.alpha; if (q.glow) k *= 1 - 0.85 * closeK + 0.6 * sgrK; if (q.plane && li === 1) k *= 1 - 0.93 * closeK1 + 0.6 * sgrK; q.m.opacity = q.o * k; });
        lv.group.updateMatrixWorld(true);
      }
    }
    var ek = 1 - Math.exp(-dt * 2.2);
    closeK += ((fb && fb.close ? 1 : 0) - closeK) * ek; closeK1 += ((fb && fb.close && fb.level === 1 ? 1 : 0) - closeK1) * ek;
    labelK += ((fb && fb.isCosmos && !fb.close ? 1 : 0) - labelK) * (1 - Math.exp(-dt * 3));
    sgrK += ((fb === sgrBody ? 1 : 0) - sgrK) * ek; crabK += ((fb === crabBody ? 1 : 0) - crabK) * ek;
    bhU.uTime.value = time; bhU.uFade.value = sgrK; bhU.uElev.value = clamp(0.14 + sgrBody.mesh.rotation.x * 0.5, 0.03, 0.9); bhU.uRoll.value = sgrBody.userYaw * 0.6;
    bhMesh.visible = sgrK > 0.01 && levels[1].group.visible;

    crabObj.group.visible = crabK > 0.01 && levels[1].group.visible;
    crabObj.group.scale.setScalar(0.05 + 0.95 * crabK);
    crabObj.uT.value = time;
    crabObj.spin.rotation.y += dt * 7.5;          // Fast, realistic pulsar lighthouse rotation
    crabObj.pSphere.rotation.y += dt * 2.2;
    if (crabObj.group.visible) {                  // lighthouse: flash when a beam sweeps towards the viewer
      crabObj.axis.getWorldQuaternion(crabObj.qa);
      crabObj.da.set(0, 1, 0).applyQuaternion(crabObj.qa);
      crabObj.group.getWorldPosition(crabObj.cp);
      crabObj.tc.copy(camera.position).sub(crabObj.cp).normalize();
      var fl = Math.pow(Math.abs(crabObj.da.dot(crabObj.tc)), 6);
      crabObj.uF.value = fl;
      crabObj.beams.forEach(function (m) { m.uniforms.uGain.value = m.userData.base * (0.65 + 1.6 * fl); });
      crabObj.halos.forEach(function (h) { h.rec.o = h.o * (0.65 + 1.6 * fl); h.sp.scale.setScalar(h.size * (1 + 0.7 * fl)); });
    }
    crabObj.view.rotation.x = 0.24 + crabBody.mesh.rotation.x;
    crabObj.view.rotation.y = crabBody.userYaw;
    crabObj.view.rotation.z = 0.16 + 0.06 * Math.sin(time * 1.5);

    lg.and.spin.rotation.y += dt * 0.05; lg.tri.spin.rotation.y += dt * 0.06;
    sunDim += ((fb && fb.isSun ? 1 : 0) - sunDim) * (1 - Math.exp(-dt * 3));
    rocksVis += ((fb && fb.isBelt ? 1 : 0) - rocksVis) * (1 - Math.exp(-dt * 2.5));
    sunGlows.forEach(function (g) { g.material.opacity = g.userData.o * (1 - 0.82 * sunDim); });
    rockGroup.visible = rocksVis > 0.01; rockGroup.scale.setScalar(Math.max(0.001, rocksVis));
    zoom += (zoomT - zoom) * (1 - Math.exp(-dt * 6));
    if (mode === 'overview' && pS < 0.5) { // coming back to the intro: unwind any rotation
      ryT += (Math.round(ryT / 6.2832) * 6.2832 - ryT) * (1 - Math.exp(-dt * 3)); rpT += (0 - rpT) * (1 - Math.exp(-dt * 3));
    }
    ry += (ryT - ry) * (1 - Math.exp(-dt * 7)); rp += (rpT - rp) * (1 - Math.exp(-dt * 7));

    // orbits and spins
    for (var i = 0; i < planets.length; i++) {
      var d = planets[i], a = d.ang + orbT * d.omega;
      d.group.position.set(Math.cos(a) * d.a, 0, Math.sin(a) * d.a);
      d.mesh.rotation.y += dt * d.spin * 0.25 * (inPlanet ? 0.6 : 1);
      if (d.cloudMesh) d.cloudMesh.rotation.y += dt * 0.05;
      if (d.moonMesh) { d.moonMesh.position.set(Math.cos(moonAng) * 8, 0.4, Math.sin(moonAng) * 8); d.moonMesh.rotation.y = Math.PI - moonAng + moonBody.userYaw; }
      if (d.tiltGroup && !(drag && focusIdx === i)) d.tiltGroup.rotation.x *= (1 - Math.min(1, dt * 1.5));
    }
    sun.rotation.y += dt * 0.02;
    [sunBody, moonBody, beltBody].concat(cosBodies).forEach(function (b) { if (!(drag && bodies[focusIdx] === b)) b.tiltGroup.rotation.x *= (1 - Math.min(1, dt * 1.5)); });

    // camera: blend from where it was to where it should be
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

    // welcome text, brand, hud
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
    var crEl = document.querySelector('.credit'); if (crEl) { crEl.style.opacity = String(1 - vb); crEl.style.pointerEvents = vb > 0.3 ? 'none' : ''; }
    renderer.domElement.style.touchAction = (inPlanet || (mode === 'overview' && pS > 0.65)) ? 'none' : 'pan-y';

    // planet page content
    var wantOn = inPlanet && tr > 0.55;
    if (wantOn) {
      if (uiIdx !== focusIdx) { fillPlanet(focusIdx); uiIdx = focusIdx; }
      if (!pui.classList.contains('on')) { pui.classList.add('on'); pui.inert = false; }
    } else if (pui.classList.contains('on')) { pui.classList.remove('on'); pui.inert = true; }

    // labels, hover
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
    for (var cj = 1; cj <= 3; cj++) {
      var clv = levels[cj];
      clv.labels.forEach(function (lb) {
        if (!clv.group.visible) { lb.el.style.opacity = '0'; return; }
        tmp.copy(lb.pos); lb.parent.localToWorld(tmp); tmp.project(camera);
        var on = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
        lb.el.style.transform = 'translate(' + (((tmp.x * 0.5 + 0.5) * window.innerWidth) + lb.dx).toFixed(1) + 'px,' + (((-tmp.y * 0.5 + 0.5) * window.innerHeight) + lb.dy).toFixed(1) + 'px)';
        var lop = on ? clv.alpha * Math.min(1, pm) * smooth(0.75, 1, tr) * labelK : 0;
        lb.el.style.opacity = String(lop); if (lb.clk) lb.el.style.pointerEvents = lop > 0.5 ? 'auto' : 'none';
      });
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

    bhMesh.parent.getWorldQuaternion(qTmp); qTmp.invert(); bhMesh.quaternion.copy(qTmp).multiply(camera.quaternion);
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
