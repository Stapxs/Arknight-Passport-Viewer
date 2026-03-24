import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { PassportModel } from './functions/PassportModel.js';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { PassportAccessModel } from './functions/passportAccessModel.js';

const useWebGL = true;
const isMobile = /Mobi|Android/i.test(navigator.userAgent);

// 初始化场景
const scene: THREE.Scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);

const modelsPrefix = '';
const texturesDir = 'napcat';
const accType = 'silver';

// 初始化相机
const camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 5, 20);

// 初始化渲染器
const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({
     antialias: false,
     precision: 'medium',
    });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// 初始化 GPU Path Tracer
const pathTracer = new WebGLPathTracer(renderer);
pathTracer.dynamicLowRes = true;                    // 启用动态低分辨率渲染
pathTracer.multipleImportanceSampling = true;       // 多重采样
if(isMobile) {
    pathTracer.bounces = 3;                         // 反弹次数
    pathTracer.transmissiveBounces = 10;            // 投射反弹次数
    pathTracer.tiles.set(13, 13);                   // 切片数量
    pathTracer.lowResScale = 0.1;                   // 低分辨率缩放因子
    pathTracer.renderScale = 0.5;                   // 最终渲染缩放因子
} else {
    pathTracer.bounces = 5;                        // 反弹次数
    pathTracer.transmissiveBounces = 30;            // 投射反弹次数
    pathTracer.tiles.set(3, 3);                     // 切片数量
    pathTracer.lowResScale = 0.3;                   // 低分辨率缩放因子
    pathTracer.renderScale = 1.0;                   // 最终渲染缩放因子
}

// 环境光与灯光
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xffffff, 1);
spotLight.position.set(5, 10, 5);
scene.add(spotLight);

// // 创建 HDR 加载器
// const hdrLoader = new HDRLoader();

// // 加载 HDR 文件
// hdrLoader.load('/textures/puresky.hdr', (texture) => {
//     texture.mapping = THREE.EquirectangularReflectionMapping;
//     scene.background = texture;
//     scene.environment = texture;
//     renderer.toneMapping = THREE.ACESFilmicToneMapping;
//     renderer.toneMappingExposure = 1.0;
// });

// 创建 EXR 加载器
const exrLoader = new EXRLoader();

// 加载 EXR 文件
exrLoader.load('/textures/top_area_light_2.exr', (texture) => {
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

// 判断 Passport 关键贴图是否全部就绪，避免 path tracer 在贴图未加载时缓存错误材质
const getMeshMap = (mesh: THREE.Mesh | null): THREE.Texture | null => {
    if (!mesh || Array.isArray(mesh.material)) return null;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    return mat.map ?? null;
};

const isTextureReady = (tex: THREE.Texture | null): boolean => {
    const img = tex?.image as (HTMLImageElement | HTMLCanvasElement | undefined);
    if (!img) return false;
    if (img instanceof HTMLImageElement) return img.complete && img.naturalWidth > 0;
    return (img as HTMLCanvasElement).width > 0 && (img as HTMLCanvasElement).height > 0;
};

const arePassportTexturesReady = (): boolean => {
    return (
        isTextureReady(getMeshMap(passport.plane2Mesh)) &&
        isTextureReady(getMeshMap(passport.plane2Back)) &&
        isTextureReady(getMeshMap(passport.plane3Mesh)) &&
        isTextureReady(getMeshMap(passport.plane3Back))
    );
};

// 加载通行证模型
const passport = new PassportModel(modelsPrefix, texturesDir);
let needsPathTracerMaterialSync = false;
passport.load(scene, () => {
    if(modelsPrefix === '') {
        // 加载挂件模型
        const access = new PassportAccessModel(accType, passport.getModelRoot()!);
        access.load(scene, () => {
            // 确保挂件加载完成后再设置 path tracer 场景，避免 path tracer 在挂件贴图未加载时缓存错误材质
            pathTracer.setScene(scene, camera);
            needsPathTracerMaterialSync = true;
        });
    } else {
        pathTracer.setScene(scene, camera);
        needsPathTracerMaterialSync = true;
    }
});

let renderStartTime = new Date().getTime();
let renderEndTime = renderStartTime;
let renderFinished = false;
let frameCount = 0;
const baseSamples = isMobile ? 50 : 200;
const maxSamples = isMobile ? 100 : 500;
// 渲染循环
const animate = (): void => {
    frameCount += 1;
    requestAnimationFrame(animate);
    controls.update();

    passport.updateRenderOrder(camera);

    if (needsPathTracerMaterialSync && arePassportTexturesReady()) {
        pathTracer.updateMaterials();
        needsPathTracerMaterialSync = false;
    }

    if(useWebGL) {
        const samplesElement = document.getElementById('samples');
        if (samplesElement) {
            samplesElement.textContent = `采样数: ${pathTracer.samples.toFixed(0)} / 耗时: ${((renderEndTime - renderStartTime) / 1000).toFixed(2)}s`;
        }

        if(pathTracer.samples < maxSamples) {
            if(pathTracer.samples < baseSamples || (pathTracer.samples >= baseSamples && frameCount % 10 === 0)) {
                pathTracer.renderSample();
            }
            if(renderFinished) return;
            renderEndTime = new Date().getTime();
        } else if(Number(pathTracer.samples.toFixed(0)) === maxSamples) {
            if(renderFinished) return;
            renderFinished = true;
            renderEndTime = new Date().getTime();
        }
    } else {
        renderer.render(scene, camera);
    }
};

animate();

controls.addEventListener('change', () => {
    pathTracer.updateCamera();
    renderFinished = false;
    renderStartTime = new Date().getTime();
});

// 窗口自适应
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});