import type { FluidPrismOptions } from './shared';
import { WebGPUFluidPrismBackend } from './webgpu-backend';

export class WebGPUFluidPrism extends WebGPUFluidPrismBackend {
  constructor(options: Omit<FluidPrismOptions, 'backend'> = {}) {
    super({ ...options, backend: 'webgpu' });
  }
}

export function createWebGPUFluidPrism(options?: Omit<FluidPrismOptions, 'backend'>) {
  return new WebGPUFluidPrism(options);
}

export const webgpu = {
  FluidPrism: WebGPUFluidPrism,
  createFluidPrism: createWebGPUFluidPrism,
};
