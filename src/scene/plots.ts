import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { TILE_SIZE } from '../../spacetimedb/src/logic/grid';
import { PLOT_SIZE, plotCenter } from '../../spacetimedb/src/logic/plots';
import type { Plot } from '../module_bindings/types';
import { playerCss } from '../ui/colors';

const SIDE = PLOT_SIZE * TILE_SIZE;

/** Battle plots: a tint in each builder's color plus a floating name label. */
export class PlotLayer {
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(SIDE - 0.12, SIDE - 0.12);

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  render(plots: Plot[] | null, myHex: string): void {
    this.clear();
    if (!plots) return;
    for (const p of plots) {
      const mine = p.builder.toHexString() === myHex;
      const center = plotCenter(p.plotIndex);
      const tint = new THREE.Mesh(
        this.geometry,
        new THREE.MeshBasicMaterial({
          color: playerCss(p.colorIndex),
          transparent: true,
          opacity: mine ? 0.28 : 0.14,
          depthWrite: false,
        }),
      );
      tint.rotation.x = -Math.PI / 2;
      tint.position.set(center.x, 0.015, center.z);
      this.group.add(tint);

      const tag = document.createElement('div');
      tag.className = mine ? 'plot-label plot-label-mine' : 'plot-label';
      tag.style.setProperty('--player-color', playerCss(p.colorIndex));
      tag.textContent = mine ? `${p.builderName} (you)` : p.builderName;
      const label = new CSS2DObject(tag);
      label.position.set(center.x, 0.1, center.z - SIDE / 2 + 0.6);
      this.group.add(label);
    }
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      if (child instanceof THREE.Mesh)
        (child.material as THREE.Material).dispose();
      if (child instanceof CSS2DObject) child.element.remove();
      child.removeFromParent();
    }
  }
}
