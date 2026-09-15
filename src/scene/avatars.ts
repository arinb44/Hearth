import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const SMOOTHING = 12; // higher = snappier interpolation toward the latest position
const BOB_SPEED = 13;

function shortestAngle(from: number, to: number): number {
  const tau = Math.PI * 2;
  return ((((to - from) % tau) + tau * 1.5) % tau) - Math.PI;
}

/** A small low-poly character with a floating name tag. */
export class Avatar {
  readonly root = new THREE.Group();
  private readonly body: THREE.Group;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly tag: HTMLDivElement;
  private readonly target = new THREE.Vector3();
  private targetHeading = 0;
  private walkTime = 0;

  constructor(name: string, color: number, isLocal: boolean) {
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: '#ffe0bd',
      flatShading: true,
    });
    const dark = new THREE.MeshStandardMaterial({ color: '#2b2d42' });

    this.body = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.34, 0.62, 6),
      this.bodyMaterial,
    );
    torso.position.y = 0.36;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), skin);
    head.position.y = 0.9;
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.26, 6),
      this.bodyMaterial,
    );
    hat.position.y = 1.2;
    const eyeGeometry = new THREE.BoxGeometry(0.05, 0.08, 0.04);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, dark);
      eye.position.set(0.09 * side, 0.93, 0.23);
      this.body.add(eye);
    }
    this.body.add(torso, head, hat);
    this.body.traverse((o) => (o.castShadow = true));
    this.root.add(this.body);

    this.tag = document.createElement('div');
    this.tag.className = isLocal ? 'nametag nametag-local' : 'nametag';
    const label = new CSS2DObject(this.tag);
    label.position.y = 1.65;
    this.root.add(label);
    this.setLook(name, color);
  }

  setLook(name: string, color: number): void {
    this.tag.textContent = name;
    this.tag.style.setProperty(
      '--player-color',
      `#${color.toString(16).padStart(6, '0')}`,
    );
    this.bodyMaterial.color.setHex(color);
  }

  /** Remote avatars ease toward the latest server position. */
  setTarget(x: number, z: number, heading: number): void {
    this.target.set(x, 0, z);
    this.targetHeading = heading;
  }

  /** Places the avatar immediately (spawn, or the locally predicted player). */
  snapTo(x: number, z: number, heading: number): void {
    this.setTarget(x, z, heading);
    this.root.position.copy(this.target);
    this.root.rotation.y = heading;
  }

  update(dt: number): void {
    const before = this.root.position.clone();
    const t = 1 - Math.exp(-SMOOTHING * dt);
    this.root.position.lerp(this.target, t);
    this.root.rotation.y +=
      shortestAngle(this.root.rotation.y, this.targetHeading) * t;

    const speed = before.distanceTo(this.root.position) / Math.max(dt, 1e-4);
    const moving = speed > 0.3;
    this.walkTime = moving ? this.walkTime + dt : 0;
    this.body.position.y = moving
      ? Math.abs(Math.sin(this.walkTime * BOB_SPEED)) * 0.08
      : 0;
    this.body.rotation.z = moving
      ? Math.sin(this.walkTime * BOB_SPEED) * 0.06
      : 0;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.tag.remove();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
