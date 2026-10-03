import * as THREE from "three";

/* QUOTA world: one metro line across a curved ground, four stations built from real geometry.
   Scroll sets a target; the render loop eases toward it, so the camera never depends on scroll-event cadence. */
const C = { ground: 0xe5e9ed, block: 0xcdd4db, rule: 0xc2c9d1, ink: 0x0d1217, paper: 0xf3f5f7, cobalt: 0x1b4fd8, signal: 0xe8441f, leaf: 0x0f9d6b, amber: 0xf0ad1b, steel: 0x6a7682 };

const P: [number, number][] = [[-7, 32], [9, 32], [17, 24], [30, 24], [38, 16], [51, 16], [59, 8], [74, 8]].map(([x, z]) => [x, z]);
const SEG = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1]));
const CUM = SEG.reduce<number[]>((a, l) => [...a, a[a.length - 1] + l], [0]);
const TOTAL = CUM[CUM.length - 1];
export const pathPt = (u: number): [number, number] => {
  const c = Math.max(0, Math.min(TOTAL, u));
  let i = 0;
  while (i < SEG.length - 1 && c > CUM[i + 1]) i++;
  const t = (c - CUM[i]) / SEG[i];
  return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t];
};
const ST = [
  { x: 5, z: 32, u: 12 },
  { x: 23.5, z: 24, u: CUM[2] + 6.5 },
  { x: 44.5, z: 16, u: CUM[4] + 6.5 },
  { x: 66.5, z: 8, u: CUM[6] + 7.5 },
];
const U_START = 2.6;
export const T_END = 120;
const HOLD = [[15, 26], [40, 51], [65, 76], [90, 101]];
const HOP = [[26, 40], [51, 65], [76, 90]];
const sm = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const seg = (t: number, a: number, b: number) => sm((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* camera state at abstract time t: u along the line, k = 0 overview .. 1 docked */
export function stateAt(t: number) {
  let u = U_START, k = 0;
  const dive = seg(t, 6, 15);
  k = dive; u = lerp(U_START, ST[0].u, dive);
  HOP.forEach(([a, b], i) => {
    const p = seg(t, a, b);
    if (t >= a) { u = lerp(ST[i].u, ST[i + 1].u, p); k = 1 - 0.7 * Math.sin(Math.PI * Math.min(1, (t - a) / (b - a))); if (t >= b) k = 1; }
  });
  if (t > 101) k = 1 - seg(t, 101, 112);
  return { u, k };
}
export const sceneOf = (t: number) => (t < 5.5 ? -1 : t >= 108 ? 4 : t < 33 ? 0 : t < 58 ? 1 : t < 83 ? 2 : 3);
export const holdStart = (i: number) => HOLD[i][0] + 3;

function tex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d")!;
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const hexs = (n: number) => "#" + n.toString(16).padStart(6, "0");

export function createWorld(canvas: HTMLCanvasElement, opts: { onScene: (i: number) => void }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const small = window.innerWidth < 860;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.ground);
  scene.fog = new THREE.Fog(C.ground, 95, 240);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaab6c3, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(-22, 42, 28);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xb8c8ff, 0.7);
  rim.position.set(30, 14, -30);
  scene.add(rim);

  /* curved world: drop geometry with distance from the camera, like the surface of a drum */
  const bend = { value: small ? 0.0005 : 0.00068 };
  const mats: THREE.Material[] = [];
  const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.04, ...o });
    m.onBeforeCompile = (s) => {
      s.uniforms.uBend = bend;
      s.vertexShader = "uniform float uBend;\n" + s.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n mvPosition.y -= dot(mvPosition.xz, mvPosition.xz) * uBend;\n gl_Position = projectionMatrix * mvPosition;");
    };
    mats.push(m);
    return m;
  };
  const geos: THREE.BufferGeometry[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G) => (geos.push(g), g);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o;
  };

  // ground and city blocks
  mesh(geo(new THREE.PlaneGeometry(420, 420, 84, 84)).rotateX(-Math.PI / 2), std(C.ground, { roughness: 1 }), 34, -0.02, 20);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cells: THREE.Matrix4[] = [];
  const dist2line = (x: number, z: number) => { let d = 1e9; for (let i = 0; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1]; const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return d; };
  for (let x = -40; x < 120; x += 3.1) for (let z = -30; z < 70; z += 3.1) {
    const bx = x + rnd() * 0.5, bz = z + rnd() * 0.5;
    if (dist2line(bx, bz) < 5.2 || rnd() < 0.2) continue;
    const far = Math.max(0, 1 - Math.hypot(bx - 34, bz - 20) / 70);
    const h = 0.4 + rnd() * rnd() * (1.4 + far * 2.2);
    cells.push(new THREE.Matrix4().compose(new THREE.Vector3(bx, h / 2, bz), new THREE.Quaternion(), new THREE.Vector3(1.4 + rnd() * 0.9, h, 1.4 + rnd() * 0.9)));
  }
  const blocks = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(1, 1, 1)), std(C.block, { roughness: 0.9 }), cells.length);
  cells.forEach((m, i) => blocks.setMatrixAt(i, m));
  scene.add(blocks);

  // the line: instanced ribbon, recoloured as the train passes
  const STEP = 0.6, N = Math.ceil(TOTAL / STEP);
  const ribbon = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(STEP * 1.04, 0.3, 1.5)), std(0xffffff, { roughness: 0.5 }), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const [x, z] = pathPt(i * STEP), [x2, z2] = pathPt(i * STEP + 0.1);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(z2 - z, x2 - x));
    ribbon.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.15, z), q, new THREE.Vector3(1, 1, 1)));
    ribbon.setColorAt(i, col.setHex(C.rule));
  }
  scene.add(ribbon);
  let painted = 0;
  const paint = (u: number) => {
    const n = Math.max(0, Math.min(N, Math.floor(u / STEP)));
    if (n === painted) return;
    for (let i = Math.min(n, painted); i < Math.max(n, painted); i++) ribbon.setColorAt(i, col.setHex(i < n ? C.cobalt : C.rule));
    ribbon.instanceColor!.needsUpdate = true; painted = n;
  };

  // train: the brand roundel, standing
  const train = new THREE.Group();
  mesh(geo(new THREE.TorusGeometry(0.9, 0.22, 16, 40)), std(C.cobalt), 0, 1.1, 0, train);
  mesh(geo(new THREE.BoxGeometry(2.7, 0.42, 0.34)), std(C.ink), 0, 1.1, 0, train);
  scene.add(train);

  /* ---- stations ---- */
  const textMap = (txt: string, sub: string, fg = "#0d1217", bg = "#f3f5f7") => tex(512, 256, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, 512, 256);
    c.fillStyle = fg; c.font = '700 54px "JetBrains Mono Variable", monospace'; c.textAlign = "left";
    c.fillText(txt, 28, 112);
    c.fillStyle = "#46515c"; c.font = '500 32px "JetBrains Mono Variable", monospace'; c.fillText(sub, 28, 170);
  });
  const sign = (name: string) => {
    const t = tex(1024, 256, (c) => { c.fillStyle = "#0d1217"; c.fillRect(0, 0, 1024, 256); c.fillStyle = "#f3f5f7"; c.font = '800 168px "Archivo Variable", sans-serif'; c.textBaseline = "middle"; c.fillText(name, 56, 140); });
    const g = new THREE.Group();
    mesh(geo(new THREE.PlaneGeometry(6.2, 1.55)), new THREE.MeshBasicMaterial({ map: t }), 0, 0, 0.12, g);
    mesh(geo(new THREE.BoxGeometry(6.3, 1.65, 0.1)), std(C.ink), 0, 0, 0, g);
    return g;
  };
  const platform = (g: THREE.Group) => {
    mesh(geo(new THREE.CylinderGeometry(5.6, 5.8, 0.5, 64)), std(C.paper), 0, 0.25, -2.2, g);
    mesh(geo(new THREE.TorusGeometry(5.65, 0.1, 8, 72)).rotateX(Math.PI / 2), std(C.ink), 0, 0.5, -2.2, g);
  };
  const station = (i: number) => {
    const g = new THREE.Group();
    g.position.set(ST[i].x, 0, ST[i].z);
    platform(g);
    const s = sign(["STAKE", "PROVE", "CHECK", "SLASH"][i]);
    s.scale.setScalar(0.72); s.position.set(3.6, 0.85, 3.4); g.add(s);
    const o = new THREE.Group(); o.position.set(0, 0.5, -2.2); g.add(o);
    const anim: ((t: number) => void)[] = [];
    if (i === 0) { // passkey terminal + deposit stack
      mesh(geo(new THREE.BoxGeometry(2.2, 4, 1.1)), std(C.ink), -2.4, 2, 0, o);
      const scr = tex(256, 256, (c) => { c.fillStyle = "#1b2631"; c.fillRect(0, 0, 256, 256); c.strokeStyle = "#0f9d6b"; c.lineWidth = 12; c.lineCap = "round"; [30, 52, 74].forEach((r) => { c.beginPath(); c.arc(128, 150, r, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }); c.fillStyle = "#e8edf1"; c.font = '700 40px "JetBrains Mono Variable", monospace'; c.textAlign = "center"; c.fillText("TAP", 128, 232); });
      mesh(geo(new THREE.PlaneGeometry(1.7, 1.7)), new THREE.MeshBasicMaterial({ map: scr }), -2.4, 3, 0.57, o);
      const coins = new THREE.Group(); coins.position.set(2.3, 0, 0); o.add(coins);
      for (let k = 0; k < 7; k++) mesh(geo(new THREE.CylinderGeometry(1.35, 1.35, 0.32, 40)), std(C.amber, { metalness: 0.55, roughness: 0.32 }), 0, 0.2 + k * 0.36, 0, coins);
      mesh(geo(new THREE.PlaneGeometry(3.2, 1.6)), new THREE.MeshBasicMaterial({ map: textMap("10 MON", "100 / epoch"), transparent: true }), 0.2, 3.9, 0.2, o).rotation.y = 0;
      anim.push((t) => { coins.rotation.y = t * 0.5; });
    } else if (i === 1) { // shielded member + request ticket
      mesh(geo(new THREE.SphereGeometry(1.15, 32, 24)), std(C.steel), -2.5, 2.9, 0, o);
      mesh(geo(new THREE.CapsuleGeometry(1.25, 1.4, 8, 20)), std(C.steel), -2.5, 0.95, 0, o);
      const hatch = tex(256, 256, (c) => { c.fillStyle = "rgba(243,245,247,0.85)"; c.fillRect(0, 0, 256, 256); c.strokeStyle = "#0d1217"; c.lineWidth = 7; for (let k = -256; k < 512; k += 28) { c.beginPath(); c.moveTo(k, 256); c.lineTo(k + 256, 0); c.stroke(); } });
      const shield = mesh(geo(new THREE.SphereGeometry(2.55, 40, 28)), new THREE.MeshStandardMaterial({ map: hatch, transparent: true, opacity: 0.55, roughness: 0.4, depthWrite: false }), -2.5, 2.2, 0, o);
      anim.push((t) => { shield.rotation.y = t * 0.25; });
      const ticket = new THREE.Group(); ticket.position.set(2.5, 2.6, 0); o.add(ticket);
      mesh(geo(new THREE.BoxGeometry(3.9, 2.4, 0.22)), std(0xffffff), 0, 0, 0, ticket);
      mesh(geo(new THREE.PlaneGeometry(3.7, 1.85)), new THREE.MeshBasicMaterial({ map: textMap("k = 7", "of N = 100") }), 0, 0.05, 0.12, ticket);
      mesh(geo(new THREE.BoxGeometry(3.7, 0.22, 0.26)), std(C.cobalt), 0, -1.0, 0.02, ticket);
      anim.push((t) => { ticket.rotation.y = Math.sin(t * 0.7) * 0.18; ticket.position.y = 2.6 + Math.sin(t * 1.1) * 0.12; });
    } else if (i === 2) { // gate that verifies, two unlinkable tickets
      [-1.55, 1.55].forEach((x) => mesh(geo(new THREE.BoxGeometry(0.7, 4.6, 0.9)), std(C.ink), x + 1.9, 2.3, 0, o));
      mesh(geo(new THREE.BoxGeometry(4.8, 0.7, 0.9)), std(C.ink), 1.9, 4.6, 0, o);
      const ring = mesh(geo(new THREE.TorusGeometry(0.9, 0.18, 16, 48)), std(C.leaf, { emissive: C.leaf, emissiveIntensity: 0.35 }), 1.9, 2.55, 0.1, o);
      const k1 = mesh(geo(new THREE.BoxGeometry(0.32, 1.1, 0.2)), std(C.leaf, { emissive: C.leaf, emissiveIntensity: 0.35 }), 1.62, 2.4, 0.12, o); k1.rotation.z = Math.PI / 4;
      const k2 = mesh(geo(new THREE.BoxGeometry(0.32, 1.9, 0.2)), std(C.leaf, { emissive: C.leaf, emissiveIntensity: 0.35 }), 2.2, 2.7, 0.12, o); k2.rotation.z = -Math.PI / 4;
      anim.push((t) => { ring.rotation.z = t * 0.6; });
      [[-3.4, 3.6, "0x91c2…07fe", "k = 3"], [-3.4, 1.4, "0x3ae7…b2d9", "k = 41"]].forEach(([x, y, a, b]) => {
        const tk = new THREE.Group(); tk.position.set(x as number, y as number, 0); o.add(tk);
        mesh(geo(new THREE.BoxGeometry(3.1, 1.6, 0.2)), std(0xffffff), 0, 0, 0, tk);
        mesh(geo(new THREE.PlaneGeometry(2.95, 1.45)), new THREE.MeshBasicMaterial({ map: tex(512, 256, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 512, 256); c.fillStyle = "#0d1217"; c.font = '700 50px "JetBrains Mono Variable", monospace'; c.fillText(a as string, 20, 110); c.fillStyle = "#46515c"; c.font = '500 38px "JetBrains Mono Variable", monospace'; c.fillText(b as string, 20, 180); }) }), 0, 0, 0.11, tk);
      });
    } else { // two shares, one line: the secret falls out
      const pts: [number, number][] = [[-3.2, 0.8], [-0.6, 2.5], [2.2, 4.3]];
      pts.forEach(([x, y], k) => mesh(geo(new THREE.SphereGeometry(k === 0 ? 0.42 : 0.36, 24, 18)), std(k === 0 ? C.signal : C.ink, k === 0 ? { emissive: C.signal, emissiveIntensity: 0.3 } : {}), x, y, 0, o));
      const len = Math.hypot(5.4, 3.5), line = mesh(geo(new THREE.CylinderGeometry(0.1, 0.1, len + 1.5, 12)), std(C.signal), -0.5, 2.55, 0, o);
      line.rotation.z = Math.atan2(3.5, 5.4) - Math.PI / 2;
      mesh(geo(new THREE.BoxGeometry(6.4, 0.18, 0.18)), std(C.ink), 0, 0.1, 0, o);
      mesh(geo(new THREE.BoxGeometry(0.18, 5, 0.18)), std(C.ink), -3.5, 2.5, 0, o);
      const keyG = new THREE.Group(); keyG.position.set(4.3, 2.4, 0); o.add(keyG);
      mesh(geo(new THREE.TorusGeometry(0.75, 0.2, 16, 36)), std(C.signal, { metalness: 0.4, roughness: 0.3 }), 0, 0.9, 0, keyG);
      mesh(geo(new THREE.BoxGeometry(0.28, 2.2, 0.28)), std(C.signal, { metalness: 0.4, roughness: 0.3 }), 0, -0.55, 0, keyG);
      mesh(geo(new THREE.BoxGeometry(0.8, 0.26, 0.26)), std(C.signal, { metalness: 0.4, roughness: 0.3 }), 0.4, -1.25, 0, keyG);
      const flying: THREE.Mesh[] = [0, 1, 2].map((k) => mesh(geo(new THREE.CylinderGeometry(0.62, 0.62, 0.2, 32)), std(C.amber, { metalness: 0.55, roughness: 0.32 }), 0, 0, 0, o));
      anim.push((t) => { keyG.rotation.y = t * 0.8; flying.forEach((c, k) => { const p = (t * 0.35 + k / 3) % 1; c.position.set(lerp(-1.2, 5.2, p), 0.5 + Math.sin(p * Math.PI) * 2.4, 1.6); c.rotation.set(t * 3 + k, 0, t * 2); }); });
    }
    return { g, anim };
  };
  const stations = [0, 1, 2, 3].map((i) => { const s = station(i); scene.add(s.g); return s; });

  /* ---- camera, loop, scroll ---- */
  let target = 0, cur = 0, w = 1, h = 1, raf = 0, running = false, lastScene = -2, last = performance.now();
  const OVC = new THREE.Vector3(33.5, 0, 19.5);
  const dirO = new THREE.Vector3(0, 0.8, 0.6).normalize(), dirD = new THREE.Vector3(0.3, 0.36, 0.88).normalize();
  const v = new THREE.Vector3(), f = new THREE.Vector3();
  const place = () => {
    const t = cur * T_END, { u, k } = stateAt(t);
    const [px, pz] = pathPt(u);
    train.position.set(px, 0, pz);
    const [qx, qz] = pathPt(u + 0.2);
    train.rotation.y = -Math.atan2(qz - pz, qx - px);
    paint(u);
    const wide = w > 860 / (small ? 1 : 1);
    const kk = k;
    f.set(lerp(OVC.x, px, kk), lerp(OVC.y, 3.6, kk), lerp(OVC.z, pz - 2.2, kk));
    const distO = wide ? 100 : 150, distD = wide ? 23 : 34;
    const dist = Math.exp(lerp(Math.log(distO), Math.log(distD), kk));
    v.copy(dirO).lerp(dirD, kk).normalize().multiplyScalar(dist).add(f);
    camera.position.copy(v); camera.lookAt(f);
    // keep the subject clear of the copy column on wide screens, above it on phones
    if (wide) camera.setViewOffset(w, h, -w * (0.05 + 0.08 * kk), h * 0.02 * kk, w, h); else camera.setViewOffset(w, h, 0, h * 0.2 * kk, w, h);
    const sc = sceneOf(t);
    if (sc !== lastScene) { lastScene = sc; opts.onScene(sc); }
  };
  const frame = (now: number) => {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    cur += (target - cur) * (1 - Math.exp(-dt * 8));
    if (Math.abs(target - cur) < 0.00002) cur = target;
    place();
    const t = now / 1000;
    stations.forEach((s) => s.anim.forEach((fn) => fn(t)));
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0 });
  io.observe(canvas);
  const resize = () => {
    w = canvas.clientWidth || 1; h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    place(); renderer.render(scene, camera);
  };
  resize();

  return {
    setProgress: (p: number) => { target = Math.max(0, Math.min(1, p)); },
    resize,
    dispose: () => {
      stop(); io.disconnect();
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose());
      scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m && "map" in m && m.map) m.map.dispose(); if (m && "dispose" in m) m.dispose(); });
      blocks.dispose(); ribbon.dispose(); renderer.dispose();
    },
  };
}
