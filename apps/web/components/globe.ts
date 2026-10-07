import * as THREE from "three";

/* Night-side earth for the landing story: city lights, a lit cap from a sun above and behind, and a rim of atmosphere.
   Renders only while it is on screen and not fully dimmed, at a capped pixel ratio, so it stays cheap. */
const TEX = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/";

export function createGlobe(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 4.55);

  const loader = new THREE.TextureLoader();
  let loaded = 0;
  const onTex = () => { loaded++; draw(); sync(); }; // fires after load, once sync below exists
  const dayTex = loader.load(TEX + "earth_atmos_2048.jpg", onTex);
  const nightTex = loader.load(TEX + "earth_lights_2048.png", onTex);
  dayTex.anisotropy = nightTex.anisotropy = 4;

  const sunDir = new THREE.Vector3(0.1, 0.62, -0.78).normalize();
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { dayTex: { value: dayTex }, nightTex: { value: nightTex }, sunDir: { value: sunDir }, dim: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D dayTex, nightTex; uniform vec3 sunDir; uniform float dim; varying vec2 vUv; varying vec3 vN;
      void main(){
        vec3 n = normalize(vN); float l = dot(n, sunDir);
        float dayAmt = smoothstep(0.02, 0.5, l);
        vec3 day = texture2D(dayTex, vUv).rgb; float g = dot(day, vec3(.3,.59,.11));
        day = mix(vec3(g), day, .3) * vec3(.74,.83,1.0) * 1.15;
        vec3 night = pow(texture2D(nightTex, vUv).rgb, vec3(1.15)) * vec3(1.0,.86,.62) * 1.9;
        vec3 col = mix(vec3(.018,.026,.05) + day * .05 + night * (1.0 - dayAmt), day, dayAmt);
        float fres = pow(1.0 - max(dot(n, vec3(0,0,1)), 0.0), 2.6);
        col += vec3(.42,.58,1.0) * fres * (.22 + .8 * smoothstep(-.3,.7,l));
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
        float i = pow(clamp(.72 - dot(normalize(vN), vec3(0,0,1)), 0., 1.), 2.4);
        float lit = .45 + .9 * smoothstep(-.3,.8, dot(normalize(vN), sunDir));
        gl_FragColor = vec4(vec3(.55,.68,1.0) * i * lit * 1.05 * dim, 1.0);
      }`,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const atmoGeo = new THREE.SphereGeometry(1.075, 64, 64);
  scene.add(new THREE.Mesh(atmoGeo, atmoMat));

  let dim = 1, spin = 0, visible = true, raf = 0, running = false;
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
    dispose() {
      running = false; cancelAnimationFrame(raf); io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      [earthGeo, atmoGeo].forEach((g) => g.dispose()); [earthMat, atmoMat].forEach((m) => m.dispose());
      dayTex.dispose(); nightTex.dispose(); renderer.dispose();
    },
  };
}
