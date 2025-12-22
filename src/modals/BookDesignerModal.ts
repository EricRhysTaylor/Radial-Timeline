import { App, Modal, Setting, Notice, normalizePath, ButtonComponent, TextAreaComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { createBeatTemplateNotes } from '../utils/beatsTemplates';
import { generateSceneContent, SceneCreationData } from '../utils/sceneGenerator';
import { DEFAULT_SETTINGS } from '../settings/defaults';

export class BookDesignerModal extends Modal {
    private plugin: RadialTimelinePlugin;
    
    // Form values
    private targetPath: string;
    private scenesToGenerate: number = 10;
    private targetRangeMax: number = 100;
    private selectedActs: number[] = [1, 2, 3];
    private subplots: string = "Main Plot\nSubplot A\nSubplot B";
    private character: string = "Hero\nAntagonist";
    private templateType: 'base' | 'advanced';
    private generateBeats: boolean = false;

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
        hero.createDiv({ cls: 'rt-gossamer-score-subtitle', text: 'Configure and generate the skeleton for your new novel.' });
        const heroMeta = hero.createDiv({ cls: 'rt-gossamer-simple-meta' });
        heroMeta.createSpan({ cls: 'rt-pulse-hero-meta-item', text: 'Scenes + acts' });
        heroMeta.createSpan({ cls: 'rt-pulse-hero-meta-item', text: 'Subplots & beats' });
        
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
                .setPlaceholder('Example: Novels/Book 1')
                .onChange(value => this.targetPath = value));
        // Removed rt-manuscript-card-block to restore single line layout


        // Side-by-side row for counts/length
        const countsRow = structCard.createDiv({ cls: 'rt-manuscript-duo-row' });

        const scenesSetting = new Setting(countsRow)
            .setName('Scenes to generate')
            .setDesc('Number of actual scene files to create now.')
            .addText(text => {
                text
                    .setValue(this.scenesToGenerate.toString())
                    .onChange(value => {
                        const parsed = parseInt(value);
                        if (!isNaN(parsed) && parsed > 0) this.scenesToGenerate = parsed;
                    });
                text.inputEl.addClass('rt-input-full');
            });
        scenesSetting.settingEl.addClass('rt-manuscript-card-block');

        const lengthSetting = new Setting(countsRow)
            .setName('Target book length')
            .setDesc('Used for numbering distribution (e.g. if 100, scenes will be numbered 10, 20, 30...).')
            .addText(text => {
                text
                    .setValue(this.targetRangeMax.toString())
                    .onChange(value => {
                        const parsed = parseInt(value);
                        if (!isNaN(parsed) && parsed > 0) this.targetRangeMax = parsed;
                    });
                text.inputEl.addClass('rt-input-full');
            });
        lengthSetting.settingEl.addClass('rt-manuscript-card-block');

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

        const contentRow = contentCard.createDiv({ cls: 'rt-manuscript-duo-row' });

        // Subplots
        const subplotsSetting = new Setting(contentRow)
            .setName('Subplots')
            .setDesc('Enter one subplot per line.')
            .addTextArea(text => {
                text
                    .setValue(this.subplots)
                    .onChange(value => this.subplots = value);
                text.inputEl.rows = 4;
                text.inputEl.classList.add('rt-manuscript-textarea');
            });
        subplotsSetting.settingEl.addClass('rt-manuscript-card-block');
        
        // Characters
        const characterSetting = new Setting(contentRow)
            .setName('Characters')
            .setDesc('Enter one character per line.')
            .addTextArea(text => {
                text
                    .setValue(this.character)
                    .onChange(value => this.character = value);
                text.inputEl.rows = 4;
                text.inputEl.classList.add('rt-manuscript-textarea');
            });
        characterSetting.settingEl.addClass('rt-manuscript-card-block');


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
            let assignedSubplots: string[] = [];
            if (i === 1 && subplotList.length >= 2) {
                // First scene gets first two subplots (demo feature)
                assignedSubplots = [subplotList[0], subplotList[1]];
            } else {
                const index = (i - 1) % subplotList.length;
                assignedSubplots = [subplotList[index]];
            }

            // Process characters: join lines with comma
            const characterList = this.character.split('\n').map(c => c.trim()).filter(c => c.length > 0);
            const characterString = characterList.length > 0 ? characterList.join(', ') : 'Hero';

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
