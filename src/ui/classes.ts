export const ERT_CLASSES = {
  ROOT: 'ert-ui',
  SECTION: 'ert-section',
  SECTION_TITLE: 'ert-section-title',
  SECTION_DESC: 'ert-section-desc',
  SECTION_BODY: 'ert-section-body',
  ROW: 'ert-row',
  ROW_DESC: 'ert-row-desc',
  ROW_WIDE_CONTROL: 'ert-row--wideControl',
  ROW_RECOMMENDED: 'ert-row--recommended',
  SWATCH: 'ert-swatch',
  COLOR_INPUT_HIDDEN: 'ert-colorInput--hidden',
  ELEMENT_BLOCK: 'ert-elementBlock',
  ELEMENT_BLOCK_LEFT: 'ert-elementBlock__left',
  ELEMENT_BLOCK_RIGHT: 'ert-elementBlock__right',
  ELEMENT_BLOCK_ROW: 'ert-elementBlock__row',
  ELEMENT_BLOCK_ROW_PRIMARY: 'ert-elementBlock__row--primary',
  ELEMENT_BLOCK_ROW_SECONDARY: 'ert-elementBlock__row--secondary',
  STACK: 'ert-stack',
  INLINE: 'ert-inline',
  DIVIDER: 'ert-divider',
  LABEL: 'ert-label',
  CONTROL: 'ert-control',
  INLINE_SPLIT: 'ert-inline--split',
  ROW_COMPACT: 'ert-row--compact',
  ROW_TIGHT: 'ert-row--tight',
  STACK_TIGHT: 'ert-stack--tight',
  SECTION_TIGHT: 'ert-section--tight',
  SECTION_HERO: 'ert-section--hero',
  SECTION_ACCENT: 'ert-section--accent',
  SECTION_ICON: 'ert-section__icon',
  SECTION_ACTIONS: 'ert-section__actions',
  SKIN_APR: 'ert-skin--apr',
  SKIN_SOCIAL: 'ert-skin--social',
  SKIN_PRO: 'ert-skin--pro',
  FIELD_NOTE: 'ert-field-note',
  TOGGLE_ITEM: 'ert-toggle-item',
  CARD: 'ert-card',
  CARD_HERO: 'ert-card--hero',
  CARD_APR: 'ert-card--apr',
  ICON_BADGE: 'ert-iconBadge',
  CHIP: 'ert-chip',
  CARD_HEADER: 'ert-card__header',
  BADGE_PILL: 'ert-badgePill',
  BADGE_PILL_ICON: 'ert-badgePill__icon',
  BADGE_PILL_TEXT: 'ert-badgePill__text',
  BADGE_PILL_PRO: 'ert-badgePill--pro',
  BADGE_PILL_APR: 'ert-badgePill--apr',
  BADGE_PILL_NEUTRAL: 'ert-badgePill--neutral',
  BADGE_PILL_SM: 'ert-badgePill--sm',
  PILL: 'ert-pill',
  PREVIEW_FRAME: 'ert-previewFrame',
  PREVIEW_INNER: 'ert-previewFrame__inner',
  HERO_LAYOUT: 'ert-heroLayout',
  HERO_LEFT: 'ert-heroLayout__left',
  HERO_RIGHT: 'ert-heroLayout__right',
  DENSITY_COMPACT: 'ert-density--compact',
  PANEL: 'ert-panel',
  PANEL_ELEV: 'ert-panel--elev',
  PANEL_HEADER: 'ert-panel__header',
  PANEL_BODY: 'ert-panel__body',
  GRID_FORM: 'ert-gridForm',
  GRID_FORM_2: 'ert-gridForm--2',
  GRID_FORM_3: 'ert-gridForm--3',
  GRID_FORM_CELL: 'ert-gridForm__cell',
  OBJECT_ROW: 'ert-objectRow',
  OBJECT_ROW_LEFT: 'ert-objectRow__left',
  OBJECT_ROW_META: 'ert-objectRow__meta',
  OBJECT_ROW_ACTIONS: 'ert-objectRow__actions',
  ICON_BTN_GROUP: 'ert-iconBtnGroup',
  ICON_BTN: 'ert-iconBtn',
  PILL_BTN: 'ert-pillBtn',
  PILL_BTN_ICON: 'ert-pillBtn__icon',
  PILL_BTN_LABEL: 'ert-pillBtn__label',
  PILL_BTN_STANDARD: 'ert-pillBtn--standard',
  PILL_BTN_PRO: 'ert-pillBtn--pro',
  PILL_BTN_SOCIAL: 'ert-pillBtn--social',
  PILL_BTN_USED: 'ert-pillBtn--used',
  IS_ACTIVE: 'is-active',
  DEBUG: 'is-debug',
} as const;

export const ERT_CLASS_VALUES: string[] = Object.values(ERT_CLASSES);
export const ERT_CLASS_SET: Set<string> = new Set(ERT_CLASS_VALUES);

export type ErtVariant =
  | typeof ERT_CLASSES.ROW_COMPACT
  | typeof ERT_CLASSES.ROW_TIGHT
  | typeof ERT_CLASSES.STACK_TIGHT
  | typeof ERT_CLASSES.INLINE_SPLIT
  | typeof ERT_CLASSES.SECTION_TIGHT
  | typeof ERT_CLASSES.SECTION_HERO
  | typeof ERT_CLASSES.SECTION_ACCENT
  | typeof ERT_CLASSES.BADGE_PILL_PRO
  | typeof ERT_CLASSES.BADGE_PILL_APR
  | typeof ERT_CLASSES.BADGE_PILL_NEUTRAL
  | typeof ERT_CLASSES.BADGE_PILL_SM
  | typeof ERT_CLASSES.DEBUG
  | string | undefined;

export const ERT_DATA = {
  SECTION: 'data-ert-section',
  ROW: 'data-ert-row',
  STACK: 'data-ert-stack',
  INLINE: 'data-ert-inline',
} as const;
