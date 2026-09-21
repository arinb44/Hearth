import * as THREE from 'three';

// Pieces that link up with their neighbours: each tile looks at the four tiles
// around it and draws toward the ones it connects to, so fences join at corners and
// crossings, paths and water form continuous roads and ponds, and bridges line up.

export type ConnectiveKind = 'fence' | 'path' | 'water' | 'tile' | 'bridge';

/** The kind on the tile at an offset from this one, if any. */
export type NeighbourLookup = (dx: number, dz: number) => string | undefined;

/** Neighbour directions on the tile grid, as bits of a connection mask. */
export const NEIGHBOURS = [
  { bit: 1, dx: 1, dz: 0 },
  { bit: 2, dx: -1, dz: 0 },
  { bit: 4, dx: 0, dz: 1 },
  { bit: 8, dx: 0, dz: -1 },
] as const;

const CONNECTIVE = new Set<string>([
  'fence',
  'path',
  'water',
  'tile',
  'bridge',
]);
const WALKABLE = ['path', 'bridge', 'tile'];
const WET = ['water', 'bridge'];

export function isConnective(kind: string): kind is ConnectiveKind {
  return CONNECTIVE.has(kind);
}

function maskOf(at: NeighbourLookup, kinds: readonly string[]): number {
  let mask = 0;
  for (const n of NEIGHBOURS) {
    const kind = at(n.dx, n.dz);
    if (kind && kinds.includes(kind)) mask |= n.bit;
  }
  return mask;
}

const flat = (
  color: string,
  extra: THREE.MeshStandardMaterialParameters = {},
) => new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });

// Kit materials and parts once loaded (see modelLibrary.ts); flat fallbacks until then.
const materials = {
  wood: flat('#c98a5e'),
  woodDark: flat('#a36a48'),
  dirt: flat('#d79a6e'),
  dirtDark: flat('#b07a55'),
  water: flat('#49b6e0', { roughness: 0.15, transparent: true, opacity: 0.92 }),
  bank: flat('#e8d2a0'),
  stone: flat('#cfc8bc'),
  stoneDark: flat('#bab3a6'),
  lily: flat('#5aa858'),
};
const parts: { lily?: THREE.Object3D } = {};

export function installConnectorKit(
  kit: Map<string, THREE.Material>,
  kitParts: { lily: THREE.Object3D },
): void {
  for (const name of ['wood', 'woodDark', 'dirt', 'dirtDark'] as const) {
    const material = kit.get(name);
    if (material instanceof THREE.MeshStandardMaterial)
      materials[name] = material;
  }
  parts.lily = kitParts.lily;
}

