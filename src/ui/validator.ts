import { ERT_CLASSES } from './classes';

type ValidatorOptions = {
  rootLabel?: string;
  log?: (message: string, el?: Element) => void;
};

const hasSpacingInlineStyle = (el: HTMLElement): boolean => {
  const style = el.getAttribute('style');
  if (!style) return false;
  return /\bmargin\b|\bpadding\b/i.test(style);
};

const isDirectControl = (el: Element): boolean => {
  return ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName);
};

/**
 * Traverse an .ert-ui subtree and log drift warnings:
 * - Inline padding/margin
 * - Missing label/control within rows
 * - Raw controls not mounted in a control slot
 * - Legacy Obsidian .setting-item usage inside the scoped UI
 *
 * This runs automatically where invoked; no debug toggle required.
 */
export function validateErtLayout(root: HTMLElement | null, opts: ValidatorOptions = {}): void {
  if (!root) return;
  if (!root.classList.contains(ERT_CLASSES.ROOT)) return;

  const log = opts.log ?? ((message: string, el?: Element) => console.warn(`[ERT-UI drift] ${message}`, el));
  const rootLabel = opts.rootLabel ?? 'ert-ui';

  // Skip validation for explicitly opted-out subtrees.
  const shouldSkip = (el: Element) => (el as HTMLElement).dataset.ertSkipValidate === 'true';

  // Inline spacing detection
  root.querySelectorAll<HTMLElement>('*').forEach(el => {
    if (shouldSkip(el)) return;
    if (hasSpacingInlineStyle(el)) {
      log(`${rootLabel}: inline padding/margin detected. Remove spacing from controls; rely on layout containers.`, el);
    }
  });

  // Row structure checks
  root.querySelectorAll<HTMLElement>(`.${ERT_CLASSES.ROW}`).forEach(rowEl => {
    if (shouldSkip(rowEl)) return;
    const hasLabel = !!rowEl.querySelector(`.${ERT_CLASSES.LABEL}`);
    const hasControl = !!rowEl.querySelector(`.${ERT_CLASSES.CONTROL}`);
    if (!hasLabel || !hasControl) {
      log(`${rootLabel}: row missing ${!hasLabel ? 'label' : 'control'} slot. Use ui.row() structure.`, rowEl);
    }
  });

  // Direct controls at root level (should live inside control slots)
  Array.from(root.children).forEach(child => {
    if (shouldSkip(child)) return;
    if (isDirectControl(child)) {
      log(`${rootLabel}: direct control element found at root. Mount controls inside row/stack control slots.`, child);
    }
  });

  // Legacy .setting-item usage inside ert-ui scope
  root.querySelectorAll('.setting-item').forEach(item => {
    if (shouldSkip(item)) return;
    log(`${rootLabel}: legacy .setting-item detected inside ert-ui. Rebuild with ert primitives (section/row/stack/inline).`, item);
  });
}
