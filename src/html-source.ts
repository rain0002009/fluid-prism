export type HTMLSourceStatus = 'disabled' | 'native' | 'fallback';

// Keep the new browser APIs local until they are available in TypeScript's DOM lib.
export interface DrawableCanvas extends HTMLCanvasElement {
  content: string;
  requestPaint(): void;
  updateElementGeometry(element: Element, options: { canvasTransform: DOMMatrixInit }): void;
  clearElementGeometry(element: Element): void;
}

export interface HTMLWebGLContext extends WebGLRenderingContext {
  texElementSubImage2D(target: number, level: number, x: number, y: number, element: Element, options: { width: number; height: number }): void;
}

export interface HTMLGPUQueue extends GPUQueue {
  drawElementImageToTexture(source: { source: Element }, destination: { texture: GPUTexture; size: { width: number; height: number } }): void;
}

const interactiveSelector = 'input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [tabindex], [role="button"]';
const managedStyles = ['width', 'height', 'box-sizing', 'margin', 'min-width', 'min-height', 'max-width', 'max-height'] as const;

/** Owns DOM placement, native paint timing and interaction protection for both backends. */
export class HTMLScene {
  private native = false;
  private destroyed = false;
  private hovered = false;
  private pressed = false;
  private marker = document.createComment('fluid-prism HTML source');
  private originalParent: ParentNode | null;
  private originalDrawable: string | null;
  private originalContent: string | null;
  private originalStyles: [string, string, string][];
  private canvasStyles: { visibility: string; pointerEvents: string; cursor: string };
  private listeners = new AbortController();
  snapshotReady = false;
  needsUpload = true;

  constructor(readonly canvas: HTMLCanvasElement, readonly source: HTMLElement, private onPaint: () => void) {
    if (source === canvas || source.contains(canvas)) {
      throw new Error('htmlSource must not contain the effect canvas.');
    }
    if (source.querySelector('[drawable]')) {
      throw new Error('htmlSource must be a single drawable subtree; nested drawable elements are not supported.');
    }
    this.originalParent = source.parentNode;
    this.originalDrawable = source.getAttribute('drawable');
    this.originalContent = canvas.getAttribute('content');
    this.originalStyles = managedStyles.map(name => [name, source.style.getPropertyValue(name), source.style.getPropertyPriority(name)]);
    this.canvasStyles = { visibility: canvas.style.visibility, pointerEvents: canvas.style.pointerEvents, cursor: canvas.style.cursor };
    if (source.parentNode) source.before(this.marker);
    canvas.style.visibility = 'hidden';
    if (!source.isConnected || canvas.contains(source)) canvas.before(source);
  }

  get status(): HTMLSourceStatus { return this.native ? 'native' : 'fallback'; }

  get interacting() {
    const selection = this.source.ownerDocument.getSelection();
    const selecting = selection && !selection.isCollapsed &&
      (this.source.contains(selection.anchorNode) || this.source.contains(selection.focusNode));
    return this.hovered || this.pressed || this.source.contains(this.source.ownerDocument.activeElement) || Boolean(selecting);
  }

  activate(backendSupported: boolean) {
    const canvas = this.canvas as Partial<DrawableCanvas>;
    if (!backendSupported || typeof canvas.content !== 'string' ||
        typeof canvas.requestPaint !== 'function' || typeof canvas.updateElementGeometry !== 'function' ||
        typeof canvas.clearElementGeometry !== 'function') return;

    this.native = true;
    this.canvas.setAttribute('content', 'drawable');
    this.source.setAttribute('drawable', '');
    this.canvas.appendChild(this.source);
    this.refreshStyle();
    this.resize();

    const signal = this.listeners.signal;
    this.canvas.addEventListener('paint', this.paint, { signal });
    this.source.addEventListener('pointerover', this.hover, { signal });
    this.source.addEventListener('pointerout', this.leave, { signal });
    this.source.addEventListener('pointerdown', () => { this.pressed = true; this.requestPaint(); }, { signal });
    this.source.addEventListener('focusin', this.requestPaint, { signal });
    this.source.addEventListener('focusout', this.requestPaint, { signal });
    this.source.ownerDocument.addEventListener('selectionchange', this.requestPaint, { signal });
    window.addEventListener('pointerup', this.release, { signal });
    window.addEventListener('pointercancel', this.release, { signal });
    window.addEventListener('blur', this.release, { signal });
    this.requestPaint();
  }

  refreshStyle() {
    this.canvas.style.visibility = this.native ? this.canvasStyles.visibility : 'hidden';
    if (this.native) {
      this.canvas.style.pointerEvents = 'auto';
      this.canvas.style.cursor = '';
    }
  }

  resize() {
    if (!this.native) return;
    // Drawable roots are laid out in CSS pixels; GPU texture dimensions are separate.
    Object.assign(this.source.style, {
      width: `${this.canvas.clientWidth}px`, height: `${this.canvas.clientHeight}px`,
      boxSizing: 'border-box', margin: '0', minWidth: '0', minHeight: '0', maxWidth: 'none', maxHeight: 'none',
    });
    this.needsUpload = true;
    this.requestPaint();
  }

  requestPaint = () => {
    if (this.native && !this.destroyed) (this.canvas as DrawableCanvas).requestPaint();
  };

  fallback() {
    if (this.native) this.restoreDOM();
    this.native = false;
    this.canvas.style.visibility = 'hidden';
    if (!this.source.isConnected || this.canvas.contains(this.source)) this.canvas.before(this.source);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.restoreDOM();
    this.marker.remove();
    if (!this.originalParent) this.source.remove();
    Object.assign(this.canvas.style, this.canvasStyles);
  }

  private paint = (event: Event) => {
    const changed = (event as Event & { changedElements?: Element[] }).changedElements;
    if (!this.snapshotReady || !changed || changed.includes(this.source)) this.needsUpload = true;
    this.snapshotReady = true;
    (this.canvas as DrawableCanvas).updateElementGeometry(this.source, { canvasTransform: new DOMMatrix() });
    this.onPaint();
  };

  private hover = (event: PointerEvent) => {
    this.hovered = event.target instanceof Element && Boolean(event.target.closest(interactiveSelector));
    this.requestPaint();
  };

  private leave = (event: PointerEvent) => {
    this.hovered = event.relatedTarget instanceof Element && this.source.contains(event.relatedTarget) && Boolean(event.relatedTarget.closest(interactiveSelector));
    this.requestPaint();
  };

  private release = () => { this.pressed = false; this.requestPaint(); };

  private restoreDOM() {
    this.listeners.abort();
    if (!this.native) {
      if (this.marker.parentNode) this.marker.before(this.source);
      return;
    }
    (this.canvas as DrawableCanvas).clearElementGeometry(this.source);
    if (this.marker.parentNode) this.marker.before(this.source);
    for (const [name, value, priority] of this.originalStyles) {
      if (value) this.source.style.setProperty(name, value, priority);
      else this.source.style.removeProperty(name);
    }
    if (!this.source.getAttribute('style')) this.source.removeAttribute('style');
    this.restoreAttribute(this.source, 'drawable', this.originalDrawable);
    this.restoreAttribute(this.canvas, 'content', this.originalContent);
  }

  private restoreAttribute(element: Element, name: string, value: string | null) {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
}
