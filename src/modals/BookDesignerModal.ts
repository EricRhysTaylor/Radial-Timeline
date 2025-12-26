import { App, Modal, Setting, Notice, normalizePath, ButtonComponent, TextAreaComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { createBeatTemplateNotes } from '../utils/beatsTemplates';
import { generateSceneContent, SceneCreationData } from '../utils/sceneGenerator';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { parseDuration, parseDurationDetail } from '../utils/date';

import { PlotSystemTemplate } from '../utils/beatsSystems';

// Helper to construct dynamic custom system object (Duplicated from TemplatesSection - ideally shared util)
function getCustomSystemFromSettings(plugin: RadialTimelinePlugin): PlotSystemTemplate {
    const name = plugin.settings.customBeatSystemName || 'Custom';
    const beatLines = plugin.settings.customBeatSystemBeats || [];
    
    // Convert simple strings to beat definitions
    const beats = beatLines.filter(line => line.trim().length > 0);
    const beatDetails = beats.map(b => ({
        name: b,
        description: '',
        range: ''
    }));

    return {
        name,
        beats,
        beatDetails,
        beatCount: beats.length
    };
}

export class BookDesignerModal extends Modal {
    private plugin: RadialTimelinePlugin;
    
    // Form values
    private timeIncrement: string = "1 day";
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
        this.templateType = 'base';
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        // Use generic modal system + Book Designer specific class
        if (modalEl) {
            modalEl.classList.add('rt-modal-shell');
            modalEl.style.width = '860px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '96vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('rt-modal-container');
        contentEl.addClass('rt-book-designer-modal');
        contentEl.addClass('rt-manuscript-surface');

           
        const sourcePath = this.plugin.settings.sourcePath || 'vault root';
        // Hero Header using generic modal system
        const hero = contentEl.createDiv({ cls: 'rt-modal-header' });
        hero.createSpan({ cls: 'rt-modal-badge', text: 'SETUP' });
        hero.createDiv({ cls: 'rt-modal-title', text: 'Book designer' });
        hero.createDiv({ cls: 'rt-modal-subtitle', text: `Configure and generate the scaffold for your new novel. Source path from settings will place scenes in ${sourcePath}` });
    
        
        const heroMeta = hero.createDiv({ cls: 'rt-modal-meta' });
        heroMeta.createSpan({ cls: 'rt-modal-meta-item', text: 'Scenes + Subplots' });
        heroMeta.createSpan({ cls: 'rt-modal-meta-item', text: 'Acts + Beats' });
        
        const scrollContainer = contentEl.createDiv({ cls: 'rt-gossamer-scores-container rt-manuscript-card-stack' });

        // SECTION 1: LOCATION & STRUCTURE
        const structCard = scrollContainer.createDiv({ cls: 'rt-pulse-glass-card rt-manuscript-card' });
        structCard.createDiv({ cls: 'rt-manuscript-card-head', text: 'Location & Structure' });

        // Time Increment Setting
        new Setting(structCard)
            .setName('Date increment per scene')
            .setDesc('Timeline increment across scenes (e.g. 1 hour, 1 day, 1 week).')
            .addText(text => {
                text.setValue(this.timeIncrement)
                    .setPlaceholder('1 day');
                
                // Use blur to validate
                text.inputEl.addEventListener('blur', () => {
                    const raw = text.getValue().trim();
                    // Clear previous animation classes to allow re-triggering
                    text.inputEl.removeClass('rt-input-flash-success');
                    text.inputEl.removeClass('rt-input-flash-error');
                    
                    // Force a reflow to restart animation if class is re-added immediately (though we clear above)
                    void text.inputEl.offsetWidth;

                    if (!raw) {
                        this.timeIncrement = '1 day';
                        text.setValue('1 day');
                        text.inputEl.addClass('rt-input-flash-success');
                        return;
                    }
                    const valid = parseDurationDetail(raw);
                    if (valid) {
                        this.timeIncrement = raw;
                        text.inputEl.addClass('rt-input-flash-success');
                    } else {
                        new Notice(`Invalid duration: "${raw}". Reverting to ${this.timeIncrement}.`);
                        text.setValue(this.timeIncrement);
                        text.inputEl.addClass('rt-input-flash-error');
                    }
                });
            });

        // Scenes + target range group (single border spanning both columns)
        const countsGroup = structCard.createDiv({ cls: 'rt-manuscript-card-block rt-manuscript-group-block' });
        const countsGrid = countsGroup.createDiv({ cls: 'rt-manuscript-duo-grid' });

        // Forward reference workaround: Define lengthSetting first but add it later? 
        // No, we can just define the update helper to take setting instance.
        // We need lengthSetting instance to update it when scenes changes.
        // So we create the element but populate it.
        
        // Actually, we can just define lengthSetting AFTER scenesSetting, 
        // but update it inside scenesSetting's onChange.
        // But scenesSetting's onChange runs later, so lengthSetting will be defined by then.
        // TypeScript might complain about "used before declaration" if inside the closure.
        // Let's use `this` or a mutable reference.
        
        let lengthSettingRef: Setting;

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
                            if (lengthSettingRef) this.updateTargetDesc(lengthSettingRef);
                            this.schedulePreviewUpdate();
                        }
                    });
                text.inputEl.addClass('rt-input-full');
            });
        scenesSetting.settingEl.addClass('rt-manuscript-group-setting');
        scenesSetting.settingEl.addClass('rt-scenes-generate-setting');

        const lengthSetting = new Setting(countsGrid)
            .setName('Target book length')
            .setDesc('Used for numbering distribution (e.g. 10, 20, 30...)')
            .addText(text => {
                text
                    .setValue(this.targetRangeMax.toString())
                    .onChange(value => {
                        const parsed = parseInt(value);
                        if (!isNaN(parsed) && parsed > 0) {
                            this.targetRangeMax = parsed;
                            if (lengthSettingRef) this.updateTargetDesc(lengthSettingRef);
                            this.schedulePreviewUpdate();
                        }
                    });
                text.inputEl.addClass('rt-input-full');
            });
        lengthSetting.settingEl.addClass('rt-manuscript-group-setting');
        lengthSetting.settingEl.addClass('rt-book-length-setting');
        lengthSettingRef = lengthSetting; // Assign ref
        this.updateTargetDesc(lengthSetting);

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
                if (this.selectedActs.length === 0) {
                    this.selectedActs = [num]; // ensure at least one
                    input.checked = true; // force UI back
                }
                this.schedulePreviewUpdate();
            };
            const label = item.createEl('label');
            label.setText(`Act ${num}`);
            label.onclick = () => {
                input.click();
            };
        });

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
                text.inputEl.addEventListener('blur', () => {
                    const trimmed = this.subplots.split('\n').map(s => s.trim()).filter(Boolean);
                    if (trimmed.length === 0) {
                        this.subplots = 'Main Plot';
                        text.setValue(this.subplots);
                        this.schedulePreviewUpdate();
                    }
                });
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
                text.inputEl.addEventListener('blur', () => {
                    const trimmed = this.character.split('\n').map(s => s.trim()).filter(Boolean);
                    if (trimmed.length === 0) {
                        this.character = 'Hero';
                        text.setValue(this.character);
                        this.schedulePreviewUpdate();
                    }
                });
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
        
        // Add cursor pointer to footer buttons
        footer.querySelectorAll('button').forEach(btn => {
            btn.style.cursor = 'pointer';
        });
    }

    private updateTargetDesc(setting: Setting): void {
        const scenes = this.scenesToGenerate;
        const max = this.targetRangeMax;
        
        // Calculate example numbers
        let examples: number[] = [];
        if (scenes <= 1) examples = [1];
        else if (scenes <= 3) {
            // e.g. 1, 50, 100
            for (let i=1; i<=scenes; i++) {
                const step = (max - 1) / (scenes - 1);
                examples.push(Math.round(1 + (i-1) * step));
            }
        } else {
            // Show first 3
            for (let i=1; i<=3; i++) {
                const step = (max - 1) / (scenes - 1);
                examples.push(Math.round(1 + (i-1) * step));
            }
        }
        
        const suffix = scenes > 3 ? '...' : '';
        setting.setDesc(`Scenes will be numbered: ${examples.join(', ')}${suffix} based on ${scenes} scenes across ${max} units.`);
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

        // Prepare distribution buckets for each active act (block distribution)
        // Rule:
        // - base = floor(scenes / acts)
        // - if base == 0: spread remainder from first act forward (e.g., 2 scenes -> 1,1,0)
        // - special case: acts=3, base=1, rem=2 => 2,2,1 (user desired for 5 scenes)
        // - otherwise (base > 0): add remainder to LAST act (e.g., 11 scenes -> 3,3,5)
        const buckets: number[][] = actsList.map(() => []);
        const baseSize = Math.floor(scenes / actsList.length);
        const rem = scenes % actsList.length;
        const sizes = actsList.map(() => baseSize);
        if (baseSize === 0) {
            let r = rem;
            let idx = 0;
            while (r > 0 && idx < sizes.length) {
                sizes[idx] += 1;
                r -= 1;
                idx += 1;
            }
        } else if (actsList.length === 3 && baseSize === 1 && rem === 2) {
            sizes[0] = 2;
            sizes[1] = 2;
            sizes[2] = 1;
        } else {
            sizes[sizes.length - 1] += rem;
        }

        let actCursor = 0;
        let remainingInAct = sizes[0] ?? scenes;
        for (let i = 1; i <= scenes; i++) {
            buckets[actCursor].push(i);
            remainingInAct -= 1;
            if (remainingInAct === 0 && actCursor < actsList.length - 1) {
                actCursor += 1;
                remainingInAct = sizes[actCursor];
            }
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

        // Draw Act Divider Lines (Fixed Positions: 0, 1/3, 2/3)
        // 12 o'clock = -PI/2
        const actAngles = [
            -Math.PI / 2,                  // Act 1 Start
            -Math.PI / 2 + (2 * Math.PI / 3), // Act 2 Start
            -Math.PI / 2 + (4 * Math.PI / 3)  // Act 3 Start
        ];

        actAngles.forEach(angle => {
            const x1 = cx + innerR * Math.cos(angle);
            const y1 = cy + innerR * Math.sin(angle);
            const x2 = cx + (outerR + 6) * Math.cos(angle);
            const y2 = cy + (outerR + 6) * Math.sin(angle);
            
            const line = svg.createSvg('line');
            line.setAttr('x1', `${x1}`);
            line.setAttr('y1', `${y1}`);
            line.setAttr('x2', `${x2}`);
            line.setAttr('y2', `${y2}`);
            line.setAttr('stroke', 'rgba(255, 255, 255, 0.3)');
            line.setAttr('stroke-width', '1');
        });

        // Render Scenes per Act Sector
        buckets.forEach((bucketScenes, bIdx) => {
            const actNumber = actsList[bIdx];
            // Fixed angular range for this Act (1=0..120, 2=120..240, 3=240..360)
            // Assuming Act 1, 2, 3 correspond to these fixed sectors.
            // If user selects Act 1 and Act 3 (skipping 2), Act 3 should still be in 240..360 sector.
            // Map Act Number to Sector Index (0, 1, 2)
            // Act numbers are 1-based.
            const sectorIndex = (actNumber - 1) % 3; 
            
            const sectorStart = actAngles[sectorIndex];
            const sectorSpan = (2 * Math.PI) / 3; // 120 degrees
            
            const count = bucketScenes.length;
            if (count === 0) return;

            const anglePerScene = sectorSpan / count;

            bucketScenes.forEach((_, localIdx) => {
                const a0 = sectorStart + localIdx * anglePerScene;
                const a1 = a0 + anglePerScene;
                
                // Draw Single Subplot Slice (Round Robin)
                // Scene 1 -> Subplot 1, Scene 2 -> Subplot 2, etc.
                // We need the global scene index to determine this.
                // We stored 'i' (1-based scene num) in bucketScenes.
                const sceneNum = bucketScenes[localIdx];
                const subplotIndex = (sceneNum - 1) % subplotList.length;
                
                const rOut = outerR;
                const rIn = innerR;

                const path = svg.createSvg('path');
                path.setAttr('d', this.donutSlicePath(cx, cy, rIn, rOut, a0, a1));
                path.setAttr('fill', this.subplotColor(subplotIndex, subplotList.length));
                path.addClass('rt-manuscript-preview-slice');
                path.setAttr('data-act', `${actNumber}`);
            });
        });

        // Inner core boundary (empty center)
        const core = svg.createSvg('circle');
        core.setAttr('cx', `${cx}`);
        core.setAttr('cy', `${cy}`);
        core.setAttr('r', `${innerR}`);
        core.addClass('rt-manuscript-preview-core');
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
        const targetPath = this.plugin.settings.sourcePath;
        const targetFolder = targetPath ? normalizePath(targetPath.trim()) : '';

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

        // Anchor generated scenes to today and advance each by time increment
        const sceneBaseDate = new Date();
        sceneBaseDate.setHours(0, 0, 0, 0);
        const incrementMs = parseDuration(this.timeIncrement) || (24 * 60 * 60 * 1000); // Default 1 day

        let createdScenes = 0;
        let skippedScenes = 0;

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
            // Increment time for each successive scene
            const sceneDate = new Date(sceneBaseDate.getTime() + (incrementMs * (i - 1)));
            let when = sceneDate.toISOString().slice(0, 10);
            
            if (incrementMs < (24 * 60 * 60 * 1000)) {
                 const hours = sceneDate.getHours().toString().padStart(2, '0');
                 const mins = sceneDate.getMinutes().toString().padStart(2, '0');
                 when = `${when} ${hours}:${mins}`;
            }

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

            // Act Distribution (Block method with remainder; if base==0 spread from first; special 2,2,1 case)
            const actsList = this.selectedActs.length > 0 ? [...this.selectedActs].sort() : [1];
            const baseSize = Math.floor(this.scenesToGenerate / actsList.length);
            const remAct = this.scenesToGenerate % actsList.length;
            const sizes = actsList.map(() => baseSize);
            if (baseSize === 0) {
                let r = remAct;
                let idx = 0;
                while (r > 0 && idx < sizes.length) {
                    sizes[idx] += 1;
                    r -= 1;
                    idx += 1;
                }
            } else if (actsList.length === 3 && baseSize === 1 && remAct === 2) {
                sizes[0] = 2;
                sizes[1] = 2;
                sizes[2] = 1;
            } else {
                sizes[sizes.length - 1] += remAct; // remainder to last act
            }

            let actIndex = 0;
            let remaining = sizes[0] ?? this.scenesToGenerate;
            for (let n = 1; n <= i; n++) {
                if (remaining === 0 && actIndex < actsList.length - 1) {
                    actIndex += 1;
                    remaining = sizes[actIndex];
                }
                remaining -= 1;
            }
            const act = actsList[actIndex];

            // Subplot Distribution (Round Robin)
            const subplotIndex = (i - 1) % subplotList.length;
            const assignedSubplots = [subplotList[subplotIndex]];

            // Process characters: inline YAML (string for 1, array for >1)
            const characterList = this.character.split('\n').map(c => c.trim()).filter(c => c.length > 0);
            const yamlEscapeDoubleQuoted = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const yamlInlineArray = (values: string[]) => `[${values.map(v => `"${yamlEscapeDoubleQuoted(v)}"`).join(', ')}]`;
            const characterString =
                characterList.length === 0 ? 'Hero'
                : characterList.length === 1 ? characterList[0]
                : yamlInlineArray(characterList);

            // Place list fallback
            const placeListRaw = targetPath ? [targetPath] : [];
            const placeList = placeListRaw.length > 0 ? placeListRaw : ['Unknown'];

            const data: SceneCreationData = {
                act,
                when,
                sceneNumber: sceneNum,
                subplots: assignedSubplots,
                character: characterString,
                place: 'Unknown',
                characterList,
                placeList
            };

            const content = generateSceneContent(templateString, data);
            const fileContent = `---\n${content}\n---\n\n`;

            const filename = `${sceneNum} Scene.md`;
            const filePath = targetFolder ? `${targetFolder}/${filename}` : filename;

            try {
                if (!vault.getAbstractFileByPath(filePath)) {
                    await vault.create(filePath, fileContent);
                    createdScenes++;
                } else {
                    skippedScenes++;
                }
            } catch (e) {
                const msg = (e as any)?.message ?? '';
                if (msg.includes('exists') || msg.includes('already exists')) {
                    skippedScenes++;
                } else {
                    console.error(`Failed to create ${filename}`, e);
                }
            }
        }

        // Generate Beats
        let beatsCreated = 0;
        if (this.generateBeats) {
            const beatSystem = this.plugin.settings.beatSystem || 'Custom';
            
            // Handle Custom Dynamic System
            if (beatSystem === 'Custom') {
                const customSystem = getCustomSystemFromSettings(this.plugin);
                if (customSystem.beats.length > 0) {
                     try {
                        const result = await createBeatTemplateNotes(vault, 'Custom', targetFolder, customSystem);
                        beatsCreated = result.created;
                    } catch (e) {
                        new Notice(`Error creating custom beats: ${e}`);
                    }
                } else {
                    // No custom beats defined, skip
                }
            } else {
                try {
                    const result = await createBeatTemplateNotes(vault, beatSystem, targetFolder);
                    beatsCreated = result.created;
                } catch (e) {
                    new Notice(`Error creating beats: ${e}`);
                }
            }
        }

        const skippedInfo = skippedScenes > 0 ? ` (skipped ${skippedScenes} existing)` : '';
        new Notice(`Book created! ${createdScenes} scenes${skippedInfo}, ${beatsCreated} beat notes.`);
    }
}
