import * as THREE from 'three';
import type { PieceKind } from '../../spacetimedb/src/logic/pieces';

// Procedural low-poly models, one per piece kind, each fitting a 1×1 tile with its
// origin at the tile center on the ground. Materials are shared across instances.

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });

const M = {
  wall: mat('#f6e7c8'),
  roof: mat('#e4572e'),
  wood: mat('#a8744a'),
  door: mat('#6b4226'),
  leaf: mat('#62b858'),
  leafDark: mat('#3f9142'),
  pine: mat('#2f7d4f'),
  stone: mat('#a3a7ab'),
  stoneLight: mat('#c9c3b8'),
  path: mat('#dccba5'),
  water: mat('#4fc0dd'),
  towerRoof: mat('#4a6fa5'),
  dark: mat('#33363d'),
  glow: mat('#ffe28a', { emissive: '#ffcf4a', emissiveIntensity: 0.9 }),
  petals: ['#ff6b9d', '#ffd43b', '#b197fc', '#ff922b', '#ffffff'].map((c) =>
    mat(c),
  ),
};

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

const builders: Record<PieceKind, () => THREE.Object3D[]> = {
  house: () => {
    const roof = mesh(new THREE.ConeGeometry(0.6, 0.42, 4), M.roof, 0, 0.71);
    roof.rotation.y = Math.PI / 4;
    return [
      mesh(new THREE.BoxGeometry(0.72, 0.5, 0.62), M.wall, 0, 0.25),
      roof,
      mesh(new THREE.BoxGeometry(0.16, 0.26, 0.02), M.door, 0, 0.13, 0.32),
      mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), M.glow, 0.22, 0.3, 0.32),
    ];
  },
  tree: () => [
    mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.36, 5), M.wood, 0, 0.18),
    mesh(new THREE.IcosahedronGeometry(0.33, 0), M.leaf, 0, 0.58),
    mesh(new THREE.IcosahedronGeometry(0.2, 0), M.leafDark, 0.16, 0.78, 0.06),
  ],
  pine: () => [
    mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.24, 5), M.wood, 0, 0.12),
    mesh(new THREE.ConeGeometry(0.34, 0.42, 6), M.pine, 0, 0.42),
    mesh(new THREE.ConeGeometry(0.26, 0.36, 6), M.pine, 0, 0.66),
    mesh(new THREE.ConeGeometry(0.17, 0.3, 6), M.pine, 0, 0.88),
  ],
  rock: () => {
    const big = mesh(
      new THREE.DodecahedronGeometry(0.3, 0),
      M.stone,
      -0.05,
      0.16,
      0,
    );
    big.scale.set(1, 0.7, 0.9);
    const small = mesh(
      new THREE.DodecahedronGeometry(0.15, 0),
      M.stoneLight,
      0.24,
      0.09,
      0.15,
    );
    return [big, small];
  },
  path: () => [
    mesh(new THREE.BoxGeometry(0.94, 0.04, 0.94), M.path, 0, 0.02),
    mesh(
      new THREE.BoxGeometry(0.22, 0.03, 0.18),
      M.stoneLight,
      -0.22,
      0.05,
      -0.2,
    ),
    mesh(new THREE.BoxGeometry(0.2, 0.03, 0.22), M.stoneLight, 0.2, 0.05, 0.18),
  ],
  flowers: () => {
    const spots: [number, number][] = [
      [-0.25, -0.2],
      [0.2, -0.25],
      [0, 0.05],
      [-0.2, 0.25],
      [0.25, 0.2],
    ];
    return spots.flatMap(([x, z], i) => [
      mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4),
        M.leafDark,
        x,
        0.1,
        z,
      ),
      mesh(
        new THREE.IcosahedronGeometry(0.07, 0),
        M.petals[i % M.petals.length],
        x,
        0.22,
        z,
      ),
    ]);
  },
  fence: () => [
    mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), M.wood, -0.4, 0.2),
    mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), M.wood, 0, 0.2),
    mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), M.wood, 0.4, 0.2),
    mesh(new THREE.BoxGeometry(0.96, 0.06, 0.04), M.wood, 0, 0.3),
    mesh(new THREE.BoxGeometry(0.96, 0.06, 0.04), M.wood, 0, 0.15),
  ],
  well: () => {
    const roof = mesh(new THREE.ConeGeometry(0.42, 0.24, 4), M.roof, 0, 0.82);
    roof.rotation.y = Math.PI / 4;
    return [
      mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.28, 8), M.stone, 0, 0.14),
      mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 8), M.water, 0, 0.27),
      mesh(new THREE.BoxGeometry(0.05, 0.55, 0.05), M.wood, -0.28, 0.5),
      mesh(new THREE.BoxGeometry(0.05, 0.55, 0.05), M.wood, 0.28, 0.5),
      roof,
    ];
  },
  lamp: () => [
    mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.08, 6), M.dark, 0, 0.04),
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5), M.dark, 0, 0.44),
    mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), M.glow, 0, 0.92),
    mesh(new THREE.ConeGeometry(0.14, 0.1, 4), M.dark, 0, 1.06),
  ],
  tower: () => [
    mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8), M.stoneLight, 0, 0.6),
    mesh(new THREE.ConeGeometry(0.4, 0.5, 8), M.towerRoof, 0, 1.45),
    mesh(new THREE.BoxGeometry(0.1, 0.16, 0.02), M.glow, 0, 0.85, 0.31),
    mesh(new THREE.BoxGeometry(0.14, 0.24, 0.02), M.door, 0, 0.12, 0.33),
  ],
};

/** Shared geometry per kind: built once, cloned (sharing buffers) per placed piece. */
const prototypes = new Map<PieceKind, THREE.Group>();

/**
 * Replaces the procedural fallbacks with loaded models (see modelLibrary.ts). Call
 * before any piece is created so every client renders the same models.
 */
export function installModelLibrary(
  library: Map<PieceKind, THREE.Group>,
): void {
  for (const [kind, model] of library) prototypes.set(kind, model);
}

export function createPieceModel(kind: PieceKind): THREE.Group {
  let proto = prototypes.get(kind);
  if (!proto) {
    proto = new THREE.Group();
    proto.add(...builders[kind]());
    proto.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    prototypes.set(kind, proto);
  }
  return proto.clone();
}

/** A translucent copy of a model for the placement preview. */
export function createGhostModel(
  kind: PieceKind,
  material: THREE.Material,
): THREE.Group {
  const ghost = createPieceModel(kind);
  ghost.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = material;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return ghost;
}
