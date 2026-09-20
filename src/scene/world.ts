import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GRID_SIZE, TILE_SIZE } from '../../spacetimedb/src/logic/grid';
import { IS_TOUCH } from '../input/touch';

export interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** Eases the camera toward following `target`, or the island overview when null. */
  follow(target: THREE.Vector3 | null, dt: number): void;
  start(onFrame: (dt: number) => void): void;
}

const OVERVIEW_POSITION = new THREE.Vector3(22, 26, 28);
const FOLLOW_OFFSET = new THREE.Vector3(0, 11, 11);
const CAMERA_SMOOTHING = 5;
/** Phones (or ?quality=low) render at a lower resolution with cheaper shadows. */
const LOW_POWER =
  IS_TOUCH || new URLSearchParams(location.search).get('quality') === 'low';

/** Island grass; loaded models' grass is tinted to match so tiles blend in. */
export const GRASS_COLOR = '#86c96b';
/** Half-width of the sandy beach around the grid; decorations live out here. */
export const BEACH_HALF = (GRID_SIZE * TILE_SIZE) / 2 + 3;

const COLORS = {
  skyTop: '#6fc3ef',
  horizon: '#dff3fb',
  grass: GRASS_COLOR,
  sand: '#f1d9a6',
  cliff: '#a9825a',
  water: '#4fc0dd',
  cloud: '#ffffff',
};

function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(COLORS.skyTop) },
      horizon: { value: new THREE.Color(COLORS.horizon) },
    },
    vertexShader: /* glsl */ `
      varying float vHeight;
      void main() {
        vHeight = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      varying float vHeight;
      void main() {
        gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.55, vHeight)), 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), material);
}

function createIsland(): THREE.Group {
  const island = new THREE.Group();
  const size = GRID_SIZE * TILE_SIZE;

  const grass = new THREE.Mesh(
    new THREE.BoxGeometry(size, 0.6, size),
    new THREE.MeshStandardMaterial({ color: COLORS.grass, flatShading: true }),
  );
  grass.position.y = -0.3;
  grass.receiveShadow = true;
  island.add(grass);

  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(BEACH_HALF * 2, 0.5, BEACH_HALF * 2),
    new THREE.MeshStandardMaterial({ color: COLORS.sand, flatShading: true }),
  );
  sand.position.y = -0.55;
  sand.receiveShadow = true;
  island.add(sand);

  const cliff = new THREE.Mesh(
    new THREE.CylinderGeometry(BEACH_HALF * 1.2, BEACH_HALF * 0.9, 3, 8),
    new THREE.MeshStandardMaterial({ color: COLORS.cliff, flatShading: true }),
  );
  cliff.position.y = -2.3;
  cliff.rotation.y = Math.PI / 8;
  island.add(cliff);

  const grid = new THREE.GridHelper(size, GRID_SIZE, '#ffffff', '#ffffff');
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.12;
  grid.position.y = 0.01;
  island.add(grid);

  return island;
}

/** A gently rolling sea: vertex heights are recomputed each frame from two waves. */
function createWater(): { mesh: THREE.Mesh; animate(time: number): void } {
  const geometry = new THREE.PlaneGeometry(160, 160, 48, 48);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: COLORS.water,
      transparent: true,
      opacity: 0.9,
      roughness: 0.3,
      flatShading: true,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.75;
  const position = geometry.attributes.position as THREE.BufferAttribute;
  return {
    mesh,
    animate(time) {
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        position.setZ(
          i,
          Math.sin(x * 0.18 + time * 0.9) * 0.12 +
            Math.cos(y * 0.23 + time * 0.7) * 0.1,
        );
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
    },
  };
}

/** A few puffy low-poly clouds drifting across the sky and wrapping around. */
function createClouds(): { group: THREE.Group; animate(dt: number): void } {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.cloud,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
  });
  const puff = new THREE.IcosahedronGeometry(1, 0);
  // High and far out, so they read as sky from the overview camera and never block the view.
  const layout: [number, number, number][] = [
    [-55, 34, -45],
    [-10, 38, -70],
    [40, 32, -50],
    [65, 36, -5],
    [-70, 33, 10],
    [20, 37, -85],
  ];
  for (const [x, y, z] of layout) {
    const cloud = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(puff, material);
      p.position.set(i * 2.8 - 4, Math.sin(i * 1.7) * 0.8, (i % 2) * 1.6);
      p.scale.setScalar(2.6 + ((i * 7) % 3) * 0.7);
      cloud.add(p);
    }
    cloud.position.set(x, y, z);
    group.add(cloud);
  }
  return {
    group,
    animate(dt) {
      for (const cloud of group.children) {
        cloud.position.x += dt * 0.6;
        if (cloud.position.x > 90) cloud.position.x = -90;
      }
    },
  };
}

function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight('#e6f6ff', '#5d7f4c', 1.3));

  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(14, 22, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(LOW_POWER ? 1024 : 2048);
  const extent = BEACH_HALF + 2;
  Object.assign(sun.shadow.camera, {
    left: -extent,
    right: extent,
    top: extent,
    bottom: -extent,
    near: 1,
    far: 70,
  });
  scene.add(sun);
}

export function createWorld(container: HTMLElement): World {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, LOW_POWER ? 1.5 : 2),
  );
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COLORS.horizon, 50, 140);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  camera.position.copy(OVERVIEW_POSITION);
  const lookAt = new THREE.Vector3();
  camera.lookAt(lookAt);

  // Name tags are HTML elements layered over the canvas.
  const labels = new CSS2DRenderer();
  labels.domElement.classList.add('labels');
  container.appendChild(labels.domElement);

  const water = createWater();
  const clouds = createClouds();
  const sky = createSky();
  scene.add(sky, createIsland(), water.mesh, clouds.group);
  addLights(scene);

  // On portrait screens the camera pulls back so the build area still fits across.
  let followOffset = FOLLOW_OFFSET.clone();
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    followOffset = FOLLOW_OFFSET.clone().multiplyScalar(
      camera.aspect < 1 ? Math.min(1.8, 1.15 / camera.aspect) : 1,
    );
  };
  window.addEventListener('resize', resize);
  resize();

  const desiredPosition = new THREE.Vector3();
  const desiredLookAt = new THREE.Vector3();
  const timer = new THREE.Timer();
  timer.connect(document); // ignores time spent in a hidden tab
  return {
    scene,
    camera,
    renderer,
    follow(target, dt) {
      if (target) {
        desiredLookAt.copy(target);
        desiredPosition.copy(target).add(followOffset);
      } else {
        desiredLookAt.set(0, 0, 0);
        desiredPosition.copy(OVERVIEW_POSITION);
      }
      const t = 1 - Math.exp(-CAMERA_SMOOTHING * dt);
      camera.position.lerp(desiredPosition, t);
      lookAt.lerp(desiredLookAt, t);
      camera.lookAt(lookAt);
    },
    start(onFrame) {
      renderer.setAnimationLoop((timestamp) => {
        timer.update(timestamp);
        const dt = Math.min(timer.getDelta(), 0.1);
        water.animate(timer.getElapsed());
        clouds.animate(dt);
        sky.position.copy(camera.position);
        onFrame(dt);
        renderer.render(scene, camera);
        labels.render(scene, camera);
      });
    },
  };
}
