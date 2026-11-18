import { DEFAULTS } from '../src/shared';

const groups = [
  {
    title: '折射与色彩',
    controls: [
      { key: 'amount', label: '折射强度', min: 0, max: 10, step: 0.1 },
      { key: 'multiplier', label: '位移倍数', min: 0, max: 15, step: 0.1 },
      { key: 'rgbShift', label: '色散相位', min: 0, max: 3, step: 0.05 },
      { key: 'colorMultiplier', label: '油膜色彩', min: 0, max: 30, step: 0.5 },
      { key: 'shade', label: '色彩明暗', min: 0, max: 3, step: 0.05 },
      { key: 'blend', label: '染色透明度', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: '流动与拖尾',
    controls: [
      { key: 'radius', label: '输入半径', min: 0, max: 100, step: 1 },
      { key: 'force', label: '输入力度', min: 0, max: 5, step: 0.1 },
      { key: 'pushStrength', label: '流动推动', min: 0, max: 60, step: 1 },
      { key: 'velocityDissipation', label: '速度保留', min: 0.8, max: 0.995, step: 0.001 },
      { key: 'weight1Dissipation', label: '波纹保留', min: 0.8, max: 0.995, step: 0.001 },
      { key: 'weight2Dissipation', label: '拖尾保留', min: 0.5, max: 0.995, step: 0.001 },
      { key: 'curlScale', label: '涡流密度', min: 0, max: 0.1, step: 0.001 },
      { key: 'curlStrength', label: '涡流强度', min: 0, max: 10, step: 0.1 },
    ],
  },
  {
    title: '画面精度',
    controls: [
      { key: 'dpr', label: '像素比上限', min: 0.5, max: 3, step: 0.25 },
      { key: 'paintScale', label: '波纹精度', min: 0.1, max: 0.5, step: 0.025 },
      { key: 'lowScale', label: '反馈精度', min: 0.05, max: 0.25, step: 0.025 },
    ],
  },
] as const;

type NumericSetting = typeof groups[number]['controls'][number]['key'];
const toggles = [
  { key: 'pastelFilm', label: '粉彩油膜' },
  { key: 'rainbow', label: '彩虹色彩' },
  { key: 'overlay', label: '透明叠加' },
  { key: 'autoSleep', label: '静止休眠' },
  { key: 'respectReducedMotion', label: '尊重减少动态效果偏好' },
] as const;
type ToggleSetting = typeof toggles[number]['key'];
type VisualSettings = Record<NumericSetting, number> & Record<ToggleSetting, boolean> & { color: [number, number, number] };

const defaults: VisualSettings = {
  ...Object.fromEntries(groups.flatMap(group => group.controls.map(control => [control.key, DEFAULTS[control.key]]))) as Record<NumericSetting, number>,
  pastelFilm: DEFAULTS.pastelFilm,
  rainbow: DEFAULTS.rainbow,
  overlay: DEFAULTS.overlay,
  autoSleep: DEFAULTS.autoSleep,
  respectReducedMotion: DEFAULTS.respectReducedMotion,
  color: [...DEFAULTS.color],
};

export function createSettingsPanel(onChange: (options: VisualSettings) => void) {
  let settings = { ...defaults };
  const panel = document.createElement('details');
  panel.id = 'visual-settings';
  panel.innerHTML = `
    <summary><span>效果设置 <small>Live controls</small></span><span class="settings-chevron" aria-hidden="true">⌄</span></summary>
    <div class="settings-body">
      <p class="settings-intro">拖动后立即生效，移动鼠标查看变化。</p>
      ${groups.map((group, index) => `
        <fieldset>
          <legend>${group.title}</legend>
          ${group.controls.map(control => `
            <div class="setting-row">
              <label for="setting-${control.key}">${control.label}<small>${control.key}</small></label>
              <output for="setting-${control.key}">${settings[control.key]}</output>
              <input id="setting-${control.key}" data-setting="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${settings[control.key]}" />
            </div>
          `).join('')}
          ${index === 0 ? `
            ${toggles.map(({ key, label }) => `
              <label class="switch-row" for="setting-${key}">
                <span>${label}<small>${key}</small></span>
                <input id="setting-${key}" data-toggle="${key}" type="checkbox" role="switch" ${settings[key] ? 'checked' : ''} />
                <span class="switch-track" aria-hidden="true"></span>
              </label>
            `).join('')}
            <label class="color-row" for="setting-color"><span>固定颜色<small>关闭彩虹后生效</small></span><input id="setting-color" type="color" value="#253ddd" /></label>
          ` : ''}
          ${index === 1 ? '<p class="settings-hint">保留值越高，波纹消散越慢。</p>' : ''}
          ${index === 2 ? '<p class="settings-hint">精度越高，GPU 开销越大。像素比受设备上限限制；调整精度会重建波纹缓冲。</p>' : ''}
        </fieldset>
      `).join('')}
      <button id="reset-settings" type="button">恢复默认</button>
    </div>
  `;

  const ranges = panel.querySelectorAll<HTMLInputElement>('input[type="range"]');
  const switches = panel.querySelectorAll<HTMLInputElement>('[data-toggle]');
  const color = panel.querySelector<HTMLInputElement>('#setting-color')!;
  for (const input of ranges) {
    input.addEventListener('input', () => {
      const key = input.dataset.setting as NumericSetting;
      settings[key] = input.valueAsNumber;
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
      input.value = String(settings[input.dataset.setting as NumericSetting]);
      input.parentElement!.querySelector('output')!.value = input.value;
    }
    for (const input of switches) input.checked = settings[input.dataset.toggle as ToggleSetting];
    color.value = '#253ddd';
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
