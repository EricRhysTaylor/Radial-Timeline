interface RotationView {
    interactionMode: 'allscenes' | 'mainplot' | 'gossamer';
    getRotationState(): boolean;
    setRotationState(rotated: boolean): void;
    applyRotationToNumberSquares(svg: SVGSVGElement, rotated: boolean): void;
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
}

export function setupRotationController(view: RotationView, svg: SVGSVGElement): void {
    const rotatable = svg.querySelector('#timeline-rotatable') as SVGGElement | null;
    const toggle = svg.querySelector('#rotation-toggle') as SVGGElement | null;
    const arrowUp = svg.querySelector('#rotation-arrow-up') as SVGUseElement | null;
    const arrowDown = svg.querySelector('#rotation-arrow-down') as SVGUseElement | null;
    if (!rotatable || !toggle || !arrowUp || !arrowDown) return;

    let rotated = view.getRotationState();

    const applyRotation = () => {
        if (rotated) {
            rotatable.setAttribute('transform', 'rotate(-120)');
            arrowUp.classList.add('is-hidden');
            arrowDown.classList.remove('is-hidden');
        } else {
            rotatable.removeAttribute('transform');
            arrowUp.classList.remove('is-hidden');
            arrowDown.classList.add('is-hidden');
        }
        svg.setAttribute('data-rotated', rotated ? 'true' : 'false');
        view.applyRotationToNumberSquares(svg, rotated);

        const counterSelectors = [
            '.color-key-center',
            '.estimated-date-tick',
            '.estimated-date-dot',
            '.target-date-tick',
            '.target-date-marker',
            '.estimation-date-label',
            '.target-date-tick',
            '.target-date-marker'
        ];
        counterSelectors.forEach((sel) => {
            const nodes = svg.querySelectorAll(sel);
            nodes.forEach((node) => {
                const el = node as SVGGraphicsElement;
                if (!el.closest('#timeline-rotatable')) return;
                const t = el.getAttribute('transform') || '';
                const base = t.replace(/\s*rotate\([^)]*\)/g, '').trim();
                if (rotated) {
                    el.setAttribute('transform', `${base} rotate(120)`.trim());
                } else {
                    el.setAttribute('transform', base);
                }
            });
        });
    };

    applyRotation();
    view.registerDomEvent(toggle as unknown as HTMLElement, 'click', () => {
        if (view.interactionMode !== 'allscenes') return;
        rotated = !rotated;
        view.setRotationState(rotated);
        applyRotation();
    });
}


