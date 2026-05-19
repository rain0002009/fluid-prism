import type { FluidPrismOptions } from './shared';

export type { FluidPrismBackendKind, FluidPrismOptions } from './shared';
export {
  WebGLFluidPrism,
  createWebGLFluidPrism,
  webgl,
} from './webgl';
export {
  WebGPUFluidPrism,
  createWebGPUFluidPrism,
  webgpu,
} from './webgpu';

export async function createFluidPrism(options: FluidPrismOptions = {}) {
  const backend = options.backend ?? 'webgl';
  if (backend === 'webgpu') {
    const mod = await import('./webgpu');
    return mod.createWebGPUFluidPrism(options);
  }

  const mod = await import('./webgl');
  return mod.createWebGLFluidPrism(options);
}
