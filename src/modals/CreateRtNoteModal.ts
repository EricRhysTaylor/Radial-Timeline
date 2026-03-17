import { App, ButtonComponent, Modal } from 'obsidian';

export type RtNoteFamilyId = 'scene' | 'manuscript-matter' | 'story-world';
export type RtNoteSubtypeId =
    | 'basic-scene'
    | 'advanced-scene'
    | 'screenplay-scene'
    | 'podcast-scene'
    | 'front-matter'
    | 'back-matter'
    | 'bookmeta'
    | 'backdrop'
    | 'beat';

interface RtNoteSubtypeOption {
    id: RtNoteSubtypeId;
    title: string;
    description: string;
}

interface RtNoteFamilyOption {
    id: RtNoteFamilyId;
    title: string;
    description: string;
    subtypes: RtNoteSubtypeOption[];
}

const RT_NOTE_FAMILIES: RtNoteFamilyOption[] = [
    {
        id: 'scene',
        title: 'Scene',
        description: 'Start a new story scene in prose, screenplay, or podcast format.',
        subtypes: [
            { id: 'basic-scene', title: 'Core scene', description: 'Core scene properties for straightforward drafting.' },
            { id: 'advanced-scene', title: 'Scene with advanced properties', description: 'Core scene properties plus optional advanced scene metadata.' },
            { id: 'screenplay-scene', title: 'Screenplay scene', description: 'Screenplay-oriented scaffold with runtime defaults.' },
            { id: 'podcast-scene', title: 'Podcast scene', description: 'Podcast script scaffold with host and guest defaults.' },
        ],
    },
    {
        id: 'manuscript-matter',
        title: 'Manuscript matter',
        description: 'Add book-end notes and project-level metadata.',
        subtypes: [
            { id: 'front-matter', title: 'Front matter', description: 'Preface, title page, dedication, or opening matter.' },
            { id: 'back-matter', title: 'Back matter', description: 'Appendix, acknowledgments, notes, or ending matter.' },
            { id: 'bookmeta', title: 'BookMeta', description: 'Publication and rights metadata for the active book.' },
        ],
    },
    {
        id: 'story-world',
        title: 'Story world',
        description: 'Create contextual notes that shape time, place, or surrounding events.',
        subtypes: [
            { id: 'backdrop', title: 'Backdrop', description: 'Timeline context note with start and end dates.' },
            { id: 'beat', title: 'Beat', description: 'A single story beat note with act and purpose fields.' },
        ],
    },
];

const findFamily = (familyId: RtNoteFamilyId | null): RtNoteFamilyOption | null => {
    if (!familyId) return null;
    return RT_NOTE_FAMILIES.find((family) => family.id === familyId) ?? null;
};

export class CreateRtNoteModal extends Modal {
    private selectedFamilyId: RtNoteFamilyId | null = null;

    constructor(app: App, private readonly onSelectSubtype: (subtypeId: RtNoteSubtypeId) => Promise<void> | void) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl, titleEl } = this;
        titleEl?.setText('');

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md', 'ert-modal--note-creator');
        }

        contentEl.addClass('ert-modal-container', 'ert-stack', 'ert-note-creator-modal');
        this.render();
    }

    onClose(): void {
        this.contentEl.empty();
        this.selectedFamilyId = null;
    }

    private render(): void {
        const { contentEl } = this;
        const activeFamily = findFamily(this.selectedFamilyId);

        contentEl.empty();

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Create' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Create RT note' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: activeFamily
                ? 'Choose the exact note type you want to create.'
                : 'Pick a note family first, then choose the specific note type.',
        });

        const meta = header.createDiv({ cls: 'ert-modal-meta' });
        if (activeFamily) {
            meta.createSpan({ cls: 'ert-modal-meta-item', text: 'Step 2 of 2' });
            meta.createSpan({ cls: 'ert-modal-meta-item', text: activeFamily.title });
        }

        const panel = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass ert-note-creator-panel ert-stack' });
        panel.createDiv({
            cls: 'ert-section-desc',
            text: activeFamily ? activeFamily.description : 'These groups match the main note categories used across Radial Timeline.',
        });

        const grid = panel.createDiv({ cls: 'ert-note-creator-grid' });
        if (activeFamily) {
            this.renderSubtypeOptions(grid, activeFamily.subtypes);
        } else {
            this.renderFamilyOptions(grid, RT_NOTE_FAMILIES);
        }

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });

        if (activeFamily) {
            new ButtonComponent(actions)
                .setButtonText('Back')
                .onClick(() => {
                    this.selectedFamilyId = null;
                    this.render();
                });
            actions.createDiv({ cls: 'ert-modal-actions-spacer' });
        }

        new ButtonComponent(actions)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        window.requestAnimationFrame(() => {
            contentEl.querySelector<HTMLButtonElement>('.ert-note-creator-option')?.focus();
        });
    }

    private async handleSubtypeSelection(subtypeId: RtNoteSubtypeId): Promise<void> {
        this.close();
        await this.onSelectSubtype(subtypeId);
    }

    private renderFamilyOptions(container: HTMLElement, families: RtNoteFamilyOption[]): void {
        families.forEach((family) => {
            const { button, optionBody } = this.createOptionButton(container, family.title, family.description);
            optionBody.createDiv({
                cls: 'ert-note-creator-option__meta',
                text: `${family.subtypes.length} type${family.subtypes.length === 1 ? '' : 's'}`,
            });

            button.addEventListener('click', () => {
                this.selectedFamilyId = family.id;
                this.render();
            });
        });
    }

    private renderSubtypeOptions(container: HTMLElement, subtypes: RtNoteSubtypeOption[]): void {
        subtypes.forEach((subtype) => {
            const { button } = this.createOptionButton(container, subtype.title, subtype.description);
            button.addEventListener('click', () => {
                void this.handleSubtypeSelection(subtype.id);
            });
        });
    }

    private createOptionButton(container: HTMLElement, title: string, description: string): { button: HTMLButtonElement; optionBody: HTMLDivElement } {
        const button = container.createEl('button', {
            cls: 'ert-modal-choice ert-note-creator-option',
            attr: { type: 'button' },
        });
        const optionBody = button.createDiv({ cls: 'ert-note-creator-option__body' });
        optionBody.createDiv({
            cls: 'ert-note-creator-option__title',
            text: title,
        });
        optionBody.createDiv({
            cls: 'ert-note-creator-option__desc',
            text: description,
        });
        return { button, optionBody };
    }
}
