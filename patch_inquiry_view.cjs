const fs = require('fs');
const file = 'src/inquiry/InquiryView.ts';
let code = fs.readFileSync(file, 'utf-8');

for (let i = 0; i < 15; i++) {
  code = code.replace(`        this.setApiStatus('idle');\n        this.refreshUI();`, `        this.setApiStatus('idle');\n        this.refreshUI({ skipCorpus: true });`);
  code = code.replace(`        this.setApiStatus('running');\n        this.refreshUI();`, `        this.setApiStatus('running');\n        this.refreshUI({ skipCorpus: true });`);
  code = code.replace(`        this.setApiStatus('error', this.formatApiErrorReason(result));\n        this.refreshUI();`, `        this.setApiStatus('error', this.formatApiErrorReason(result));\n        this.refreshUI({ skipCorpus: true });`);
  code = code.replace(`        this.setApiStatus('success');\n        this.refreshUI();`, `        this.setApiStatus('success');\n        this.refreshUI({ skipCorpus: true });`);
}
code = code.replace(`        this.updateMinimapFocus();\n        this.refreshUI();`, `        this.updateMinimapFocus();\n        this.refreshUI({ skipCorpus: true });`);

code = code.replace(`    private handleModeIconToggleClick(): void {\n        const isFindings = this.state.mode === 'findings';\n        this.state.mode = isFindings ? 'minimap' : 'findings';\n        this.refreshUI();\n    }`, `    private handleModeIconToggleClick(): void {\n        const isFindings = this.state.mode === 'findings';\n        this.state.mode = isFindings ? 'minimap' : 'findings';\n        this.refreshUI({ skipCorpus: true });\n    }`);

fs.writeFileSync(file, code);
console.log('Patched UI-only refresh paths safely.');
