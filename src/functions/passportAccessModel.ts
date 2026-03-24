import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { withBase } from './assetUrl.js';

export class PassportAccessModel {

    private _gltfRoot: THREE.Group | null = null;
    private _type: 'silver' | 'black';

    constructor(type: 'silver' | 'black', passport: THREE.Group) {
        this._type = type;
        this._gltfRoot = passport;
    }

    public load(
        scene: THREE.Scene,
        onLoaded?: (gltf: GLTF) => void,
        onProgress?: (event: ProgressEvent) => void,
        onError?: (error: unknown) => void,
    ): void {
        const loader = new GLTFLoader();
        loader.load(
            withBase(`models/rope_${this._type}.glb`),
            (gltf) => {
                gltf.scene.traverse((child) => {
                    if(child instanceof THREE.Mesh) {
                        const prevMaterial = child.material;
                        child.material = new THREE.MeshPhysicalMaterial({
                            map: prevMaterial.map,
                            color: prevMaterial.color,
                            roughness: 1.0,
                        });
                    }
                });
                scene.add(gltf.scene);
                gltf.scene.position.set(0.3, 1.6, 0.3);
                onLoaded?.(gltf);
                // 加载挂钩模型
                const hookLoader = new GLTFLoader();
                hookLoader.load(
                    withBase('models/hook.glb'),
                    (hookGltf) => {
                        hookGltf.scene.traverse((child) => {
                            if(child instanceof THREE.Mesh) {
                                if(child.name === 'geometry_0022') {
                                    const prevMaterial = child.material;
                                    child.material = new THREE.MeshPhysicalMaterial({
                                        map: prevMaterial.map,
                                        color: prevMaterial.color,
                                        roughness: 0.6,
                                    });
                                } else {
                                    const prevMaterial = child.material;
                                    child.material = new THREE.MeshPhysicalMaterial({
                                        map: prevMaterial.map,
                                        color: prevMaterial.color,
                                        roughness: 0.2,
                                        metalness: 1.0,
                                    });
                                }
                            }
                        });
                        gltf.scene.add(hookGltf.scene);
                        onLoaded?.(hookGltf);
                    },
                    onProgress,
                    onError
                );
            },
            onProgress,
            onError
        );
    }
}