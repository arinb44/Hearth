import * as THREE from 'three';

// Things that light up after dark. The environment sets one shared night level, so
// every lamp, firefly, and campfire on the island brightens together.

function radialTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const halo = radialTexture();

const lampHalo = new THREE.SpriteMaterial({
  map: halo,
  color: '#ffd76a',
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const fireflyHalo = new THREE.SpriteMaterial({
  map: halo,
  color: '#d8ff6a',
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const fireflyBody = new THREE.MeshBasicMaterial({
  color: '#efff9a',
  transparent: true,
  opacity: 0.5,
});
const fireflyGeometry = new THREE.SphereGeometry(0.03, 6, 4);
const fireHalo = new THREE.SpriteMaterial({
  map: halo,
  color: '#ff9d3c',
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const flameOuter = new THREE.MeshBasicMaterial({ color: '#ff7a1a' });
const flameInner = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
const flameGeometry = new THREE.ConeGeometry(0.07, 0.26, 5);

/** 0 = full day, 1 = night. */
export function setNightLevel(level: number): void {
  lampHalo.opacity = 0.95 * level;
  fireflyHalo.opacity = 0.2 + 0.75 * level;
  fireflyBody.opacity = 0.5 + 0.5 * level;
  fireHalo.opacity = 0.3 + 0.65 * level;
}

/** A soft glow for a lamp's light, invisible by day. */
export function createLampGlow(height: number): THREE.Sprite {
  const sprite = new THREE.Sprite(lampHalo);
  sprite.position.y = height;
  sprite.scale.setScalar(1.1);
  return sprite;
}

/**
 * Low-poly flames that flicker over a campfire's logs, with a warm glow that grows
 * after dark. Built fresh per piece (not cloned): `userData.animate` is a function.
 */
export function createCampfireFlame(height: number): THREE.Group {
  const group = new THREE.Group();
  group.position.y = height;
  const tongues = [
    { x: 0, z: 0, size: 1.2, material: flameOuter },
    { x: 0.06, z: 0.04, size: 0.8, material: flameOuter },
    { x: -0.05, z: 0.05, size: 0.75, material: flameOuter },
    { x: 0.01, z: -0.06, size: 0.7, material: flameOuter },
    { x: 0, z: 0.01, size: 0.65, material: flameInner },
  ].map((t, i) => {
    const flame = new THREE.Mesh(flameGeometry, t.material);
    flame.position.set(t.x, 0, t.z);
    group.add(flame);
    return { flame, size: t.size, phase: i * 1.3 };
  });
  const glow = new THREE.Sprite(fireHalo);
  glow.position.y = 0.12;
  group.add(glow);
  group.userData.animate = (time: number) => {
    for (const t of tongues) {
      const flicker =
        1 +
        0.18 * Math.sin(time * 9 + t.phase) * Math.sin(time * 5.3 + t.phase);
      t.flame.scale.set(t.size, t.size * flicker, t.size);
      t.flame.position.y = (0.13 * t.size * flicker) / 1.2;
    }
    glow.scale.setScalar(0.9 + 0.08 * Math.sin(time * 7));
  };
  group.userData.animate(0);
  return group;
}

/**
 * A small swarm that drifts around its tile. Built fresh per piece (not cloned),
 * because `userData.animate` is a function and clones drop functions.
 */
export function createFireflies(): THREE.Group {
  const group = new THREE.Group();
  const flies = Array.from({ length: 7 }, (_, i) => {
    const fly = new THREE.Group();
    const glow = new THREE.Sprite(fireflyHalo);
    glow.scale.setScalar(0.3);
    fly.add(new THREE.Mesh(fireflyGeometry, fireflyBody), glow);
    group.add(fly);
    return {
      fly,
      phase: i * 1.7,
      radius: 0.15 + (i % 3) * 0.1,
      height: 0.35 + (i % 4) * 0.15,
    };
  });
  group.userData.animate = (time: number) => {
    for (const f of flies) {
      const t = time * 0.8 + f.phase;
      f.fly.position.set(
        Math.cos(t) * f.radius + Math.sin(t * 1.9) * 0.06,
        f.height + Math.sin(t * 2.3) * 0.08,
        Math.sin(t * 1.3) * f.radius,
      );
    }
  };
  group.userData.animate(0);
  return group;
}
