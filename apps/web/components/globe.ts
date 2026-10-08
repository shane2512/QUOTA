import * as THREE from "three";
import { EARTH } from "./earth";

/* Night-side earth for the landing story: city lights, a lit cap from a sun above and behind, and a rim of atmosphere.
   Renders only while it is on screen and not fully dimmed, at a capped pixel ratio, so it stays cheap. */
/* ImageBitmapLoader decodes off the main thread, so the swap to 4k does not stall scrolling. */
function loadTexture(url: string, anisotropy: number) {
  return new Promise<THREE.Texture>((resolve, reject) => {
    new THREE.ImageBitmapLoader().setOptions({ imageOrientation: "flipY" }).load(url, (bitmap) => {
      const t = new THREE.Texture(bitmap as unknown as HTMLImageElement);
      t.anisotropy = anisotropy;
      t.needsUpdate = true;
      resolve(t);
    }, undefined, reject);
  });
}

export function createGlobe(canvas: HTMLCanvasElement) {
  // no MSAA: on an integrated GPU 4x samples over a 90vw canvas cost more than the soft limb ever shows
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  const PR = (level: number) => [Math.min(window.devicePixelRatio || 1, 1.25), 1, 0.8][level] ?? 0.8; // level 0 is full quality; Story steps down only if frames run slow
  renderer.setPixelRatio(PR(0));
  // a hint only (renderer strings are often masked): integrated GPUs start at the lighter level, the governor in Story decides the rest
  const gx = renderer.getContext(), dbg = gx.getExtension("WEBGL_debug_renderer_info");
  const weak = /Intel\(R\) (UHD|HD|Iris)|Radeon\(TM\) Graphics|Radeon Graphics|Vega|Mali|Adreno|SwiftShader/i.test(dbg ? String(gx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 4.55);

  const aniso = Math.min(2, renderer.capabilities.getMaxAnisotropy()); // a sphere seen face-on needs little; 8x doubled the texture reads
  let loaded = 0, disposed = false;
  let dayTex: THREE.Texture | null = null, nightTex: THREE.Texture | null = null;
  const use = (day: THREE.Texture, night: THREE.Texture) => {
    if (disposed) { day.dispose(); night.dispose(); return; }
    dayTex?.dispose(); nightTex?.dispose();
    dayTex = day; nightTex = night;
    earthMat.uniforms.dayTex.value = day; earthMat.uniforms.nightTex.value = night;
    loaded = 2; draw(); sync();
  };
  const pair = (p: { day: string; night: string }) => Promise.all([loadTexture(p.day, aniso), loadTexture(p.night, aniso)]);
  const lowReady = pair(EARTH.low);
  const highReady = pair(EARTH.high); // both requests start now; the low pair just lands first

  const sunDir = new THREE.Vector3(0.1, 0.62, -0.78).normalize();
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { dayTex: { value: null as THREE.Texture | null }, nightTex: { value: null as THREE.Texture | null }, sunDir: { value: sunDir }, dim: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D dayTex, nightTex; uniform vec3 sunDir; uniform float dim; varying vec2 vUv; varying vec3 vN;
      void main(){
        vec3 n = normalize(vN); float l = dot(n, sunDir);
        float dayAmt = smoothstep(0.02, 0.5, l);
        vec3 day = texture2D(dayTex, vUv).rgb; float g = dot(day, vec3(.3,.59,.11));
        day = mix(vec3(g), day, .3) * vec3(.74,.83,1.0) * 1.15;
        vec3 nt = texture2D(nightTex, vUv).rgb; // Black Marble: city lights over faintly lit land
        vec3 lit = clamp((nt - .14) / .62, 0., 1.); // only city lights clear the threshold; faint land stays dark
        vec3 night = pow(lit, vec3(1.15)) * 3.2 * vec3(1.0,.84,.58) + nt * vec3(.03,.035,.06);
        vec3 col = mix(vec3(.018,.026,.05) + day * .05 + night * (1.0 - dayAmt), day, dayAmt);
        float fres = pow(1.0 - max(dot(n, vec3(0,0,1)), 0.0), 2.6);
        col += vec3(.42,.58,1.0) * fres * (.08 + .34 * smoothstep(-.3,.7,l)); // a thin limb, not a halo
        gl_FragColor = vec4(col * dim, dim);
      }`,
  });
  const earthGeo = new THREE.SphereGeometry(1, 96, 96);
  const earth = new THREE.Mesh(earthGeo, earthMat);
  earth.rotation.set(0.32, -1.95, 0.06); // Atlantic toward the camera: Americas left, Europe and Africa right
  scene.add(earth);

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sunDir }, dim: { value: 1 } },
    vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 sunDir; uniform float dim; varying vec3 vN;
      void main(){
        float i = pow(clamp(.72 - dot(normalize(vN), vec3(0,0,1)), 0., 1.), 3.2);
        float lit = .45 + .9 * smoothstep(-.3,.8, dot(normalize(vN), sunDir));
        gl_FragColor = vec4(vec3(.55,.68,1.0) * i * lit * 0.42 * dim, 1.0);
      }`,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const atmoGeo = new THREE.SphereGeometry(1.035, 64, 64);
  scene.add(new THREE.Mesh(atmoGeo, atmoMat));

  let dim = 1, spin = 0, visible = true, raf = 0, running = false;
  let high = false;
  lowReady.then(([d, n]) => { if (!high) use(d, n); else { d.dispose(); n.dispose(); } }).catch(() => {});
  highReady.then(([d, n]) => { high = true; use(d, n); }).catch(() => {}); // keep the low pair if the full one fails
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now();
  function draw() {
    earth.rotation.y = -1.95 + spin + (calm ? 0 : (performance.now() - t0) / 1000 * 0.006);
    earthMat.uniforms.dim.value = atmoMat.uniforms.dim.value = dim;
    renderer.render(scene, camera);
  }
  const loop = () => { draw(); raf = requestAnimationFrame(loop); };
  const sync = () => {
    const want = visible && dim > 0.002 && loaded === 2 && !document.hidden;
    if (want && !running) { running = true; raf = requestAnimationFrame(loop); }
    if (!want && running) { running = false; cancelAnimationFrame(raf); }
  };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); });
  io.observe(canvas);
  document.addEventListener("visibilitychange", sync);

  const resize = () => {
    const s = canvas.clientWidth || 1;
    renderer.setSize(s, s, false);
    draw();
  };
  resize();

  return {
    set(next: { dim?: number; spin?: number }) {
      if (next.dim !== undefined) dim = next.dim;
      if (next.spin !== undefined) spin = next.spin;
      sync();
      if (!running && dim <= 0.002) draw(); // paint the final dark frame once
    },
    resize,
    weak,
    quality(level: number) { renderer.setPixelRatio(PR(level)); resize(); },
    dispose() {
      running = false; cancelAnimationFrame(raf); io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      [earthGeo, atmoGeo].forEach((g) => g.dispose()); [earthMat, atmoMat].forEach((m) => m.dispose());
      disposed = true; dayTex?.dispose(); nightTex?.dispose(); renderer.dispose();
    },
  };
}
