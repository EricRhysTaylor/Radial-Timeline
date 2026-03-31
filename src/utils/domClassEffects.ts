type ClassEffectState = {
    rafId: number | null;
    timeoutId: number | null;
};

const classEffectStateByElement = new WeakMap<HTMLElement, Map<string, ClassEffectState>>();

function getClassEffectState(el: HTMLElement, className: string): ClassEffectState {
    let classState = classEffectStateByElement.get(el);
    if (!classState) {
        classState = new Map<string, ClassEffectState>();
        classEffectStateByElement.set(el, classState);
    }

    let effectState = classState.get(className);
    if (!effectState) {
        effectState = {
            rafId: null,
            timeoutId: null
        };
        classState.set(className, effectState);
    }

    return effectState;
}

export function replayTransientClass(
    el: HTMLElement,
    className: string,
    options: {
        removeClasses?: string[];
        durationMs?: number;
    } = {}
): void {
    const { removeClasses = [], durationMs = 0 } = options;
    const effectState = getClassEffectState(el, className);

    if (effectState.rafId !== null) {
        window.cancelAnimationFrame(effectState.rafId);
        effectState.rafId = null;
    }

    if (effectState.timeoutId !== null) {
        window.clearTimeout(effectState.timeoutId);
        effectState.timeoutId = null;
    }

    const classesToRemove = Array.from(new Set([className, ...removeClasses]));
    el.classList.remove(...classesToRemove);

    effectState.rafId = window.requestAnimationFrame(() => {
        effectState.rafId = null;
        if (!el.isConnected) return;

        el.classList.add(className);

        if (durationMs > 0) {
            effectState.timeoutId = window.setTimeout(() => {
                effectState.timeoutId = null;
                el.classList.remove(className);
            }, durationMs);
        }
    });
}
