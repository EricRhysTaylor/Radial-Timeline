const fs = require('fs');
const file = 'src/inquiry/InquiryView.ts';
let code = fs.readFileSync(file, 'utf-8');

function replaceContext(marker, replaceWith) {
  code = code.replace(marker, replaceWith);
}

replaceContext(`        this.setApiStatus('idle');\n        this.refreshUI();`, `        this.setApiStatus('idle');\n        this.refreshUI({ skipCorpus: true });`);
replaceContext(`        this.setApiStatus('idle');\n        this.refreshUI();`, `        this.setApiStatus('idle');\n        this.refreshUI({ skipCorpus: true });`);
replaceContext(`        this.setApiStatus('idle');\n        this.refreshUI();`, `        this.setApiStatus('idle');\n        this.refreshUI({ skipCorpus: true });`);
replaceContext(`        this.setApiStatus('idle');\n        this.refreshUI();`, `        this.setApiStatus('idle');\n        this.refreshUI({ skipCorpus: true });`);
replaceContext(`        this.setApiStatus('idle');\n        this.refreshUI();`, `        this.setApiStatus('idle');\n        this.refreshUI({ skipCorpus: true });`);
replaceContext(`        this.setApiStatus('idle');\n        this.refreshUI();`, `        this.setApiStatus('idle');\n        this.refreshUI({ skipCorpus: true });`);
replaceContext(`        this.setApiStatus('idle');\n        this.refreshUI();`, `        this.setApiStatus('idle');\n        this.refreshUI({ skipCorpus: true });`);

replaceContext(`        this.setApiStatus('running');\n        this.refreshUI();`, `        this.setApiStatus('running');\n        this.refreshUI({ skipCorpus: true });`);
replaceContext(`        this.setApiStatus('running');\n        this.refreshUI();`, `        this.setApiStatus('running');\n        this.refreshUI({ skipCorpus: true });`);
replaceContext(`        this.setApiStatus('running');\n        this.refreshUI();`, `        this.setApiStatus('running');\n        this.refreshUI({ skipCorpus: true });`);
replaceContext(`        this.setApiStatus('running');\n        this.refreshUI();`, `        this.setApiStatus('running');\n        this.refreshUI({ skipCorpus: true });`);
replaceContext(`        this.setApiStatus('running');\n        this.refreshUI();`, `        this.setApiStatus('running');\n        this.refreshUI({ skipCorpus: true });`);

replaceContext(`        this.updateMinimapFocus();\n        this.refreshUI();`, `        this.updateMinimapFocus();\n        this.refreshUI({ skipCorpus: true });`);

replaceContext(`    private handleModeIconToggleClick(): void {\n        const isFindings = this.state.mode === 'findings';\n        this.state.mode = isFindings ? 'minimap' : 'findings';\n        this.refreshUI();\n    }`, `    private handleModeIconToggleClick(): void {\n        const isFindings = this.state.mode === 'findings';\n        this.state.mode = isFindings ? 'minimap' : 'findings';\n        this.refreshUI({ skipCorpus: true });\n    }`);

fs.writeFileSync(file, code);
console.log('Patched UI-only refresh paths safely.');
