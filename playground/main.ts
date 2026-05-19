import { createFluidPrism } from '../src';

createFluidPrism({
  zIndex: 1,
  contentRenderer(ctx, { width: w, height: h, dpr }) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#f3f4fb');
    g.addColorStop(0.55, '#eef2fb');
    g.addColorStop(1, '#f6f0f0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#f4ead8';
    ctx.lineWidth = 1;
    const step = Math.max(56, Math.round(w / 28));
    for (let x = 0; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#050505';
    ctx.font = `900 ${Math.max(96, w * 0.15)}px Inter, Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Fluid prism,', w * 0.05, h * 0.42);
    ctx.fillText('touch the light.', w * 0.05, h * 0.62);

    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.font = `500 ${Math.max(16, w * 0.014)}px Inter, Arial, sans-serif`;
    ctx.fillText('Move your cursor to refract the page texture.', w * 0.055, h * 0.76);
  },
});
