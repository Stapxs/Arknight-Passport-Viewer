import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

// 初始化场景
const scene: THREE.Scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const modelsPrefix = '';
const texturesDir = 'napcat';

// 初始化相机
const camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 5, 20);

// 初始化渲染器
const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// 环境光与灯光
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xffffff, 1);
spotLight.position.set(5, 10, 5);
scene.add(spotLight);

// 创建 RGBE 加载器
const hdrLoader = new HDRLoader();

// 加载 HDR 文件
hdrLoader.load('/textures/puresky.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
});

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;

// 控制器
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // 增加阻尼感，手感更高级
controls.enablePan = true;     // 启用平移功能
controls.screenSpacePanning = true; // 平移时在屏幕空间而非世界空间
controls.panSpeed = 0.8;       // 平移速度

/**
 * 加载并反转颜色的纹理，用于背面贴图
 * @param path 纹理路径
 * @returns 反转颜色后的 THREE.Texture 对象
 */
function loadInvertedTexture(path: string): THREE.Texture {
    const texture = new THREE.Texture();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;

    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];     // R
            data[i + 1] = 255 - data[i + 1]; // G
            data[i + 2] = 255 - data[i + 2]; // B
            // data[i + 3] alpha 保持不变
        }
        ctx.putImageData(imageData, 0, 0);
        texture.image = canvas;
        texture.needsUpdate = true;
    };
    img.src = path;
    return texture;
}

/**
 * 为给定 Mesh 应用双面纹理，背面纹理可选择是否反转颜色
 * @param mesh 需要应用双面纹理的 THREE.Mesh 对象
 * @param frontPath 正面纹理路径
 * @param backPath 背面纹理路径
 * @param invertBack 是否反转背面纹理颜色，默认为 false
 * @returns 背面 Mesh 对象的引用，供后续动态排序使用
 */
function applyDoubleSidedTexture(
    mesh: THREE.Mesh,
    frontPath: string,
    backPath: string,
    invertBack = false,
): THREE.Mesh {
    const tl = new THREE.TextureLoader();

    const loadTex = (path: string) => {
        const tex = tl.load(path);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        return tex;
    };

    const matBase = {
        transparent: true,
        depthWrite: false,
        depthTest: true,
    };

    mesh.material = new THREE.MeshStandardMaterial({
        ...matBase,
        map: loadTex(frontPath),
        side: THREE.FrontSide,
    });

    const backMesh = new THREE.Mesh(
        mesh.geometry,
        new THREE.MeshStandardMaterial({
            ...matBase,
            map: invertBack ? loadInvertedTexture(backPath) : loadTex(backPath),
            side: THREE.BackSide,
        })
    );
    // 作为 mesh 的子节点而非兄弟节点，自动继承 mesh 的世界变换
    mesh.add(backMesh);
    return backMesh;
}

// Plane_2 / Plane_3 及其背面 Mesh 引用，供动态排序使用
let plane2Mesh: THREE.Mesh | null = null;
let plane2Back: THREE.Mesh | null = null;
let plane3Mesh: THREE.Mesh | null = null;
let plane3Back: THREE.Mesh | null = null;

// 加载模型
const loader = new GLTFLoader();
loader.load(`/models/${modelsPrefix}passport.glb`, (gltf: GLTF) => {
    gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            if (child.name === 'Plane_1') {
                const prevMaterial = child.material;
                child.material = new THREE.MeshPhysicalMaterial({
                    map: prevMaterial.map,
                    color: prevMaterial.color,
                    roughness: 0.1,
                    metalness: 0,
                    ior: 1.49,
                    thickness: 1.5,
                    transmission: 1,
                    depthWrite: false,
                    envMapIntensity: 1.5,
                    attenuationColor: new THREE.Color(0xeceff1),
                    attenuationDistance: 0.5,
                });
            } else {
                if (child.name === 'Plane_2') {
                    plane2Mesh = child;
                    plane2Back = applyDoubleSidedTexture(child, `textures/passport/${texturesDir}/11.png`, `textures/passport/${texturesDir}/12.png`, true);
                }
                if (child.name === 'Plane_3') {
                    plane3Mesh = child;
                    plane3Back = applyDoubleSidedTexture(child, `textures/passport/${texturesDir}/22.png`, `textures/passport/${texturesDir}/21.png`);
                }
            }
        }
    });
    scene.add(gltf.scene);
    console.log('模型加载成功！', gltf);
},
(xhr) => {
    console.log(`加载进度：${(xhr.loaded / xhr.total * 100).toFixed(2)}%`);
},
(error) => {
    console.error('模型加载出错：', error);
});

// 渲染循环
const _localCamPos = new THREE.Vector3();

const animate = (): void => {
    requestAnimationFrame(animate);
    controls.update();

    // 将相机世界坐标变换到 Plane_2 的本地坐标系
    // 局部 Z > 0 表示相机在 Plane_2 正面一侧，< 0 则在背面一侧
    if (plane2Mesh && plane2Back && plane3Mesh && plane3Back) {
        _localCamPos.copy(camera.position);
        plane2Mesh.worldToLocal(_localCamPos);
        const onFront = _localCamPos.y > 0;
        const p2o = onFront ? 2 : 1;
        const p3o = onFront ? 1 : 2;
        plane2Mesh.renderOrder = p2o;
        plane2Back.renderOrder = p2o;
        plane3Mesh.renderOrder = p3o;
        plane3Back.renderOrder = p3o;
    }

    renderer.render(scene, camera);
};

animate();

// 窗口自适应
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});