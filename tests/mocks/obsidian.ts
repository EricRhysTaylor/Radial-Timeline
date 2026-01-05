/**
 * Mock Obsidian API for unit testing
 * 
 * This provides minimal stubs for Obsidian imports so utility functions
 * that reference Obsidian types can be tested in Node.
 */

// Basic types
export class TFile {
  path: string;
  basename: string;
  extension: string;
  name: string;
  
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.basename = this.name.replace(/\.[^.]+$/, '');
    this.extension = this.name.split('.').pop() || '';
  }
}

export class TFolder {
  path: string;
  name: string;
  
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
  }
}

export class TAbstractFile {
  path: string;
  name: string;
  
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
  }
}

// Utility functions
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

export function parseYaml(yaml: string): unknown {
  // Minimal YAML parsing for tests - just handle simple key: value
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      result[key] = value.trim();
    }
  }
  return result;
}

export function stringifyYaml(obj: unknown): string {
  if (typeof obj !== 'object' || obj === null) return '';
  return Object.entries(obj as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

// Moment stub (Obsidian uses moment.js)
export const moment = {
  locale: () => 'en',
};

// Platform detection
export const Platform = {
  isMobile: false,
  isDesktop: true,
  isMacOS: true,
  isWin: false,
  isLinux: false,
};

// Notice stub
export class Notice {
  constructor(_message: string, _timeout?: number) {
    // No-op in tests
  }
}

// Request URL stub
export async function requestUrl(_options: unknown): Promise<{ status: number; json: unknown; text: string }> {
  throw new Error('requestUrl should be mocked in individual tests');
}

// Plugin/Modal base classes
export class Plugin {
  app: unknown;
  manifest: { version: string };
  
  constructor() {
    this.app = {};
    this.manifest = { version: '0.0.0' };
  }
  
  loadData(): Promise<unknown> { return Promise.resolve({}); }
  saveData(_data: unknown): Promise<void> { return Promise.resolve(); }
  registerEvent(_event: unknown): void {}
  registerDomEvent(_el: unknown, _type: string, _handler: unknown): void {}
  registerInterval(_interval: number): number { return 0; }
  addCommand(_cmd: unknown): void {}
  addSettingTab(_tab: unknown): void {}
}

export class Modal {
  app: unknown;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  contentEl: HTMLElement;
  
  constructor(_app: unknown) {
    this.app = _app;
    this.containerEl = {} as HTMLElement;
    this.modalEl = {} as HTMLElement;
    this.contentEl = {} as HTMLElement;
  }
  
  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  containerEl: HTMLElement;
  
  constructor(_app: unknown, _plugin: unknown) {
    this.app = _app;
    this.plugin = _plugin;
    this.containerEl = {} as HTMLElement;
  }
  
  display(): void {}
  hide(): void {}
}

// Component base
export class Component {
  register(_cb: () => void): void {}
  registerEvent(_event: unknown): void {}
  registerDomEvent(_el: unknown, _type: string, _handler: unknown): void {}
  registerInterval(_interval: number): number { return 0; }
}

// ItemView for custom views
export class ItemView extends Component {
  app: unknown;
  leaf: unknown;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  
  constructor(_leaf: unknown) {
    super();
    this.app = {};
    this.leaf = _leaf;
    this.containerEl = {} as HTMLElement;
    this.contentEl = {} as HTMLElement;
  }
  
  getViewType(): string { return ''; }
  getDisplayText(): string { return ''; }
  onOpen(): Promise<void> { return Promise.resolve(); }
  onClose(): Promise<void> { return Promise.resolve(); }
}

// Setting class
export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  
  constructor(_containerEl: HTMLElement) {
    this.settingEl = {} as HTMLElement;
    this.infoEl = {} as HTMLElement;
    this.nameEl = {} as HTMLElement;
    this.descEl = {} as HTMLElement;
    this.controlEl = {} as HTMLElement;
  }
  
  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  setClass(_cls: string): this { return this; }
  addText(_cb: (text: unknown) => void): this { return this; }
  addTextArea(_cb: (ta: unknown) => void): this { return this; }
  addToggle(_cb: (toggle: unknown) => void): this { return this; }
  addDropdown(_cb: (dd: unknown) => void): this { return this; }
  addButton(_cb: (btn: unknown) => void): this { return this; }
  addExtraButton(_cb: (btn: unknown) => void): this { return this; }
  addSlider(_cb: (slider: unknown) => void): this { return this; }
}

// Workspace
export class Workspace {
  getLeavesOfType(_type: string): unknown[] { return []; }
  getActiveFile(): TFile | null { return null; }
  on(_event: string, _handler: unknown): unknown { return {}; }
}

// Vault
export class Vault {
  getAbstractFileByPath(_path: string): TAbstractFile | null { return null; }
  getMarkdownFiles(): TFile[] { return []; }
  read(_file: TFile): Promise<string> { return Promise.resolve(''); }
  modify(_file: TFile, _content: string): Promise<void> { return Promise.resolve(); }
  create(_path: string, _content: string): Promise<TFile> { return Promise.resolve(new TFile(_path)); }
  delete(_file: TFile): Promise<void> { return Promise.resolve(); }
  on(_event: string, _handler: unknown): unknown { return {}; }
}

// App
export class App {
  vault: Vault;
  workspace: Workspace;
  
  constructor() {
    this.vault = new Vault();
    this.workspace = new Workspace();
  }
}

// MarkdownRenderer
export class MarkdownRenderer {
  static render(
    _app: App,
    _markdown: string,
    _el: HTMLElement,
    _sourcePath: string,
    _component: Component
  ): Promise<void> {
    return Promise.resolve();
  }
}


