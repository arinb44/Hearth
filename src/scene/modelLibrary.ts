import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PieceKind } from '../../spacetimedb/src/logic/pieces';
import { GRASS_COLOR } from './world';

// Kenney CC0 models (Nature Kit 2.1, Fantasy Town Kit 2.0), see public/assets/models.
const BASE = `${import.meta.env.BASE_URL}assets/models/`;
const FILES = {
  tree: 'nature/tree_default.glb',
  pine: 'nature/tree_pineDefaultA.glb',
  rock: 'nature/rock_largeA.glb',
  stone: 'nature/stone_largeB.glb',
  path: 'nature/ground_pathTile.glb',
  flowerRed: 'nature/flower_redA.glb',
  flowerYellow: 'nature/flower_yellowB.glb',
  flowerPurple: 'nature/flower_purpleC.glb',
  fence: 'nature/fence_simple.glb',
  lantern: 'town/lantern.glb',
  fountain: 'town/fountain-round-detail.glb',
  woodDoor: 'town/wall-wood-door.glb',
  woodWindow: 'town/wall-wood-window-shutters.glb',
  stoneWall: 'town/wall.glb',
  stoneWindow: 'town/wall-window-stone.glb',
  roof: 'town/roof-point.glb',
  roofHigh: 'town/roof-high-point.glb',
} as const;

type Parts = Record<keyof typeof FILES, THREE.Object3D>;

/** Scales a model to fit `footprint` × `footprint` (and `maxHeight`), centered on the tile, base at y = 0. */
function fit(
  object: THREE.Object3D,
  footprint: number,
  maxHeight = Infinity,
): THREE.Group {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.min(
    footprint / Math.max(size.x, size.z),
    maxHeight / size.y,
  );
  object.scale.multiplyScalar(scale);
  box.setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;
  const holder = new THREE.Group();
  holder.add(object);
  return holder;
}

/**
 * A ring of wall panels around a 1×1 cell. Each panel sits on the cell's +X edge, so
 * rotating copies by 90° closes the box; the last panel faces +Z (the camera).
 */
function walls(panels: THREE.Object3D[], y: number): THREE.Group {
  const ring = new THREE.Group();
  const turns = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  panels.forEach((panel, i) => {
    const copy = panel.clone();
    copy.rotation.y = turns[i];
    copy.position.y = y;
    ring.add(copy);
  });
  return ring;
}

function stack(...objects: THREE.Object3D[]): THREE.Group {
  const group = new THREE.Group();
  group.add(...objects);
  return group;
}

const ASSEMBLE: Record<PieceKind, (p: Parts) => THREE.Group> = {
  house: (p) => {
    const roof = p.roof.clone();
    roof.position.y = 1;
    return fit(
      stack(
        walls([p.woodWindow, p.woodWindow, p.woodWindow, p.woodDoor], 0),
        roof,
      ),
      0.9,
    );
  },
  tower: (p) => {
    const roof = p.roofHigh.clone();
    roof.position.y = 2;
    return fit(
      stack(
        walls([p.stoneWall, p.stoneWall, p.stoneWall, p.stoneWindow], 0),
        walls([p.stoneWindow, p.stoneWindow, p.stoneWindow, p.stoneWindow], 1),
        roof,
      ),
      0.8,
    );
  },
  tree: (p) => fit(p.tree.clone(), 0.85, 1.5),
  pine: (p) => fit(p.pine.clone(), 0.8, 1.6),
  rock: (p) => {
    const small = fit(p.stone.clone(), 0.38);
    small.position.set(0.24, 0, 0.22);
    return fit(stack(fit(p.rock.clone(), 0.75), small), 0.85);
  },
  path: (p) => fit(p.path.clone(), 1),
  flowers: (p) => {
    const kinds = [p.flowerRed, p.flowerYellow, p.flowerPurple];
    const spots: [number, number][] = [
      [-0.25, -0.2],
      [0.2, -0.25],
      [0, 0.05],
      [-0.2, 0.25],
      [0.25, 0.2],
    ];
    const bed = new THREE.Group();
    spots.forEach(([x, z], i) => {
      const flower = fit(kinds[i % kinds.length].clone(), 0.28, 0.42);
      flower.position.set(x, 0, z);
      bed.add(flower);
    });
    return bed;
  },
  fence: (p) => fit(p.fence.clone(), 1),
  well: (p) => fit(p.fountain.clone(), 0.9),
  lamp: (p) => fit(p.lantern.clone(), 0.9, 1.2),
};

/** Loads and assembles one prototype per piece kind. Rejects if any file fails. */
export async function loadPieceModels(): Promise<Map<PieceKind, THREE.Group>> {
  const loader = new GLTFLoader();
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, file]) => {
      const gltf = await loader.loadAsync(BASE + file);
      return [key, gltf.scene] as const;
    }),
  );
  const parts = Object.fromEntries(entries) as unknown as Parts;
  // The Nature Kit's teal grass would clash with the island, so match it.
  const grass = new THREE.MeshStandardMaterial({
    color: GRASS_COLOR,
    flatShading: true,
  });
  for (const part of Object.values(parts)) {
    part.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        !Array.isArray(o.material) &&
        o.material.name === 'grass'
      ) {
        o.material = grass;
      }
    });
  }
  const library = new Map<PieceKind, THREE.Group>();
  for (const [kind, assemble] of Object.entries(ASSEMBLE) as [
    PieceKind,
    (p: Parts) => THREE.Group,
  ][]) {
    const model = assemble(parts);
    model.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    library.set(kind, model);
  }
  return library;
}
