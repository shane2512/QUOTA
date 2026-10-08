"use client";

/* Night-sky starfield drawn as ~500 point sprites instead of a per-pixel shader. The old fullscreen shader weighed
   every pixel against 36 stars (about 20 ms a frame on an integrated GPU); sprites only touch the pixels a star covers,
   so the same slow drift, twinkle and cross flares cost well under a millisecond. */
import { Renderer, Program, Mesh, Geometry } from "ogl";
import { useEffect, useRef } from "react";

const vertex = `
attribute vec2 position;
attribute vec3 params; // x: size in px at 800px height, y: twinkle seed, z: flare 0..1
uniform float uTime;
uniform float uAspect;
uniform float uScale; // canvas height / 800, times dpr
varying float vAlpha;
varying float vFlare;
void main() {
  float a = uTime * 0.012; // slow drift of the whole sky
  vec2 p = vec2(position.x * cos(a) - position.y * sin(a), position.x * sin(a) + position.y * cos(a));
  gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
  float tw = 0.78 + 0.22 * sin(uTime * (0.5 + params.y * 0.9) + params.y * 40.0);
  vAlpha = tw * (0.7 + 0.3 * params.y);
  vFlare = params.z;
  gl_PointSize = params.x * uScale * (1.0 + params.z * 3.2);
}`;

const fragment = `
precision mediump float;
varying float vAlpha;
varying float vFlare;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  float core = exp(-d * d * (10.0 + vFlare * 22.0)) * 1.1;
  float halo = 0.24 * exp(-d * 4.5) * (1.0 - vFlare * 0.7);
  float cross = vFlare * (exp(-abs(p.x) * 42.0) * exp(-abs(p.y) * 2.3) + exp(-abs(p.y) * 42.0) * exp(-abs(p.x) * 2.3)) * 1.25;
  float k = (core + halo + cross) * smoothstep(1.0, 0.6, d);
  gl_FragColor = vec4(vec3(0.93, 0.95, 1.0), clamp(k * vAlpha * 1.5, 0.0, 1.0));
}`;

const STARS = 520;

type Props = { /** frames are only drawn while run.current is true */ run?: { current: boolean } };

export default function Stars({ run }: Props) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false, antialias: false, dpr: Math.min(window.devicePixelRatio || 1, 1.5) });
    const gl = renderer.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    // positions fill a disc wide enough that the slow rotation never exposes an empty corner
    const pos = new Float32Array(STARS * 2), par = new Float32Array(STARS * 3);
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; // fixed seed: the same sky every visit
    for (let i = 0; i < STARS; i++) {
      const r = Math.sqrt(rnd()) * 2.1, th = rnd() * Math.PI * 2;
      pos[i * 2] = Math.cos(th) * r; pos[i * 2 + 1] = Math.sin(th) * r;
      const big = rnd() > 0.965;
      par[i * 3] = big ? 7 + rnd() * 4 : 3.6 + rnd() * rnd() * 8;
      par[i * 3 + 1] = rnd();
      par[i * 3 + 2] = big ? 0.55 + rnd() * 0.45 : 0;
    }
    const program = new Program(gl, { vertex, fragment, transparent: true, depthTest: false, uniforms: { uTime: { value: 0 }, uAspect: { value: 1 }, uScale: { value: 1 } } });
    const mesh = new Mesh(gl, { mode: gl.POINTS, geometry: new Geometry(gl, { position: { size: 2, data: pos }, params: { size: 3, data: par } }), program });

    const resize = () => {
      renderer.setSize(el.offsetWidth, el.offsetHeight);
      program.uniforms.uAspect.value = el.offsetWidth / Math.max(1, el.offsetHeight); // x is in aspect units, y in -1..1
      program.uniforms.uScale.value = (el.offsetHeight / 800) * renderer.dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    el.appendChild(gl.canvas);

    let raf = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (run && !run.current) return;
      program.uniforms.uTime.value = t * 0.001;
      renderer.render({ scene: mesh });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      if (gl.canvas.parentElement === el) el.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [run]);

  return <div ref={box} className="galaxy-container" />;
}
