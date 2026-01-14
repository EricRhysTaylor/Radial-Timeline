export const ERT_CLASSES = {
  ROOT: 'ert-ui',
  SECTION: 'ert-section',
  SECTION_TITLE: 'ert-section-title',
  SECTION_DESC: 'ert-section-desc',
  SECTION_BODY: 'ert-section-body',
  ROW: 'ert-row',
  ROW_DESC: 'ert-row-desc',
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
  FIELD_NOTE: 'ert-field-note',
  TOGGLE_ITEM: 'ert-toggle-item',
  CARD: 'ert-card',
  CARD_HERO: 'ert-card--hero',
  ICON_BADGE: 'ert-iconBadge',
  CHIP: 'ert-chip',
  PREVIEW_FRAME: 'ert-previewFrame',
  PREVIEW_INNER: 'ert-previewFrame__inner',
  HERO_LAYOUT: 'ert-heroLayout',
  HERO_LEFT: 'ert-heroLayout__left',
  HERO_RIGHT: 'ert-heroLayout__right',
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
  | typeof ERT_CLASSES.DEBUG
  | string | undefined;

export const ERT_DATA = {
  SECTION: 'data-ert-section',
  ROW: 'data-ert-row',
  STACK: 'data-ert-stack',
  INLINE: 'data-ert-inline',
} as const;
