import { DEFAULTS } from '../src/shared';

const groups = [
  {
    title: '画面与颜色',
    controls: [
      { key: 'amount', label: '画面扭曲强度', hint: '越大，背景随波纹扭曲得越明显', min: 0, max: 10, step: 0.1 },
      { key: 'multiplier', label: '扭曲强度倍率', hint: '与上面的强度相乘，进一步放大扭曲', min: 0, max: 15, step: 0.1 },
      { key: 'rgbShift', label: '流动颜色搭配', hint: '改变流动色彩的组合，不控制浓淡', min: 0, max: 3, step: 0.05 },
      { key: 'colorMultiplier', label: '流动色彩强度', hint: '越大，随流动变化的颜色越明显', min: 0, max: 30, step: 0.5 },
      { key: 'shade', label: '色彩强度倍率', hint: '与上面的色彩强度相乘，不调整背景亮度', min: 0, max: 3, step: 0.05 },
      { key: 'blend', label: '颜色覆盖强度', hint: '越大，固定颜色或叠加颜色越浓', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: '波纹与流动',
    controls: [
      { key: 'radius', label: '波纹半径', hint: '拖动后使用固定半径；设为 0 则不产生新波纹', min: 0, max: 100, step: 1 },
      { key: 'force', label: '波纹推动力度', hint: '越大，鼠标推动波纹的力量越强', min: 0, max: 5, step: 0.1 },
      { key: 'pushStrength', label: '流动扩散力度', hint: '越大，已有波纹沿流动方向移动得越远', min: 0, max: 60, step: 1 },
      { key: 'velocityDissipation', label: '流动持久度', hint: '越大，流动减速越慢', min: 0.8, max: 0.995, step: 0.001 },
      { key: 'weight1Dissipation', label: '波纹持久度', hint: '越大，主要波纹消散越慢', min: 0.8, max: 0.995, step: 0.001 },
      { key: 'weight2Dissipation', label: '余波持久度', hint: '越大，较淡的余波保留越久', min: 0.5, max: 0.995, step: 0.001 },
      { key: 'curlScale', label: '旋涡密度', hint: '越大，旋涡越细密', min: 0, max: 0.1, step: 0.001 },
      { key: 'curlStrength', label: '旋涡力度', hint: '越大，流动中的卷曲越明显', min: 0, max: 10, step: 0.1 },
    ],
  },
  {
    title: '清晰度与性能',
    controls: [
      { key: 'dpr', label: '画面清晰度上限', hint: '越高越清晰，实际受屏幕像素密度限制', min: 0.5, max: 3, step: 0.25 },
      { key: 'paintScale', label: '波纹细节', hint: '越高，波纹边缘越细腻，性能开销越大', min: 0.1, max: 0.5, step: 0.025 },
      { key: 'lowScale', label: '流动细节', hint: '越高，流动计算越精细，性能开销越大', min: 0.05, max: 0.25, step: 0.025 },
    ],
  },
] as const;

type NumericSetting = typeof groups[number]['controls'][number]['key'];
const toggles = [
  { key: 'rainbow', label: '随流动变色', hint: '关闭后使用下方的固定颜色' },
  { key: 'pastelFilm', label: '淡彩薄膜效果', hint: '浅色背景上增加柔和淡彩；需开启变色并关闭颜色叠加' },
  { key: 'overlay', label: '只叠加颜色', hint: '在内容上方显示颜色，背景和文字不扭曲' },
  { key: 'autoSleep', label: '静止时节省性能', hint: '静态画面的波纹消散后暂停，移动鼠标时恢复' },
  { key: 'respectReducedMotion', label: '跟随系统减少动画', hint: '系统开启减少动态效果时，不产生新波纹' },
  { key: 'pauseOnInteraction', label: '交互时暂停新波纹', hint: '关闭后，悬停控件、按下、聚焦及选中文字时也会产生波纹' },
] as const;
type ToggleSetting = typeof toggles[number]['key'];
type VisualSettings = Record<Exclude<NumericSetting, 'radius'>, number> & Record<ToggleSetting, boolean> & { radius: number | 'auto'; color: [number, number, number] };

const defaults: VisualSettings = {
  ...Object.fromEntries(groups.flatMap(group => group.controls.map(control => [control.key, DEFAULTS[control.key]]))) as Pick<VisualSettings, NumericSetting>,
  pastelFilm: DEFAULTS.pastelFilm,
  rainbow: DEFAULTS.rainbow,
  overlay: DEFAULTS.overlay,
  autoSleep: DEFAULTS.autoSleep,
  respectReducedMotion: DEFAULTS.respectReducedMotion,
  pauseOnInteraction: DEFAULTS.pauseOnInteraction,
  color: [...DEFAULTS.color],
};

export function createSettingsPanel(onChange: (options: VisualSettings) => void) {
  let settings = { ...defaults };
  const panel = document.createElement('details');
  panel.id = 'visual-settings';
  panel.innerHTML = `
    <summary><span>效果设置 <small>实时预览</small></span><span class="settings-chevron" aria-hidden="true">⌄</span></summary>
    <div class="settings-body">
      <p class="settings-intro">拖动后立即生效，移动鼠标查看变化。</p>
      ${groups.map((group, index) => `
        <fieldset>
          <legend>${group.title}</legend>
          ${group.controls.map(control => `
            <div class="setting-row">
              <label for="setting-${control.key}">${control.label}<small>${control.hint}</small></label>
              <output for="setting-${control.key}">${settings[control.key] === 'auto' ? '自动' : settings[control.key]}</output>
              <input id="setting-${control.key}" data-setting="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${settings[control.key] === 'auto' ? 24 : settings[control.key]}" />
            </div>
          `).join('')}
          ${index === 0 ? `
            ${toggles.map(({ key, label, hint }) => `
              <label class="switch-row" for="setting-${key}">
                <span>${label}<small>${hint}</small></span>
                <input id="setting-${key}" data-toggle="${key}" type="checkbox" role="switch" ${settings[key] ? 'checked' : ''} />
                <span class="switch-track" aria-hidden="true"></span>
              </label>
            `).join('')}
            <label class="color-row" for="setting-color"><span>固定颜色<small>关闭“随流动变色”后生效</small></span><input id="setting-color" type="color" value="#253ddd" /></label>
            <p class="settings-hint">扭曲、颜色搭配、色彩强度和淡彩薄膜仅在关闭“只叠加颜色”时生效；颜色搭配、色彩强度和淡彩薄膜还需开启“随流动变色”。</p>
          ` : ''}
          ${index === 1 ? '<label class="switch-row" for="setting-autoRadius"><span>自动调整波纹宽度<small>移动越快，波纹越宽；关闭后使用固定半径</small></span><input id="setting-autoRadius" type="checkbox" role="switch" checked /><span class="switch-track" aria-hidden="true"></span></label>' : ''}
          ${index === 2 ? '<p class="settings-hint">如果画面卡顿，可以调低这些数值。</p>' : ''}
        </fieldset>
      `).join('')}
      <button id="reset-settings" type="button">恢复默认</button>
    </div>
  `;

  const ranges = panel.querySelectorAll<HTMLInputElement>('input[type="range"]');
  const switches = panel.querySelectorAll<HTMLInputElement>('[data-toggle]');
  const color = panel.querySelector<HTMLInputElement>('#setting-color')!;
  const autoRadius = panel.querySelector<HTMLInputElement>('#setting-autoRadius')!;
  autoRadius.addEventListener('change', () => {
    settings.radius = autoRadius.checked ? 'auto' : panel.querySelector<HTMLInputElement>('#setting-radius')!.valueAsNumber;
    panel.querySelector('output[for="setting-radius"]')!.textContent = settings.radius === 'auto' ? '自动' : String(settings.radius);
    onChange({ ...settings });
  });
  for (const input of ranges) {
    input.addEventListener('input', () => {
      const key = input.dataset.setting as NumericSetting;
      settings[key] = input.valueAsNumber;
      if (key === 'radius') autoRadius.checked = false;
      input.parentElement!.querySelector('output')!.value = input.value;
      onChange({ ...settings });
    });
  }
  for (const input of switches) {
    input.addEventListener('change', () => {
      settings[input.dataset.toggle as ToggleSetting] = input.checked;
      onChange({ ...settings });
    });
  }
  color.addEventListener('input', () => {
    settings.color = [1, 3, 5].map(offset => parseInt(color.value.slice(offset, offset + 2), 16) / 255) as [number, number, number];
    onChange({ ...settings });
  });
  panel.querySelector('#reset-settings')!.addEventListener('click', () => {
    settings = { ...defaults };
    for (const input of ranges) {
      const value = settings[input.dataset.setting as NumericSetting];
      input.value = String(value === 'auto' ? 24 : value);
      input.parentElement!.querySelector('output')!.value = value === 'auto' ? '自动' : String(value);
    }
    for (const input of switches) input.checked = settings[input.dataset.toggle as ToggleSetting];
    color.value = '#253ddd';
    autoRadius.checked = true;
    onChange({ ...settings });
  });

  // Adjusting a control should not also draw a stroke underneath the panel.
  panel.addEventListener('pointermove', event => event.stopPropagation());
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  const desktop = window.matchMedia('(min-width: 1000px)');
  panel.open = desktop.matches;
  desktop.addEventListener('change', event => { panel.open = event.matches; });
  return { element: panel, getOptions: () => ({ ...settings }) };
}
