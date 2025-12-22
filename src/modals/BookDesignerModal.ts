import { App, Modal, Setting, Notice, normalizePath, ButtonComponent, TextAreaComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { createBeatTemplateNotes } from '../utils/beatsTemplates';
import { generateSceneContent, SceneCreationData } from '../utils/sceneGenerator';
import { DEFAULT_SETTINGS } from '../settings/defaults';

export class BookDesignerModal extends Modal {
    private plugin: RadialTimelinePlugin;
    
    // Form values
    private targetPath: string;
    private scenesToGenerate: number = 1;
    private targetRangeMax: number = 60;
    private selectedActs: number[] = [1, 2, 3];
    private subplots: string = "Main Plot\nSubplot A\nSubplot B";
    private character: string = "Hero\nAntagonist";
    private templateType: 'base' | 'advanced';
    private generateBeats: boolean = false;

    // Preview
    private previewHostEl: HTMLElement | null = null;
    private previewUpdateRaf: number | null = null;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app);
        this.plugin = plugin;
        this.targetPath = plugin.settings.sourcePath;
        this.templateType = 'base';
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        // Add styling classes to modal shell (Obsidian's container)
        // SAFE: Modal sizing via inline styles (Obsidian pattern)
        if (modalEl) {
            modalEl.classList.add('rt-pulse-modal-shell');
            modalEl.style.width = '860px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '96vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('rt-pulse-modal');
        contentEl.addClass('rt-book-designer-modal');

        // Hero Header (Gossamer Pulse Standard)
        const hero = contentEl.createDiv({ cls: 'rt-gossamer-simple-header' });
        hero.createSpan({ cls: 'rt-gossamer-simple-badge', text: 'SETUP' });
        hero.createDiv({ cls: 'rt-gossamer-hero-system', text: 'Book Designer' });
        hero.createDiv({ cls: 'rt-gossamer-score-subtitle', text: 'Configure and generate the skeleton for your new novel. Relies on Settings YAML templates Basic and Advanced.' });
        const heroMeta = hero.createDiv({ cls: 'rt-gossamer-simple-meta' });
        heroMeta.createSpan({ cls: 'rt-pulse-hero-meta-item', text: 'Scenes + Subplots' });
        heroMeta.createSpan({ cls: 'rt-pulse-hero-meta-item', text: 'Acts + Beats' });
        
        const scrollContainer = contentEl.createDiv({ cls: 'rt-gossamer-scores-container rt-manuscript-card-stack' });

        // SECTION 1: LOCATION & STRUCTURE
        const structCard = scrollContainer.createDiv({ cls: 'rt-pulse-glass-card rt-manuscript-card' });
        structCard.createDiv({ cls: 'rt-manuscript-card-head', text: 'Location & Structure' });

        // Target Location
        const locationSetting = new Setting(structCard)
            .setName('Target location')
            .setDesc('Folder path where the new book will be created.')
            .addText(text => text
                .setValue(this.targetPath)
                .setPlaceholder('Example:Book 1')
                .onChange(value => this.targetPath = value));
        // Removed rt-manuscript-card-block to restore single line layout


        // Scenes + target range group (single border spanning both columns)
        const countsGroup = structCard.createDiv({ cls: 'rt-manuscript-card-block rt-manuscript-group-block' });
        const countsGrid = countsGroup.createDiv({ cls: 'rt-manuscript-duo-grid' });

        const scenesSetting = new Setting(countsGrid)
            .setName('Scenes to generate')
            .setDesc('Number of template scene files to create with YAML frontmatter.')
            .addText(text => {
                text
                    .setValue(this.scenesToGenerate.toString())
                    .onChange(value => {
                        const parsed = parseInt(value);
                        if (!isNaN(parsed) && parsed > 0) {
                            this.scenesToGenerate = parsed;
                            this.schedulePreviewUpdate();
                        }
                    });
                text.inputEl.addClass('rt-input-full');
            });
        scenesSetting.settingEl.addClass('rt-manuscript-group-setting');

        const lengthSetting = new Setting(countsGrid)
            .setName('Target book length')
            .setDesc('Used for distribution of scenes (e.g. if 100, then 10 scenes will be numbered 10, 20, 30...).')
            .addText(text => {
                text
                    .setValue(this.targetRangeMax.toString())
                    .onChange(value => {
                        const parsed = parseInt(value);
                        if (!isNaN(parsed) && parsed > 0) {
                            this.targetRangeMax = parsed;
                            this.schedulePreviewUpdate();
                        }
                    });
                text.inputEl.addClass('rt-input-full');
            });
        lengthSetting.settingEl.addClass('rt-manuscript-group-setting');

        // Acts Selection (Checkboxes)
        const actSetting = structCard.createDiv({ cls: 'rt-manuscript-setting-row rt-manuscript-card-block rt-manuscript-acts-row' });
        actSetting.createDiv({ cls: 'rt-manuscript-setting-label', text: 'Acts to distribute scenes across' });
        const actChecks = actSetting.createDiv({ cls: 'rt-manuscript-checkbox-row' });

        [1, 2, 3].forEach(num => {
            const item = actChecks.createDiv({ cls: 'rt-manuscript-checkbox-item' });
            const input = item.createEl('input', { type: 'checkbox' });
            input.checked = this.selectedActs.includes(num);
            input.onchange = () => {
                if (input.checked) {
                    if (!this.selectedActs.includes(num)) this.selectedActs.push(num);
                } else {
                    this.selectedActs = this.selectedActs.filter(a => a !== num);
                }
                if (this.selectedActs.length === 0) this.selectedActs = [num]; // ensure at least one
                this.schedulePreviewUpdate();
            };
            const label = item.createEl('label');
            label.setText(`Act ${num}`);
            label.onclick = () => {
                input.click();
            };
        });
        structCard.createDiv({ cls: 'rt-manuscript-card-note', text: 'Scenes distribute across checked acts. If only Act 3 is checked, all scenes go to Act 3.' });


        // SECTION 2: CONTENT CONFIGURATION
        const contentCard = scrollContainer.createDiv({ cls: 'rt-pulse-glass-card rt-manuscript-card' });
        contentCard.createDiv({ cls: 'rt-manuscript-card-head', text: 'Content Configuration' });

        // Subplots + characters + preview (single border spanning all columns)
        const contentGroup = contentCard.createDiv({ cls: 'rt-manuscript-card-block rt-manuscript-group-block' });
        const contentGrid = contentGroup.createDiv({ cls: 'rt-manuscript-trio-grid' });

        // Subplots
        const subplotsSetting = new Setting(contentGrid)
            .setName('Subplots')
            .setDesc('Enter one subplot per line.')
            .setClass('rt-setting-stacked')
            .addTextArea(text => {
                text
                    .setValue(this.subplots)
                    .onChange(value => {
                        this.subplots = value;
                        this.schedulePreviewUpdate();
                    });
                text.inputEl.rows = 4;
                text.inputEl.classList.add('rt-manuscript-textarea');
            });
        subplotsSetting.settingEl.addClass('rt-manuscript-group-setting');
        
        // Characters
        const characterSetting = new Setting(contentGrid)
            .setName('Characters')
            .setDesc('Enter one character per line.')
            .setClass('rt-setting-stacked')
            .addTextArea(text => {
                text
                    .setValue(this.character)
                    .onChange(value => this.character = value);
                text.inputEl.rows = 4;
                text.inputEl.classList.add('rt-manuscript-textarea');
            });
        characterSetting.settingEl.addClass('rt-manuscript-group-setting');

        // Preview column
        const previewCol = contentGrid.createDiv({ cls: 'rt-manuscript-preview-col' });
        previewCol.createDiv({ cls: 'rt-manuscript-preview-title', text: 'Preview' });
        this.previewHostEl = previewCol.createDiv({ cls: 'rt-manuscript-preview-host' });
        this.schedulePreviewUpdate();


        // SECTION 3: TEMPLATES & EXTRAS
        const extraCard = scrollContainer.createDiv({ cls: 'rt-pulse-glass-card rt-manuscript-card' });
        extraCard.createDiv({ cls: 'rt-manuscript-card-head', text: 'Templates & Extras' });

        const extraRow = extraCard.createDiv({ cls: 'rt-manuscript-duo-row' });

        // Template Selection (Pills)
        const templSetting = extraRow.createDiv({ cls: 'rt-manuscript-setting-row rt-manuscript-card-block' });
        templSetting.createDiv({ cls: 'rt-manuscript-setting-label', text: 'Scene template' });
        const templPills = templSetting.createDiv({ cls: 'rt-manuscript-pill-row' });

        const options: {id: 'base' | 'advanced', label: string}[] = [
            { id: 'base', label: 'Base (Minimal)' },
            { id: 'advanced', label: 'Advanced' }
        ];

        options.forEach(opt => {
            const pill = templPills.createDiv({ cls: 'rt-manuscript-pill' });
            pill.setText(opt.label);
            if (this.templateType === opt.id) pill.addClass('rt-is-active');
            pill.onclick = () => {
                templPills.querySelectorAll('.rt-manuscript-pill').forEach(p => p.removeClass('rt-is-active'));
                pill.addClass('rt-is-active');
                this.templateType = opt.id;
            };
        });

        // Generate Beats Toggle (Pills)
        const beatSystem = this.plugin.settings.beatSystem || 'Custom';
        const beatLabel = beatSystem === 'Custom' ? 'Custom beats' : `${beatSystem} beats`;
        
        const beatSetting = extraRow.createDiv({ cls: 'rt-manuscript-setting-row rt-manuscript-card-block' });
        beatSetting.createDiv({ cls: 'rt-manuscript-setting-label', text: `Generate ${beatLabel}` });
        const beatPills = beatSetting.createDiv({ cls: 'rt-manuscript-pill-row' });
        
        const beatOptions = [{ val: false, label: 'No' }, { val: true, label: 'Yes' }];
        beatOptions.forEach(opt => {
            const pill = beatPills.createDiv({ cls: 'rt-manuscript-pill' });
            pill.setText(opt.label);
            if (this.generateBeats === opt.val) pill.addClass('rt-is-active');
            pill.onclick = () => {
                beatPills.querySelectorAll('.rt-manuscript-pill').forEach(p => p.removeClass('rt-is-active'));
                pill.addClass('rt-is-active');
                this.generateBeats = opt.val;
            };
        });

        // Actions Footer
        const footer = contentEl.createDiv({ cls: 'rt-beats-actions rt-manuscript-actions' });

        new ButtonComponent(footer)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        new ButtonComponent(footer)
            .setButtonText('Create Book')
            .setCta()
            .onClick(() => {
                this.close();
                this.generateBook();
            });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.previewHostEl = null;
        if (this.previewUpdateRaf !== null) {
            window.cancelAnimationFrame(this.previewUpdateRaf);
            this.previewUpdateRaf = null;
        }
    }

    private schedulePreviewUpdate(): void {
        if (!this.previewHostEl) return;
        if (this.previewUpdateRaf !== null) window.cancelAnimationFrame(this.previewUpdateRaf);
        this.previewUpdateRaf = window.requestAnimationFrame(() => {
            this.previewUpdateRaf = null;
            this.renderPreview();
        });
    }

    private parseSubplots(): string[] {
        const list = this.subplots
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        return list.length > 0 ? list : ['Main Plot'];
    }

    private getActsListSorted(): number[] {
        const acts = (this.selectedActs.length > 0 ? [...this.selectedActs] : [1])
            .map(a => Math.max(1, Math.min(3, a)))
            .sort((a, b) => a - b);
        // Dedupe
        return Array.from(new Set(acts));
    }

    private subplotColor(index: number, total: number): string {
        if (total <= 1) return 'var(--interactive-accent)';
        // Stable, distinct palette using golden angle hues.
        const hue = (index * 137.508) % 360;
        const sat = 62;
        const light = 56;
        return `hsl(${hue}deg ${sat}% ${light}%)`;
    }

    private renderPreview(): void {
        if (!this.previewHostEl) return;
        this.previewHostEl.empty();

        const scenes = Math.max(1, Math.floor(this.scenesToGenerate || 1));
        const subplotList = this.parseSubplots();
        const actsList = this.getActsListSorted();

        // Match generateBook() distribution logic
        const assignments: { act: number; subplotIndices: number[] }[] = [];
        for (let i = 1; i <= scenes; i++) {
            const actIndex = Math.floor(((i - 1) / scenes) * actsList.length);
            const act = actsList[Math.min(actIndex, actsList.length - 1)];

            // All subplots appear in every scene, so we map all indices
            const subplotIndices: number[] = subplotList.map((_, idx) => idx);

            assignments.push({ act, subplotIndices });
        }

        const size = 168;
        const outerR = 74;
        const innerR = 38; // empty inner core
        const cx = size / 2;
        const cy = size / 2;

        const svg = this.previewHostEl.createSvg('svg');
        svg.addClass('rt-manuscript-preview-svg');
        svg.setAttr('viewBox', `0 0 ${size} ${size}`);
        svg.setAttr('width', `${size}`);
        svg.setAttr('height', `${size}`);

        // Outer guide ring
        const guide = svg.createSvg('circle');
        guide.setAttr('cx', `${cx}`);
        guide.setAttr('cy', `${cy}`);
        guide.setAttr('r', `${outerR}`);
        guide.addClass('rt-manuscript-preview-guide');

        const tau = Math.PI * 2;
        const startOffset = -Math.PI / 2; // start at 12 o'clock

        for (let idx = 0; idx < scenes; idx++) {
            const a0 = startOffset + (idx / scenes) * tau;
            const a1 = startOffset + ((idx + 1) / scenes) * tau;
            const { subplotIndices, act } = assignments[idx];

            const count = subplotIndices.length;
            if (count > 0) {
                const step = (outerR - innerR) / count;
                
                for (let k = 0; k < count; k++) {
                    // k=0 is outer-most band, k=count-1 is inner-most band
                    const rOut = outerR - k * step;
                    const rIn = outerR - (k + 1) * step;
                    const subplotIndex = subplotIndices[k];

                    const path = svg.createSvg('path');
                    // Special case for full circle (1 scene)
                    if (scenes === 1) {
                        path.setAttr('d', this.donutAnnulusPath(cx, cy, rIn, rOut));
                    } else {
                        path.setAttr('d', this.donutSlicePath(cx, cy, rIn, rOut, a0, a1));
                    }
                    path.setAttr('fill', this.subplotColor(subplotIndex, subplotList.length));
                    path.addClass('rt-manuscript-preview-slice');
                    path.setAttr('data-act', `${act}`);
                }
            } else {
                // Should not happen as list defaults to 1 item, but safe fallback
                const path = svg.createSvg('path');
                if (scenes === 1) {
                    path.setAttr('d', this.donutAnnulusPath(cx, cy, innerR, outerR));
                } else {
                    path.setAttr('d', this.donutSlicePath(cx, cy, innerR, outerR, a0, a1));
                }
                path.setAttr('fill', this.subplotColor(0, subplotList.length));
                path.addClass('rt-manuscript-preview-slice');
                path.setAttr('data-act', `${act}`);
            }

            // Draw Act Divider if act changes next
            if (scenes > 1 && idx < scenes - 1) {
                const nextAct = assignments[idx + 1].act;
                if (nextAct !== act) {
                    const x1 = cx + innerR * Math.cos(a1);
                    const y1 = cy + innerR * Math.sin(a1);
                    const x2 = cx + (outerR + 4) * Math.cos(a1); // extend slightly out
                    const y2 = cy + (outerR + 4) * Math.sin(a1);
                    
                    const line = svg.createSvg('line');
                    line.setAttr('x1', `${x1}`);
                    line.setAttr('y1', `${y1}`);
                    line.setAttr('x2', `${x2}`);
                    line.setAttr('y2', `${y2}`);
                    line.setAttr('stroke', 'rgba(255, 255, 255, 0.5)');
                    line.setAttr('stroke-width', '2');
                }
            }
        }

        // Inner core boundary (empty center)
        const core = svg.createSvg('circle');
        core.setAttr('cx', `${cx}`);
        core.setAttr('cy', `${cy}`);
        core.setAttr('r', `${innerR}`);
        core.addClass('rt-manuscript-preview-core');
    }

    private donutAnnulusPath(cx: number, cy: number, r0: number, r1: number): string {
        // Draw full ring using two 180 degree arcs
        return [
            `M ${cx + r1} ${cy}`,
            `A ${r1} ${r1} 0 1 0 ${cx - r1} ${cy}`,
            `A ${r1} ${r1} 0 1 0 ${cx + r1} ${cy}`,
            `M ${cx + r0} ${cy}`,
            `A ${r0} ${r0} 0 1 1 ${cx - r0} ${cy}`,
            `A ${r0} ${r0} 0 1 1 ${cx + r0} ${cy}`,
            'Z'
        ].join(' ');
    }

    private donutSlicePath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
        const largeArc = a1 - a0 > Math.PI ? 1 : 0;

        const x0o = cx + r1 * Math.cos(a0);
        const y0o = cy + r1 * Math.sin(a0);
        const x1o = cx + r1 * Math.cos(a1);
        const y1o = cy + r1 * Math.sin(a1);

        const x0i = cx + r0 * Math.cos(a1);
        const y0i = cy + r0 * Math.sin(a1);
        const x1i = cx + r0 * Math.cos(a0);
        const y1i = cy + r0 * Math.sin(a0);

        return [
            `M ${x0o} ${y0o}`,
            `A ${r1} ${r1} 0 ${largeArc} 1 ${x1o} ${y1o}`,
            `L ${x0i} ${y0i}`,
            `A ${r0} ${r0} 0 ${largeArc} 0 ${x1i} ${y1i}`,
            'Z'
        ].join(' ');
    }

    async generateBook(): Promise<void> {
        const vault = this.plugin.app.vault;
        const targetFolder = normalizePath(this.targetPath.trim());

        // Ensure folder exists
        if (targetFolder && !vault.getAbstractFileByPath(targetFolder)) {
            try {
                await vault.createFolder(targetFolder);
            } catch (e) {
                new Notice(`Error creating folder: ${e}`);
                return;
            }
        }

        // Parse subplots
        const subplotList = this.subplots.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        if (subplotList.length === 0) subplotList.push('Main Plot');

        // Get template string
        const templateKey = this.templateType;
        const userTemplates = this.plugin.settings.sceneYamlTemplates;
        const templateString = userTemplates?.[templateKey];
        if (!templateString) {
            new Notice('Scene template not found in settings. Set a scene template before generating.');
            return;
        }

        const today = new Date().toISOString().slice(0, 10);
        let createdScenes = 0;

        new Notice(`Generating ${this.scenesToGenerate} scenes...`);

        // Ensure we don't divide by zero if user sets range < count
        const rangeMax = Math.max(this.targetRangeMax, this.scenesToGenerate);
        
        // Distribution Logic:
        // We want to distribute 'scenesToGenerate' items across 'rangeMax' slots.
        // Example: 10 scenes, 100 range.
        // Interval = 100 / 10 = 10.
        // Scenes: 10, 20, 30... 100.
        // Or if we want to start at 1? The user example was "scene one is '1 Title', scene 2 is '10 Title'".
        // That implies starting at 1 and roughly evenly spacing.
        // Let's use simple scaling: sceneNumber = Math.round((i / count) * rangeMax)
        // If i=1, count=10, range=100 -> 10.
        // If i=10, count=10, range=100 -> 100.
        // Wait, the user said "scene one is 1... scene 2 is 10". That's actually:
        // 1, 10, ... (implied step 9? or 10?)
        // Let's stick to simple even spacing:
        // Step size = rangeMax / scenesToGenerate.
        // Scene 1 = 1 * Step? Or roughly spread?
        // Let's do: sceneNum = Math.floor((i / this.scenesToGenerate) * this.targetRangeMax)
        // i=1 (1st iteration): (1/10)*100 = 10.
        // i=10: (10/10)*100 = 100.
        // This generates 10, 20, 30... 100.
        // If the user wants 1 to be "1 Title", then for 10 scenes in 100 range, it might be 1, 11, 21...
        // But 10, 20, 30 is cleaner "scene number distribution". 
        // Let's try to map the *index* (1-based) to the *target range*.
        
        for (let i = 1; i <= this.scenesToGenerate; i++) {
            // Calculate distributed scene number
            // Force at least 1, max at targetRangeMax.
            // Spread i from [1..N] to [1..Range]
            let sceneNum = Math.round((i / this.scenesToGenerate) * this.targetRangeMax);
            
            // Correction: If i=1, we often want scene 1 to exist.
            // If we strictly follow math for 10 scenes in 100: 10, 20, 30...
            // If the user *wants* "Scene 1", they might expect the first file to be "1 Scene.md".
            // Let's force scene 1 if it's the very first one generated and range allows.
            if (i === 1) sceneNum = 1;
            else if (i === this.scenesToGenerate) sceneNum = this.targetRangeMax;
            else {
                // Interpolate strictly between 1 and Max
                // range = (Max - 1)
                // steps = (N - 1)
                // stepSize = (Max - 1) / (N - 1)
                // val = 1 + (i - 1) * stepSize
                // E.g. 10 scenes, 100 range.
                // step = 99 / 9 = 11.
                // 1, 12, 23... 100.
                // This is mathematically sound for "even distribution starting at 1 ending at 100".
                const step = (this.targetRangeMax - 1) / (this.scenesToGenerate - 1);
                sceneNum = Math.round(1 + (i - 1) * step);
            }

            // Act Distribution (based on progress through the *generated* set, not the number)
            const actsList = this.selectedActs.length > 0 ? [...this.selectedActs].sort() : [1];
            const actIndex = Math.floor(((i - 1) / this.scenesToGenerate) * actsList.length);
            const act = actsList[Math.min(actIndex, actsList.length - 1)];

            // Subplot Distribution
            const assignedSubplots = [...subplotList];

            // Process characters: inline YAML (string for 1, array for >1)
            const characterList = this.character.split('\n').map(c => c.trim()).filter(c => c.length > 0);
            const yamlEscapeDoubleQuoted = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const yamlInlineArray = (values: string[]) => `[${values.map(v => `"${yamlEscapeDoubleQuoted(v)}"`).join(', ')}]`;
            const characterString =
                characterList.length === 0 ? 'Hero'
                : characterList.length === 1 ? characterList[0]
                : yamlInlineArray(characterList);

            const data: SceneCreationData = {
                act,
                when: today,
                sceneNumber: sceneNum,
                subplots: assignedSubplots,
                character: characterString,
                place: ''
            };

            const content = generateSceneContent(templateString, data);
            const fileContent = `---\n${content}\n---\n\n`;

            const filename = `${sceneNum} Scene.md`;
            const filePath = targetFolder ? `${targetFolder}/${filename}` : filename;

            try {
                if (!vault.getAbstractFileByPath(filePath)) {
                    await vault.create(filePath, fileContent);
                    createdScenes++;
                }
            } catch (e) {
                console.error(`Failed to create ${filename}`, e);
            }
        }

        // Generate Beats
        let beatsCreated = 0;
        if (this.generateBeats) {
            const beatSystem = this.plugin.settings.beatSystem || 'Custom';
            if (beatSystem !== 'Custom') {
                try {
                    const result = await createBeatTemplateNotes(vault, beatSystem, targetFolder);
                    beatsCreated = result.created;
                } catch (e) {
                    new Notice(`Error creating beats: ${e}`);
                }
            }
        }

        new Notice(`Book created! ${createdScenes} scenes, ${beatsCreated} beat notes.`);
    }
}
