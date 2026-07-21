/** Three.js 3D scene for TRACE routing visualization. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COLORS = {
  compressor: 0x4c78a8,
  aftercooler: 0x72b7b2,
  vessel: 0xe45756,
  frame: 0xbab0ac,
  F1: 0xb279a2, C1: 0x4c78a8, M1: 0x9d755d, A1: 0x72b7b2,
  V1: 0xe45756, R1: 0xf2cf5b, DH: 0x7f7f7f, CT: 0xbab0ac,
};

const TUBE_COLORS = {
  "TR-07": 0xf58518,
  "TR-01": 0xf58518, "TR-02": 0xe45756, "TR-03": 0x54a24b,
  "TR-04": 0x4c78a8, "TR-05": 0xb279a2,
};

export class TraceViewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e14);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const w = container.clientWidth || 640;
    const h = container.clientHeight || 420;
    this.camera = new THREE.PerspectiveCamera(42, w / h, 1, 20000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(1200, 1800, 900);
    this.scene.add(amb, dir);

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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  clear() {
    while (this.group.children.length)
      this.group.remove(this.group.children[0]);
  }

  addBox(mn, mx, color, opacity = 0.35) {
    const size = mx.map((v, i) => v - mn[i]);
    const center = mn.map((v, i) => v + size[i] / 2);
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mat = new THREE.MeshPhongMaterial({
      color, transparent: true, opacity, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(center[0], center[1], center[2]);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x333333 })
    );
    edges.position.copy(mesh.position);
    this.group.add(mesh, edges);
  }

  addEnvelope(mn, mx) {
    const size = mx.map((v, i) => v - mn[i]);
    const center = mn.map((v, i) => v + size[i] / 2);
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x999999, transparent: true, opacity: 0.04, wireframe: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(center[0], center[1], center[2]);
    this.group.add(mesh);
  }

  addRoute(id, waypoints, dn = 50) {
    const pts = waypoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.15);
    const radius = 2 + dn / 18;
    const geo = new THREE.TubeGeometry(curve, Math.max(pts.length * 8, 32), radius, 8, false);
    const color = TUBE_COLORS[id] ?? 0xf58518;
    const mat = new THREE.MeshPhongMaterial({ color, shininess: 30 });
    this.group.add(new THREE.Mesh(geo, mat));
  }

  addPorts(ports) {
    const geo = new THREE.SphereGeometry(12, 12, 12);
    const mat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    for (const p of ports) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.position.x, p.position.y, p.position.z);
      this.group.add(m);
    }
  }

  showPcg(pcg, routes = null) {
    this.clear();
    for (const c of pcg.components) {
      const mn = [c.bbox_min.x, c.bbox_min.y, c.bbox_min.z];
      const mx = [c.bbox_max.x, c.bbox_max.y, c.bbox_max.z];
      const color = COLORS[c.id] ?? COLORS[c.cls] ?? 0x888888;
      this.addBox(mn, mx, color);
    }
    if (pcg.zones?.[0]) {
      const z = pcg.zones[0];
      this.addEnvelope([z.bbox_min.x, z.bbox_min.y, z.bbox_min.z],
                       [z.bbox_max.x, z.bbox_max.y, z.bbox_max.z]);
    }
    if (routes) {
      for (const [id, r] of Object.entries(routes))
        this.addRoute(id, r.waypoints, r.dn);
    }
    if (pcg.ports) this.addPorts(pcg.ports);
    this.fitCamera(pcg.zones?.[0] || pcg.components[0]);
  }

  fitCamera(zoneOrComp) {
    let mn, mx;
    if (zoneOrComp.bbox_min) {
      mn = [zoneOrComp.bbox_min.x, zoneOrComp.bbox_min.y, zoneOrComp.bbox_min.z];
      mx = [zoneOrComp.bbox_max.x, zoneOrComp.bbox_max.y, zoneOrComp.bbox_max.z];
    } else {
      mn = [0, 0, 0]; mx = [2000, 1000, 1100];
    }
    const center = mn.map((v, i) => (v + mx[i]) / 2);
    const span = Math.max(...mx.map((v, i) => v - mn[i]));
    this.camera.position.set(center[0] + span * 0.9, center[1] + span * 0.6, center[2] + span * 0.7);
    this.controls.target.set(center[0], center[1], center[2]);
    this.controls.update();
  }

  dispose() {
    this._ro.disconnect();
    this.renderer.dispose();
  }
}