const RAIL = { length: 0.5, height: 0.05, depth: 0.045 };
const geometry = {
  post: new THREE.BoxGeometry(0.09, 0.4, 0.09),
  railX: new THREE.BoxGeometry(RAIL.length, RAIL.height, RAIL.depth),
  railZ: new THREE.BoxGeometry(RAIL.depth, RAIL.height, RAIL.length),
  stone: new THREE.BoxGeometry(0.12, 0.035, 0.1),
  slab: new THREE.BoxGeometry(0.45, 0.04, 0.45),
  lily: new THREE.CylinderGeometry(0.09, 0.09, 0.01, 7),
  deckX: new THREE.BoxGeometry(1, 0.06, 0.62),
  deckZ: new THREE.BoxGeometry(0.62, 0.06, 1),
  seamX: new THREE.BoxGeometry(0.02, 0.062, 0.62),
  seamZ: new THREE.BoxGeometry(0.62, 0.062, 0.02),
  bridgeRailX: new THREE.BoxGeometry(1, 0.05, 0.05),
  bridgeRailZ: new THREE.BoxGeometry(0.05, 0.05, 1),
  bridgePost: new THREE.BoxGeometry(0.07, 0.3, 0.07),
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

const DIAGONALS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Corners to fill: both side neighbours and the diagonal one connect, as in a 2×2 block. */
function filledCorners(at: NeighbourLookup, kinds: readonly string[]) {
  const links = (dx: number, dz: number) => {
    const kind = at(dx, dz);
    return kind !== undefined && kinds.includes(kind);
  };
  return DIAGONALS.filter(
    ([dx, dz]) => links(dx, 0) && links(0, dz) && links(dx, dz),
  );
}

/**
 * A flat shape covering the tile center plus an arm toward each connected side, and
 * the corner between two arms wherever the diagonal tile connects too, so solid
 * blocks of water or path have no notches where four tiles meet.
 */
function patch(
  at: NeighbourLookup,
  kinds: readonly string[],
  width: number,
  height: number,
  y: number,
  material: THREE.Material,
): THREE.Object3D[] {
  const mask = maskOf(at, kinds);
  if (mask === 0) {
    const round = new THREE.CylinderGeometry(
      width * 0.58,
      width * 0.58,
      height,
      8,
    );
    return [mesh(round, material, 0, y, 0)];
  }
  const shapes = [
    mesh(new THREE.BoxGeometry(width, height, width), material, 0, y, 0),
  ];
  for (const n of NEIGHBOURS) {
    if (!(mask & n.bit)) continue;
    const arm =
      n.dx !== 0
        ? new THREE.BoxGeometry(0.5, height, width)
        : new THREE.BoxGeometry(width, height, 0.5);
    shapes.push(mesh(arm, material, n.dx * 0.25, y, n.dz * 0.25));
  }
  const corner = 0.5 - width / 2;
  const offset = width / 2 + corner / 2;
  for (const [dx, dz] of filledCorners(at, kinds)) {
    const fill = new THREE.BoxGeometry(corner, height, corner);
    shapes.push(mesh(fill, material, dx * offset, y, dz * offset));
  }
  return shapes;
}

/** Arms for a fence: toward each neighbour, or straight through for 0–1 neighbours. */
function fenceArms(mask: number, rotation: number) {
  const connected = NEIGHBOURS.filter((n) => mask & n.bit);
  if (connected.length >= 2) return connected;
  const alongX =
    connected.length === 1 ? connected[0].dx !== 0 : rotation % 2 === 0;
  return NEIGHBOURS.filter((n) => (alongX ? n.dx !== 0 : n.dz !== 0));
}

function fence(at: NeighbourLookup, rotation: number): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(geometry.post, materials.woodDark, 0, 0.2, 0));
  for (const n of fenceArms(maskOf(at, ['fence']), rotation)) {
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

function path(at: NeighbourLookup): THREE.Group {
  const group = new THREE.Group();
  group.add(...patch(at, WALKABLE, 0.62, 0.03, 0.015, materials.dirt));
  group.add(
    mesh(geometry.stone, materials.dirtDark, -0.12, 0.03, 0.08),
    mesh(geometry.stone, materials.dirtDark, 0.1, 0.03, -0.1),
  );
  return group;
}

/** Water with a sandy bank; joins neighbouring water and bridges into ponds and rivers. */
function waterBase(at: NeighbourLookup): THREE.Object3D[] {
  return [
    ...patch(at, WET, 0.86, 0.02, 0.01, materials.bank),
    ...patch(at, WET, 0.72, 0.012, 0.024, materials.water),
  ];
}

function water(at: NeighbourLookup): THREE.Group {
  const group = new THREE.Group();
  group.add(...waterBase(at));
  const lily =
    parts.lily?.clone() ?? mesh(geometry.lily, materials.lily, 0, 0, 0);
  lily.position.set(0.13, 0.03, -0.1);
  group.add(lily);
  return group;
}

/** Paving: four stone slabs that butt up against neighbouring tiles into a plaza. */
function tile(): THREE.Group {
  const group = new THREE.Group();
  const slabs = [
    [-0.24, -0.24],
    [0.24, -0.24],
    [-0.24, 0.24],
    [0.24, 0.24],
  ];
  slabs.forEach(([x, z], i) => {
    const material = i % 3 === 0 ? materials.stoneDark : materials.stone;
    group.add(mesh(geometry.slab, material, x, 0.02, z));
  });
  return group;
}

/** A deck over water, turned to line up with neighbouring paths, bridges, or tiles. */
function bridge(at: NeighbourLookup, rotation: number): THREE.Group {
  const group = new THREE.Group();
  group.add(...waterBase(at));
  const walk = maskOf(at, WALKABLE);
  const alongX = walk & 3 ? true : walk & 12 ? false : rotation % 2 === 0;
  // The deck spans the whole tile along its direction, so a row of bridge tiles
  // reads as one continuous bridge: planks, seams, and a rail on each side.
  const across = (offset: number): [number, number] =>
    alongX ? [0, offset] : [offset, 0];
  const along = (offset: number): [number, number] =>
    alongX ? [offset, 0] : [0, offset];
  group.add(
    mesh(alongX ? geometry.deckX : geometry.deckZ, materials.wood, 0, 0.08, 0),
  );
  for (const t of [-0.375, -0.125, 0.125, 0.375]) {
    const [x, z] = along(t);
    group.add(
      mesh(
        alongX ? geometry.seamX : geometry.seamZ,
        materials.woodDark,
        x,
        0.08,
        z,
      ),
    );
  }
  for (const side of [-0.29, 0.29]) {
    const [x, z] = across(side);
    group.add(
      mesh(
        alongX ? geometry.bridgeRailX : geometry.bridgeRailZ,
        materials.wood,
        x,
        0.3,
        z,
      ),
      mesh(geometry.bridgePost, materials.woodDark, x, 0.22, z),
    );
  }
  return group;
}

/**
 * A connective piece drawn for its neighbourhood. Models are built in world
 * directions (never rotated); `rotation` only orients a fence or bridge that has
 * nothing to line up with.
 */
export function createConnectedModel(
  kind: ConnectiveKind,
  at: NeighbourLookup,
  rotation: number,
): THREE.Group {
  switch (kind) {
    case 'fence':
      return fence(at, rotation);
    case 'path':
      return path(at);
    case 'water':
      return water(at);
    case 'tile':
      return tile();
    case 'bridge':
      return bridge(at, rotation);
  }
}
