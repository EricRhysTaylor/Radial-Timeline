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
  DEBUG: 'is-debug',
} as const;

export type ErtVariant =
  | typeof ERT_CLASSES.ROW_COMPACT
  | typeof ERT_CLASSES.ROW_TIGHT
  | typeof ERT_CLASSES.STACK_TIGHT
  | typeof ERT_CLASSES.INLINE_SPLIT
  | typeof ERT_CLASSES.SECTION_TIGHT
  | typeof ERT_CLASSES.DEBUG
  | string | undefined;

export const ERT_DATA = {
  SECTION: 'data-ert-section',
  ROW: 'data-ert-row',
  STACK: 'data-ert-stack',
  INLINE: 'data-ert-inline',
} as const;
