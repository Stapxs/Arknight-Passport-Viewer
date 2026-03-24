import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withBase } from './assetUrl.js';

/**
 * 负责 Passport 模型的加载、纹理应用及渲染顺序动态排序
 */
export class PassportModel {
    public plane2Mesh: THREE.Mesh | null = null;
    public plane2Back: THREE.Mesh | null = null;
    public plane3Mesh: THREE.Mesh | null = null;
    public plane3Back: THREE.Mesh | null = null;

    private _modelsPrefix: string;
    private _texturesDir: string;

    /** 当前加载的 GLTF 场景根节点，用于 dispose 时从场景移除 */
    private _gltfRoot: THREE.Group | null = null;

    // 用于 updateRenderOrder 的复用向量，避免每帧 GC
    private readonly _localCamPos = new THREE.Vector3();

    constructor(modelsPrefix: string, texturesDir: string) {
        this._modelsPrefix = modelsPrefix;
        this._texturesDir = texturesDir;
    }

    /**
     * 加载并反转颜色的纹理，用于背面贴图
     * @param path 纹理路径
     * @returns 反转颜色后的 THREE.Texture 对象
     */
    private loadInvertedTexture(path: string): THREE.Texture {
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
                data[i]     = 255 - data[i];     // R
                data[i + 1] = 255 - data[i + 1]; // G
                data[i + 2] = 255 - data[i + 2]; // B
                // data[i + 3] alpha 保持不变
            }
            ctx.putImageData(imageData, 0, 0);
            texture.image = canvas;
            texture.needsUpdate = true;
        };
        img.src = withBase(path);
        return texture;
    }

    /**
     * 为给定 Mesh 应用双面纹理，背面纹理可选择是否反转颜色
     * @param mesh 需要应用双面纹理的 THREE.Mesh 对象
     * @param frontPath 正面纹理路径
     * @param backPath  背面纹理路径
     * @param invertBack 是否反转背面纹理颜色，默认为 false
     * @returns 背面 Mesh 对象的引用，供后续动态排序使用
     */
    private applyDoubleSidedTexture(
        mesh: THREE.Mesh,
        frontPath: string,
        backPath: string,
        invertBack = false,
    ): THREE.Mesh {
        const tl = new THREE.TextureLoader();

        const loadTex = (path: string) => {
            const tex = tl.load(withBase(path));
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
                map: invertBack ? this.loadInvertedTexture(backPath) : loadTex(backPath),
                side: THREE.BackSide,
            })
        );
        // 避免前后两层完全共面导致 path tracer 出现三角形缺面伪影
        backMesh.position.y = 0.001;
        // 作为 mesh 的子节点而非兄弟节点，自动继承 mesh 的世界变换
        mesh.add(backMesh);
        return backMesh;
    }

    /**
     * 加载 passport.glb 模型并将其添加到场景
     * @param scene 目标场景
     * @param onLoaded 加载完成回调
     * @param onProgress 加载进度回调
     * @param onError 加载错误回调
     */
    public load(
        scene: THREE.Scene,
        onLoaded?: (gltf: GLTF) => void,
        onProgress?: (event: ProgressEvent) => void,
        onError?: (error: unknown) => void,
    ): void {
        const loader = new GLTFLoader();
        loader.load(
            withBase(`models/${this._modelsPrefix}passport.glb`),
            (gltf: GLTF) => {
                this._gltfRoot = gltf.scene;
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
                        } else if (child.name === 'Plane_2') {
                            this.plane2Mesh = child;
                            this.plane2Back = this.applyDoubleSidedTexture(
                                child,
                                `textures/passport/${this._texturesDir}/11.png`,
                                `textures/passport/${this._texturesDir}/12.png`,
                                true,
                            );
                        }
                        else if (child.name === 'Plane_3') {
                            this.plane3Mesh = child;
                            this.plane3Back = this.applyDoubleSidedTexture(
                                child,
                                `textures/passport/${this._texturesDir}/22.png`,
                                `textures/passport/${this._texturesDir}/21.png`,
                            );
                        }
                    }
                });
                scene.add(gltf.scene);
                onLoaded?.(gltf);
            },
            onProgress,
            onError
        );
    }

    /**
     * 根据相机位置动态更新 Plane_2 / Plane_3 的渲染顺序，
     * 避免透明 Mesh 出现 Z-fighting / 排序错误。
     * 应在每帧渲染前调用。
     * @param camera 当前场景相机
     * @returns 本帧是否更新了相关材质的渲染顺序
     */
    public updateRenderOrder(camera: THREE.Camera): boolean {
        if (!this.plane2Mesh || !this.plane2Back || !this.plane3Mesh || !this.plane3Back) return false;

        // 将相机世界坐标变换到 Plane_2 的本地坐标系
        // 局部 Y > 0 表示相机在 Plane_2 正面一侧，< 0 则在背面一侧
        this._localCamPos.copy(camera.position);
        this.plane2Mesh.worldToLocal(this._localCamPos);
        const onFront = this._localCamPos.y > 0;
        const p2o = onFront ? 2 : 1;
        const p3o = onFront ? 1 : 2;

        const changed =
            this.plane2Mesh.renderOrder !== p2o ||
            this.plane2Back.renderOrder !== p2o ||
            this.plane3Mesh.renderOrder !== p3o ||
            this.plane3Back.renderOrder !== p3o;

        if (!changed) return false;

        this.plane2Mesh.renderOrder = p2o;
        this.plane2Back.renderOrder = p2o;
        this.plane3Mesh.renderOrder = p3o;
        this.plane3Back.renderOrder = p3o;
        return true;
    }

    public getModelRoot(): THREE.Group | null {
        return this._gltfRoot;
    }

    // -------------------------------------------------------------------------
    // 资源管理
    // -------------------------------------------------------------------------

    /**
     * 释放单个或多个材质及其贴图的 GPU 资源
     */
    private disposeMaterial(mat: THREE.Material | THREE.Material[]): void {
        const list = Array.isArray(mat) ? mat : [mat];
        for (const m of list) {
            const stdMat = m as THREE.MeshStandardMaterial;
            stdMat.map?.dispose();
            m.dispose();
        }
    }

    /**
     * 从场景中移除模型并释放所有 GPU 资源（几何体、材质、纹理）。
     * 调用后该实例可安全重新使用。
     * @param scene 当前场景
     */
    public dispose(scene: THREE.Scene): void {
        if (!this._gltfRoot) return;

        this._gltfRoot.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                // 几何体通常被多个 Mesh 共享，此处只在有引用时释放
                child.geometry.dispose();
                this.disposeMaterial(child.material);
            }
        });

        scene.remove(this._gltfRoot);
        this._gltfRoot = null;
        this.plane2Mesh = null;
        this.plane2Back = null;
        this.plane3Mesh = null;
        this.plane3Back = null;
    }

    /**
     * 卸载当前模型并加载新模型。
     * 内部先调用 dispose，再以新前缀重新 load。
     * @param scene        目标场景
     * @param newPrefix    新模型前缀（对应 `/models/<newPrefix>passport.glb`）
     * @param onLoaded     加载完成回调
     * @param onProgress   加载进度回调
     * @param onError      加载错误回调
     */
    public switchModel(
        scene: THREE.Scene,
        newPrefix: string,
        onLoaded?: (gltf: GLTF) => void,
        onProgress?: (event: ProgressEvent) => void,
        onError?: (error: unknown) => void,
    ): void {
        this.dispose(scene);
        this._modelsPrefix = newPrefix;
        this.load(scene, onLoaded, onProgress, onError);
    }

    /**
     * 在不重新加载 GLTF 的情况下，替换 Plane_2 / Plane_3 的贴图目录。
     * 会释放旧材质 / 纹理，然后重新应用双面材质。
     * @param newTexturesDir 新纹理目录名（对应 `textures/passport/<newTexturesDir>/`）
     */
    public switchTextures(newTexturesDir: string): void {
        this._texturesDir = newTexturesDir;

        if (this.plane2Mesh) {
            if (this.plane2Back) {
                this.disposeMaterial(this.plane2Back.material as THREE.Material);
                this.plane2Mesh.remove(this.plane2Back);
                this.plane2Back = null;
            }
            this.disposeMaterial(this.plane2Mesh.material as THREE.Material);
            this.plane2Back = this.applyDoubleSidedTexture(
                this.plane2Mesh,
                `textures/passport/${newTexturesDir}/11.png`,
                `textures/passport/${newTexturesDir}/12.png`,
                true,
            );
        }

        if (this.plane3Mesh) {
            if (this.plane3Back) {
                this.disposeMaterial(this.plane3Back.material as THREE.Material);
                this.plane3Mesh.remove(this.plane3Back);
                this.plane3Back = null;
            }
            this.disposeMaterial(this.plane3Mesh.material as THREE.Material);
            this.plane3Back = this.applyDoubleSidedTexture(
                this.plane3Mesh,
                `textures/passport/${newTexturesDir}/22.png`,
                `textures/passport/${newTexturesDir}/21.png`,
            );
        }
    }
}
