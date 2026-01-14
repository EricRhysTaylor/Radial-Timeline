import { ButtonComponent, DropdownComponent, ToggleComponent, TextComponent, SliderComponent, ColorComponent } from 'obsidian';
import { ERT_CLASSES, ERT_DATA, type ErtVariant } from './classes';

type SectionOpts = { title?: string; desc?: string; variant?: ErtVariant };
type RowOpts = { label: string; desc?: string; variant?: ErtVariant };
type StackOpts = { label?: string; desc?: string; variant?: ErtVariant };
type InlineOpts = { variant?: ErtVariant };
type DividerOpts = { variant?: ErtVariant };

type TextInputOpts = { value?: string; placeholder?: string; onChange?: (value: string) => void };
type DropdownOpts = { options: Record<string, string>; value?: string; onChange?: (value: string) => void };
type ToggleOpts = { value?: boolean; onChange?: (value: boolean) => void };
type ButtonOpts = { text: string; onClick?: () => void; variant?: string; cta?: boolean };
type SliderOpts = { value?: number; min: number; max: number; step?: number; onChange?: (value: number) => void };
type ColorPickerOpts = { value?: string; onChange?: (value: string) => void; disabled?: boolean };

const applyVariant = (el: HTMLElement, variant?: ErtVariant) => {
  if (variant) el.addClass(variant);
};

export function mountRoot(parentEl: HTMLElement): HTMLElement {
  const root = parentEl.createDiv({ cls: ERT_CLASSES.ROOT });
  return root;
}

export function section(parent: HTMLElement, opts: SectionOpts, buildFn?: (bodyEl: HTMLElement) => void): HTMLElement {
  const sectionEl = parent.createDiv({ cls: ERT_CLASSES.SECTION });
  sectionEl.setAttribute(ERT_DATA.SECTION, 'true');
  applyVariant(sectionEl, opts.variant);

  if (opts.title) {
    sectionEl.createEl('div', { cls: ERT_CLASSES.SECTION_TITLE, text: opts.title });
  }
  if (opts.desc) {
    sectionEl.createEl('div', { cls: ERT_CLASSES.SECTION_DESC, text: opts.desc });
  }

  const bodyEl = sectionEl.createDiv({ cls: ERT_CLASSES.SECTION_BODY });
  if (buildFn) buildFn(bodyEl);
  return bodyEl;
}

export function row(parent: HTMLElement, opts: RowOpts): HTMLElement {
  const rowEl = parent.createDiv({ cls: ERT_CLASSES.ROW });
  rowEl.setAttribute(ERT_DATA.ROW, 'true');
  applyVariant(rowEl, opts.variant);

  const labelEl = rowEl.createDiv({ cls: ERT_CLASSES.LABEL });
  labelEl.setText(opts.label);

  if (opts.desc) {
    rowEl.createDiv({ cls: ERT_CLASSES.ROW_DESC, text: opts.desc });
  }

  const controlEl = rowEl.createDiv({ cls: ERT_CLASSES.CONTROL });
  return controlEl;
}

export function stack(parent: HTMLElement, opts: StackOpts): HTMLElement {
  const stackEl = parent.createDiv({ cls: ERT_CLASSES.STACK });
  stackEl.setAttribute(ERT_DATA.STACK, 'true');
  applyVariant(stackEl, opts.variant);

  if (opts.label) {
    const labelEl = stackEl.createDiv({ cls: ERT_CLASSES.LABEL });
    labelEl.setText(opts.label);
  }
  if (opts.desc) {
    stackEl.createDiv({ cls: ERT_CLASSES.ROW_DESC, text: opts.desc });
  }

  const controlEl = stackEl.createDiv({ cls: ERT_CLASSES.CONTROL });
  return controlEl;
}

export function inline(parent: HTMLElement, opts: InlineOpts = {}): HTMLElement {
  const inlineEl = parent.createDiv({ cls: ERT_CLASSES.INLINE });
  inlineEl.setAttribute(ERT_DATA.INLINE, 'true');
  applyVariant(inlineEl, opts.variant);
  return inlineEl;
}

export function divider(parent: HTMLElement, opts: DividerOpts = {}): HTMLElement {
  const dividerEl = parent.createDiv({ cls: ERT_CLASSES.DIVIDER });
  applyVariant(dividerEl, opts.variant);
  return dividerEl;
}

export function textInput(slot: HTMLElement, opts: TextInputOpts = {}): TextComponent {
  const input = new TextComponent(slot);
  if (opts.placeholder) input.setPlaceholder(opts.placeholder);
  if (opts.value !== undefined) input.setValue(opts.value);
  if (opts.onChange) input.onChange(opts.onChange);
  return input;
}

export function dropdown(slot: HTMLElement, opts: DropdownOpts): DropdownComponent {
  const dropdownComponent = new DropdownComponent(slot);
  Object.entries(opts.options).forEach(([value, label]) => dropdownComponent.addOption(value, label));
  if (opts.value !== undefined) dropdownComponent.setValue(opts.value);
  if (opts.onChange) dropdownComponent.onChange(opts.onChange);
  return dropdownComponent;
}

export function toggle(slot: HTMLElement, opts: ToggleOpts): ToggleComponent {
  const toggleComponent = new ToggleComponent(slot);
  if (opts.value !== undefined) toggleComponent.setValue(opts.value);
  if (opts.onChange) toggleComponent.onChange(opts.onChange);
  return toggleComponent;
}

export function button(slot: HTMLElement, opts: ButtonOpts): ButtonComponent {
  const buttonComponent = new ButtonComponent(slot);
  buttonComponent.setButtonText(opts.text);
  if (opts.cta) buttonComponent.setCta();
  if (opts.variant) buttonComponent.buttonEl.addClass(opts.variant);
  if (opts.onClick) buttonComponent.onClick(opts.onClick);
  return buttonComponent;
}

export function slider(slot: HTMLElement, opts: SliderOpts): SliderComponent {
  const sliderComponent = new SliderComponent(slot);
  sliderComponent.setLimits(opts.min, opts.max, opts.step ?? 1);
  if (opts.value !== undefined) sliderComponent.setValue(opts.value);
  if (opts.onChange) sliderComponent.onChange(opts.onChange);
  return sliderComponent;
}

export function colorPicker(slot: HTMLElement, opts: ColorPickerOpts): ColorComponent {
  const colorComponent = new ColorComponent(slot);
  if (opts.value !== undefined) colorComponent.setValue(opts.value);
  if (opts.disabled) colorComponent.setDisabled(true);
  if (opts.onChange) colorComponent.onChange(opts.onChange);
  return colorComponent;
}
