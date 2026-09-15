import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GRID_SIZE, TILE_SIZE } from '../../spacetimedb/src/logic/grid';

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

const COLORS = {
  sky: '#bfe6f5',
  grass: '#86c96b',
  sand: '#f1d9a6',
  cliff: '#a9825a',
  water: '#4fc0dd',
};

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
    new THREE.BoxGeometry(size + 2, 0.5, size + 2),
    new THREE.MeshStandardMaterial({ color: COLORS.sand, flatShading: true }),
  );
  sand.position.y = -0.55;
  sand.receiveShadow = true;
  island.add(sand);

  const cliff = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.62, size * 0.5, 3, 7),
    new THREE.MeshStandardMaterial({ color: COLORS.cliff, flatShading: true }),
  );
  cliff.position.y = -2.3;
  island.add(cliff);

  const grid = new THREE.GridHelper(size, GRID_SIZE, '#ffffff', '#ffffff');
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.12;
  grid.position.y = 0.01;
  island.add(grid);

  return island;
}

function createWater(): THREE.Mesh {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({
      color: COLORS.water,
      transparent: true,
      opacity: 0.92,
      roughness: 0.35,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.7;
  return water;
}

function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight('#e6f6ff', '#5d7f4c', 1.3));

  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(14, 22, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = GRID_SIZE * 0.75;
  Object.assign(sun.shadow.camera, {
    left: -extent,
    right: extent,
    top: extent,
    bottom: -extent,
    near: 1,
    far: 60,
  });
  scene.add(sun);
}

export function createWorld(container: HTMLElement): World {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 45, 120);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.copy(OVERVIEW_POSITION);
  const lookAt = new THREE.Vector3();
  camera.lookAt(lookAt);

  // Name tags are HTML elements layered over the canvas.
  const labels = new CSS2DRenderer();
  labels.domElement.classList.add('labels');
  container.appendChild(labels.domElement);

  scene.add(createIsland(), createWater());
  addLights(scene);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const desiredPosition = new THREE.Vector3();
  const desiredLookAt = new THREE.Vector3();
  const clock = new THREE.Clock();
  return {
    scene,
    camera,
    renderer,
    follow(target, dt) {
      if (target) {
        desiredLookAt.copy(target);
        desiredPosition.copy(target).add(FOLLOW_OFFSET);
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
      renderer.setAnimationLoop(() => {
        onFrame(Math.min(clock.getDelta(), 0.1));
        renderer.render(scene, camera);
        labels.render(scene, camera);
      });
    },
  };
}
