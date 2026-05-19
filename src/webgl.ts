import type { FluidPrismOptions } from './shared';
import { WebGLFluidPrismBackend } from './webgl-backend';

export class WebGLFluidPrism extends WebGLFluidPrismBackend {
  constructor(options: Omit<FluidPrismOptions, 'backend'> = {}) {
    super({ ...options, backend: 'webgl' });
  }
}

export function createWebGLFluidPrism(options?: Omit<FluidPrismOptions, 'backend'>) {
  return new WebGLFluidPrism(options);
}

export const webgl = {
  FluidPrism: WebGLFluidPrism,
  createFluidPrism: createWebGLFluidPrism,
};
