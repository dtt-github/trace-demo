/** Three.js scene for TRACE routing visualization. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COLORS = {
  compressor: 0x3b6ea5,
  aftercooler: 0x5a9e99,
  vessel: 0xc45b55,
  frame: 0xa8a29e,
  F1: 0x8f6a9e, C1: 0x3b6ea5, M1: 0x8a6a52, A1: 0x5a9e99,
  V1: 0xc45b55, R1: 0xd4a84b, DH: 0x6b7280, CT: 0xa8a29e,
};

const TUBE_COLORS = {
  "TR-07": 0xc2410c,
  "TR-01": 0xc2410c, "TR-02": 0xb91c1c, "TR-03": 0x15803d,
  "TR-04": 0x1d4ed8, "TR-05": 0x7e22ce,
};

export class TraceViewer {
  constructor(container) {
    this.container = container;
    this._lastPcg = null;
    this._lastRoutes = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8edf2);
    this.scene.fog = new THREE.Fog(0xe8edf2, 4500, 9000);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    const w = container.clientWidth || 640;
    const h = container.clientHeight || 420;
    this.camera = new THREE.PerspectiveCamera(40, w / h, 1, 30000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.92;

    const hemi = new THREE.HemisphereLight(0xf8fafc, 0xb0b8c4, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(1400, 2200, 1100);
    const fill = new THREE.DirectionalLight(0xdbe4ee, 0.4);
    fill.position.set(-1200, 600, -800);
    this.scene.add(hemi, key, fill);

    // Data is Z-up; GridHelper defaults to XZ (Y-up floor) → rotate onto XY.
    this._grid = new THREE.GridHelper(4800, 48, 0xb0bac6, 0xcbd2db);
    this._grid.rotation.x = Math.PI / 2;
    this._grid.position.set(1200, 600, 0);
    if (Array.isArray(this._grid.material)) {
      this._grid.material.forEach((m) => { m.transparent = true; m.opacity = 0.5; });
    } else {
      this._grid.material.transparent = true;
      this._grid.material.opacity = 0.5;
    }
    this.scene.add(this._grid);

    this._anim = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(this._anim);
    };
    this._anim();

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight || 420;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  clear() {
    while (this.group.children.length) {
      const obj = this.group.children[0];
      this.group.remove(obj);
      obj.traverse?.((n) => {
        n.geometry?.dispose?.();
        if (n.material) {
          if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose());
          else n.material.dispose();
        }
      });
    }
  }

  addBox(mn, mx, color, opacity = 0.38) {
    const size = mx.map((v, i) => v - mn[i]);
    const center = mn.map((v, i) => v + size[i] / 2);
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.72,
      metalness: 0.08,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(center[0], center[1], center[2]);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.45 })
    );
    edges.position.copy(mesh.position);
    this.group.add(mesh, edges);
  }

  addEnvelope(mn, mx) {
    const size = mx.map((v, i) => v - mn[i]);
    const center = mn.map((v, i) => v + size[i] / 2);
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineDashedMaterial({
        color: 0x6b7280,
        dashSize: 40,
        gapSize: 24,
        transparent: true,
        opacity: 0.55,
      })
    );
    edges.computeLineDistances();
    edges.position.set(center[0], center[1], center[2]);
    this.group.add(edges);
  }

  addRoute(id, waypoints, dn = 50) {
    const pts = waypoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.08);
    const radius = 3 + dn / 16;
    const geo = new THREE.TubeGeometry(curve, Math.max(pts.length * 12, 48), radius, 12, false);
    const color = TUBE_COLORS[id] ?? 0xc2410c;
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.25,
    });
    this.group.add(new THREE.Mesh(geo, mat));
  }

  addPorts(ports) {
    const geo = new THREE.SphereGeometry(10, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.2 });
    for (const p of ports) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.position.x, p.position.y, p.position.z);
      this.group.add(m);
    }
  }

  drawScene(pcg, { fit = true } = {}) {
    this.clear();
    for (const c of pcg.components) {
      const mn = [c.bbox_min.x, c.bbox_min.y, c.bbox_min.z];
      const mx = [c.bbox_max.x, c.bbox_max.y, c.bbox_max.z];
      const color = COLORS[c.id] ?? COLORS[c.cls] ?? 0x888888;
      this.addBox(mn, mx, color);
    }
    if (pcg.zones?.[0]) {
      const z = pcg.zones[0];
      this.addEnvelope(
        [z.bbox_min.x, z.bbox_min.y, z.bbox_min.z],
        [z.bbox_max.x, z.bbox_max.y, z.bbox_max.z]
      );
    }
    if (pcg.ports) this.addPorts(pcg.ports);
    if (fit) this.fitCamera(pcg.zones?.[0] || pcg.components[0]);
  }

  showPcg(pcg, routes = null) {
    this._lastPcg = pcg;
    this._lastRoutes = routes;
    this.drawScene(pcg);
    if (routes) {
      for (const [id, r] of Object.entries(routes)) {
        this.addRoute(id, r.waypoints, r.dn);
      }
    }
  }

  /** Clear tubes, then draw each route growing along its waypoints. */
  async playRoutes(pcg, routes, { stepMs = 90 } = {}) {
    this._lastPcg = pcg;
    this._lastRoutes = routes;
    if (this._playToken) this._playToken.cancelled = true;
    const token = { cancelled: false };
    this._playToken = token;

    this.drawScene(pcg, { fit: !this._hasFramed });
    this._hasFramed = true;
    await sleep(180);
    if (token.cancelled) return;

    for (const [id, r] of Object.entries(routes)) {
      const wps = r.waypoints;
      for (let i = 2; i <= wps.length; i++) {
        if (token.cancelled) return;
        // Remove previous partial for this id by rebuilding scene + finished routes
        this.drawScene(pcg, { fit: false });
        for (const [doneId, done] of Object.entries(routes)) {
          if (doneId === id) break;
          this.addRoute(doneId, done.waypoints, done.dn);
        }
        this.addRoute(id, wps.slice(0, i), r.dn);
        await sleep(stepMs);
      }
    }
  }

  refit() {
    if (this._lastPcg) {
      this.fitCamera(this._lastPcg.zones?.[0] || this._lastPcg.components[0]);
    }
  }

  fitCamera(zoneOrComp) {
    let mn;
    let mx;
    if (zoneOrComp?.bbox_min) {
      mn = [zoneOrComp.bbox_min.x, zoneOrComp.bbox_min.y, zoneOrComp.bbox_min.z];
      mx = [zoneOrComp.bbox_max.x, zoneOrComp.bbox_max.y, zoneOrComp.bbox_max.z];
    } else {
      mn = [0, 0, 0];
      mx = [2000, 1000, 1100];
    }
    const center = mn.map((v, i) => (v + mx[i]) / 2);
    const span = Math.max(...mx.map((v, i) => v - mn[i]), 800);
    this.camera.position.set(
      center[0] + span * 0.85,
      center[1] + span * 0.55,
      center[2] + span * 0.7
    );
    this.controls.target.set(center[0], center[1], center[2] * 0.45);
    this.controls.update();
  }

  dispose() {
    if (this._playToken) this._playToken.cancelled = true;
    this._ro.disconnect();
    this.renderer.dispose();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
