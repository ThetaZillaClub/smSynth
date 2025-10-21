'use client';

import { useEffect, useRef, useState } from 'react';

export default function NotFound() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Gate UI so no text renders until ready/fallback -> no white flash
  const [ready, setReady] = useState(false);
  const [fallbackOn, setFallbackOn] = useState(false);

  useEffect(() => {
    let iifeCleanup: (() => void) | null = null;

    if (containerRef.current) containerRef.current.innerHTML = '';

    (async () => {
      const THREE: typeof import('three') = await import('three');

      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      const container = containerRef.current!;

      let renderer: import('three').WebGLRenderer | null = null;
      let scene: import('three').Scene;
      let camera: import('three').PerspectiveCamera;
      let clock: import('three').Clock;
      let petalsGroup: import('three').Group;
      let particles:
        | import('three').Points<
            import('three').BufferGeometry,
            import('three').Material | import('three').Material[]
          >
        | null = null; // stars
      let raycaster: import('three').Raycaster;
      const pointer = new THREE.Vector2();
      let INTERSECTED = -1;

      // assets to dispose
      let petalGeo: import('three').ExtrudeGeometry | null = null;
      let spriteTex: import('three').CanvasTexture | null = null;

      const disposeMaterial = (m: import('three').Material | import('three').Material[]) => {
        if (Array.isArray(m)) m.forEach(mm => mm.dispose());
        else m.dispose();
      };

      const cleanupFns: Array<() => void> = [];

      function init(): boolean {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        if (!renderer || !renderer.getContext()) {
          setFallbackOn(true);
          return false;
        }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.setClearColor(0x000000, 0); // transparent so the gradient shows immediately
        container.appendChild(renderer.domElement);

        // As soon as the canvas is mounted, allow non-fallback UI (no text flash)
        setReady(true);

        scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x0b0b0b, 300, 1200);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
        camera.position.set(0, 0, 260);

        // lights
        scene.add(new THREE.HemisphereLight(0xcccccc, 0x101010, 0.7));
        const key = new THREE.DirectionalLight(0xffffff, 1.0);
        key.position.set(120, 200, 160);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x6fa2ff, 0.5);
        rim.position.set(-160, 120, -200);
        scene.add(rim);

        // stars
        buildStars();

        // petals
        petalsGroup = new THREE.Group();
        scene.add(petalsGroup);

        const colors = [0xff0000, 0xff8c00, 0xffa500, 0x008000, 0x0000ff, 0x800080, 0x4b0082];
        const W = 33, H = 77, DEPTH = 30, INNER_GAP = 28;

        const petalShape = makePetalShape({ w: W, h: H });
        petalGeo = new THREE.ExtrudeGeometry(petalShape, {
          depth: DEPTH,
          bevelEnabled: true,
          bevelThickness: 2.2,
          bevelSize: 2.2,
          bevelSegments: 16,
          steps: 2,
          curveSegments: 64
        });
        petalGeo.translate(0, INNER_GAP, 0);
        crownPetalGeometry(petalGeo, { w: W, h: H, depth: DEPTH, inset: INNER_GAP, amount: 7.5 });
        petalGeo.computeVertexNormals();

        for (let i = 0; i < 7; i++) {
          const mat = new THREE.MeshPhysicalMaterial({
            color: colors[i],
            roughness: 0.28,
            metalness: 0.12,
            clearcoat: 0.8,
            clearcoatRoughness: 0.25,
            sheen: 0.15
          });
          const mesh = new THREE.Mesh(petalGeo, mat);
          mesh.renderOrder = 10;
          const a = (i / 7) * Math.PI * 2;
          mesh.rotation.z = a;
          petalsGroup.add(mesh);
        }

        clock = new THREE.Clock();

        const onResize = () => {
          const w = window.innerWidth, h = window.innerHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer!.setSize(w, h);
        };

        const onPointerMove = (e: PointerEvent) => {
          const w = window.innerWidth, h = window.innerHeight;
          pointer.x = (e.clientX / w) * 2 - 1;
          pointer.y = -(e.clientY / h) * 2 + 1;
        };

        const onVisibility = () => {
          if (document.hidden) {
            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
          } else if (!prefersReduced && rafRef.current == null) {
            animate();
          }
        };

        window.addEventListener('resize', onResize);
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);

        cleanupFns.push(() => {
          window.removeEventListener('resize', onResize);
          window.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('visibilitychange', onVisibility);
        });

        if (prefersReduced) renderer!.render(scene, camera);
        return true;
      }

      function buildStars() {
        spriteTex = makeDiscTexture();

        const COUNT = 2600;
        const pos = new Float32Array(COUNT * 3);
        const sizeAttr = new Float32Array(COUNT);

        for (let i = 0; i < COUNT; i++) {
          const i3 = i * 3;
          pos[i3 + 0] = THREE.MathUtils.randFloatSpread(1400);
          pos[i3 + 1] = THREE.MathUtils.randFloatSpread(900);
          pos[i3 + 2] = THREE.MathUtils.randFloat(-1100, -320); // behind petals
          sizeAttr[i] = 10;
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geom.setAttribute('size', new THREE.BufferAttribute(sizeAttr, 1));

        const material = new THREE.ShaderMaterial({
          uniforms: { pointTexture: { value: spriteTex! } },
          vertexShader: `
            attribute float size;
            void main() {
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = size * (300.0 / -mvPosition.z);
              gl_Position = projectionMatrix * mvPosition;
            }
          `,
          fragmentShader: `
            uniform sampler2D pointTexture;
            void main() {
              vec4 c = texture2D(pointTexture, gl_PointCoord);
              if (c.a < 0.1) discard;
              gl_FragColor = c;
            }
          `,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });

        particles = new THREE.Points(geom, material);
        particles.renderOrder = 0;
        particles.frustumCulled = false;
        scene.add(particles);

        raycaster = new THREE.Raycaster();
      }

      function makeDiscTexture(): import('three').CanvasTexture {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const r = size / 2;

        ctx.clearRect(0, 0, size, size);

        const halo = ctx.createRadialGradient(r, r, r * 0.35, r, r, r);
        halo.addColorStop(0.0, 'rgba(255,255,255,0.25)');
        halo.addColorStop(0.55, 'rgba(255,255,255,0.12)');
        halo.addColorStop(1.0, 'rgba(255,255,255,0.00)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();

        const core = ctx.createRadialGradient(r, r, 0, r, r, r * 0.55);
        core.addColorStop(0.0, 'rgba(249,249,249,0.95)');
        core.addColorStop(0.7, 'rgba(249,249,249,0.65)');
        core.addColorStop(1.0, 'rgba(249,249,249,0.0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(r, r, r * 0.55, 0, Math.PI * 2); ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        tex.minFilter = THREE.LinearMipMapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
      }

      function makePetalShape({ w = 36, h = 90 }: { w?: number; h?: number }) {
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.bezierCurveTo(+w * 0.95, h * 0.15, +w * 0.75, h * 0.72, 0, h);
        s.bezierCurveTo(-w * 0.75, h * 0.72, -w * 0.95, h * 0.15, 0, 0);
        return s;
      }

      function crownPetalGeometry(
        geo: import('three').ExtrudeGeometry,
        opts: { w: number; h: number; depth: number; inset?: number; amount?: number }
      ) {
        const { w, h, depth, inset = 0, amount = 6 } = opts;
        const pos = geo.attributes.position as import('three').BufferAttribute;
        const v = new THREE.Vector3();
        const mid = depth * 0.5;
        const halfW = w * 1.05;

        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          const xN = Math.min(Math.abs(v.x) / halfW, 1);
          const yN = Math.min(Math.max((v.y - inset) / h, 0), 1);
          const fallX = 1 - xN;
          const fallY = Math.sin(Math.PI * yN);
          const bulge = amount * fallX * fallY;
          if (v.z >= mid) v.z += bulge; else v.z -= bulge;
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
      }

      function animate() {
        if (!renderer) return;
        const t = clock.getElapsedTime?.() ?? 0;

        // ✅ no 'any' and no short-circuit expression
        if (petalsGroup) {
          petalsGroup.rotation.z = -t * 0.35;
        }

        if (particles) {
          particles.rotation.y += 0.0002;
          particles.rotation.x += 0.00008;

          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObject(particles);
          if (hits.length > 0) {
            const sizes = particles.geometry.getAttribute('size') as import('three').BufferAttribute;
            const arr = sizes.array as Float32Array;
            const idx = hits[0].index ?? -1;
            if (idx >= 0 && INTERSECTED !== idx) {
              if (INTERSECTED >= 0) arr[INTERSECTED] = 10;
              INTERSECTED = idx;
              arr[INTERSECTED] = 13;
              sizes.needsUpdate = true;
            }
          } else if (INTERSECTED !== -1) {
            const sizes = particles.geometry.getAttribute('size') as import('three').BufferAttribute;
            (sizes.array as Float32Array)[INTERSECTED] = 10;
            sizes.needsUpdate = true;
            INTERSECTED = -1;
          }
        }

        renderer.render(scene, camera);
        rafRef.current = requestAnimationFrame(animate);
      }

      const ok = init();
      if (!ok) return;

      if (!prefersReduced) animate();

      // Build the cleanup to run on unmount
      iifeCleanup = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;

        try {
          if (renderer) {
            renderer.dispose();
            const dom = renderer.domElement;
            if (dom && dom.parentElement) dom.parentElement.removeChild(dom);
          }
        } catch {}
        try {
          if (particles) {
            particles.geometry.dispose();
            disposeMaterial(particles.material);
          }
        } catch {}
        try {
          petalGeo?.dispose();
          spriteTex?.dispose();
        } catch {}
        // Run listener removals, if any were queued
        try {
          cleanupFns.forEach(fn => fn());
        } catch {}
      };
    })().catch(() => {
      setFallbackOn(true);
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (iifeCleanup) iifeCleanup();
    };
  }, []);

  // Inline critical paint so body never flashes white
  const wrapperStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    overflow: 'hidden',
    color: '#e8e8e8',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    backgroundColor: '#0a0a0a',
    backgroundImage:
      'radial-gradient(1100px 540px at 50% 20%, rgba(255,255,255,0.06), transparent 70%), linear-gradient(#0a0a0a, #111213)',
  };

  return (
    <div className="pageRoot" style={wrapperStyle}>
      <div id="app" ref={containerRef} />

      {/* Only render fallback text if we truly need it */}
      {fallbackOn && (
        <div className="fallback">
          <div>
            <h2>PitchTime</h2>
            <p>This demo needs WebGL. Please try a modern browser.</p>
            <div className="badge">three.js placeholder</div>
          </div>
        </div>
      )}

      {/* Only render footer when the canvas is in or we’re in fallback */}
      {(ready || fallbackOn) && <div className="foot">© 2025 ScaleModeTools</div>}

      <style jsx>{`
        #app { position: fixed; inset: 0; }
        .fallback {
          position: fixed; inset: 0;
          display: flex; align-items: center; justify-content: center;
          text-align: center; padding: 24px; color: #ddd;
        }
        .badge {
          display: inline-block; padding: 6px 10px; border-radius: 999px;
          border: 1px solid #333; background: #1a1a1a; margin-top: 8px; font-size: 12px; color:#bbb;
        }
        .foot {
          position: fixed; left: 0; right: 0; bottom: 10px;
          text-align: center; font-size: 12px; color: #bbb; opacity: .9;
        }
      `}</style>
    </div>
  );
}
