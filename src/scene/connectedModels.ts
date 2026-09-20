import * as THREE from 'three';

// Fences and paths link up with same-kind neighbours: each tile draws an arm toward
// every neighbour, so runs, corners, T-junctions and crossings all join cleanly.

export type ConnectiveKind = 'fence' | 'path';

/** Neighbour directions on the tile grid, as bits of a connection mask. */
export const NEIGHBOURS = [
  { bit: 1, dx: 1, dz: 0 },
  { bit: 2, dx: -1, dz: 0 },
  { bit: 4, dx: 0, dz: 1 },
  { bit: 8, dx: 0, dz: -1 },
] as const;

export function isConnective(kind: string): kind is ConnectiveKind {
  return kind === 'fence' || kind === 'path';
}

// Kit materials once loaded (see modelLibrary.ts); flat colors until then.
const materials = {
  wood: new THREE.MeshStandardMaterial({ color: '#c98a5e', flatShading: true }),
  woodDark: new THREE.MeshStandardMaterial({
    color: '#a36a48',
    flatShading: true,
  }),
  dirt: new THREE.MeshStandardMaterial({ color: '#d79a6e', flatShading: true }),
  dirtDark: new THREE.MeshStandardMaterial({
    color: '#b07a55',
    flatShading: true,
  }),
};

export function installConnectorMaterials(
  kit: Map<string, THREE.Material>,
): void {
  for (const name of Object.keys(materials) as (keyof typeof materials)[]) {
    const material = kit.get(name);
    if (material instanceof THREE.MeshStandardMaterial)
      materials[name] = material;
  }
}

const RAIL = { length: 0.5, height: 0.05, depth: 0.045 };
const geometry = {
  post: new THREE.BoxGeometry(0.09, 0.4, 0.09),
  railX: new THREE.BoxGeometry(RAIL.length, RAIL.height, RAIL.depth),
  railZ: new THREE.BoxGeometry(RAIL.depth, RAIL.height, RAIL.length),
  pathCenter: new THREE.BoxGeometry(0.62, 0.03, 0.62),
  pathArmX: new THREE.BoxGeometry(0.5, 0.03, 0.62),
  pathArmZ: new THREE.BoxGeometry(0.62, 0.03, 0.5),
  pathRound: new THREE.CylinderGeometry(0.36, 0.36, 0.03, 8),
  stone: new THREE.BoxGeometry(0.12, 0.035, 0.1),
};

function mesh(
  g: THREE.BufferGeometry,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
) {
  const m3 = new THREE.Mesh(g, m);
  m3.position.set(x, y, z);
  m3.castShadow = true;
  m3.receiveShadow = true;
  return m3;
}

/** The directions to draw arms toward; a lone or dead-end piece runs straight through. */
function arms(mask: number, rotation: number): (typeof NEIGHBOURS)[number][] {
  const connected = NEIGHBOURS.filter((n) => mask & n.bit);
  if (connected.length >= 2) return connected;
  const alongX =
    connected.length === 1 ? connected[0].dx !== 0 : rotation % 2 === 0;
  return NEIGHBOURS.filter((n) => (alongX ? n.dx !== 0 : n.dz !== 0));
}

function fence(mask: number, rotation: number): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(geometry.post, materials.woodDark, 0, 0.2, 0));
  for (const n of arms(mask, rotation)) {
    const rail = n.dx !== 0 ? geometry.railX : geometry.railZ;
    const x = n.dx * RAIL.length * 0.5;
    const z = n.dz * RAIL.length * 0.5;
    group.add(
      mesh(rail, materials.wood, x, 0.13, z),
      mesh(rail, materials.wood, x, 0.28, z),
    );
  }
  return group;
}

function path(mask: number): THREE.Group {
  const group = new THREE.Group();
  if (mask === 0) {
    group.add(mesh(geometry.pathRound, materials.dirt, 0, 0.015, 0));
  } else {
    group.add(mesh(geometry.pathCenter, materials.dirt, 0, 0.015, 0));
    for (const n of NEIGHBOURS) {
      if (!(mask & n.bit)) continue;
      const arm = n.dx !== 0 ? geometry.pathArmX : geometry.pathArmZ;
      group.add(mesh(arm, materials.dirt, n.dx * 0.25, 0.015, n.dz * 0.25));
    }
  }
  group.add(
    mesh(geometry.stone, materials.dirtDark, -0.12, 0.03, 0.08),
    mesh(geometry.stone, materials.dirtDark, 0.1, 0.03, -0.1),
  );
  return group;
}

/**
 * A fence or path drawn for its neighbourhood. `mask` holds the NEIGHBOURS bits of
 * same-kind neighbours (world directions, so the model is never rotated); `rotation`
 * only orients a fence that has no neighbours.
 */
export function createConnectedModel(
  kind: ConnectiveKind,
  mask: number,
  rotation: number,
): THREE.Group {
  return kind === 'fence' ? fence(mask, rotation) : path(mask);
}
