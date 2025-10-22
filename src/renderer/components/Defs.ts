export function renderDefs(PUBLISH_STAGE_COLORS: Record<string, string>): string {
  const plaid = Object.entries(PUBLISH_STAGE_COLORS).map(([stage, color]) => {
    return `
      <pattern id="plaidWorking${stage}" patternUnits="userSpaceOnUse" width="80" height="20" patternTransform="rotate(-20)">
        <rect width="80" height="20" fill="var(--rt-color-working)" opacity="var(--rt-color-plaid-opacity)"/>
        <path d="M 0 10 Q 2.5 -5, 5 10 Q 7.5 25, 10 10 Q 12.5 5, 15 10 Q 17.5 25, 20 10 Q 22.5 -5, 25 10 Q 27.5 25, 30 10 Q 32.5 5, 35 10 Q 37.5 25, 40 10 Q 42.5 -5, 45 10 Q 47.5 25, 50 10 Q 52.5 5, 55 10 Q 57.5 25, 60 10 Q 62.5 -5, 65 10 Q 67.5 25, 70 10 Q 72.5 5, 75 10 Q 77.5 25, 80 10" 
          stroke="${color}" stroke-opacity="var(--rt-color-plaid-stroke-opacity)" stroke-width="1.5" fill="none" />
      </pattern>

      <pattern id="plaidTodo${stage}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
        <rect width="10" height="10" fill="var(--rt-color-todo)" opacity="var(--rt-color-plaid-opacity)"/>
        <line x1="0" y1="0" x2="0" y2="10" stroke="${color}" stroke-width="1.5" stroke-opacity="0.5"/>
        <line x1="0" y1="0" x2="10" y2="0" stroke="${color}" stroke-width="1.5" stroke-opacity="0.5"/>
      </pattern>
    `;
  }).join('');

  const icons = `
    <symbol id="icon-circle-slash" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="9" x2="15" y1="15" y2="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-smile" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="9" x2="9.01" y1="9" y2="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="15" x2="15.01" y1="9" y2="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-house" viewBox="0 0 24 24">
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-printer" viewBox="0 0 24 24">
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <rect x="6" y="14" width="12" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-arrow-right-dash" viewBox="0 0 24 24">
      <path d="M11 9a1 1 0 0 0 1-1V5.061a1 1 0 0 1 1.811-.75l6.836 6.836a1.207 1.207 0 0 1 0 1.707l-6.836 6.835a1 1 0 0 1-1.811-.75V16a1 1 0 0 0-1-1H9a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4 9v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="icon-arrow-down" viewBox="0 0 24 24">
      <path d="M15 11a1 1 0 0 0 1 1h2.939a1 1 0 0 1 .75 1.811l-6.835 6.836a1.207 1.207 0 0 1-1.707 0L4.31 13.81a1 1 0 0 1 .75-1.811H8a1 1 0 0 0 1-1V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <symbol id="icon-bookmark-check" viewBox="0 0 24 24">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="m9 10 2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <!-- Arrow Up/Down From Line (toggle rotation) -->
    <symbol id="icon-arrow-up-from-line" viewBox="0 0 24 24">
      <path d="m18 9-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 3v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M5 21h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-arrow-down-from-line" viewBox="0 0 24 24">
      <path d="M19 3H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 21V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="m6 15 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </symbol>
    <!-- Mode Toggle Icon (cycles: All Scenes → Main Plot → Gossamer) -->
    <symbol id="icon-mode-toggle" viewBox="0 0 24 24">
      <path d="M12 3v18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="m16 16 4-4-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="m8 8-4 4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </symbol>
  `;

  const filters = `
    <filter id="plotTextBg" x="-25%" y="-25%" width="150%" height="150%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.8" result="DILATE"/>
      <feFlood flood-color="#000000" result="BLACK"/>
      <feComposite in="BLACK" in2="DILATE" operator="in" result="BG"/>
      <feMerge>
        <feMergeNode in="BG"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  `;

  return plaid + icons + filters;
}


export function renderProgressRingGradients(): string {
  return `
    <defs>
      <linearGradient id="linearColors1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FF0000"></stop>
        <stop offset="100%" stop-color="#FF7F00"></stop>
      </linearGradient>
      <linearGradient id="linearColors2" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="#FF7F00"></stop>
        <stop offset="100%" stop-color="#FFFF00"></stop>
      </linearGradient>
      <linearGradient id="linearColors3" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFFF00"></stop>
        <stop offset="100%" stop-color="#00FF00"></stop>
      </linearGradient>
      <linearGradient id="linearColors4" x1="1" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="#00FF00"></stop>
        <stop offset="100%" stop-color="#0000FF"></stop>
      </linearGradient>
      <linearGradient id="linearColors5" x1="0.5" y1="1" x2="0.5" y2="0">
        <stop offset="0%" stop-color="#0000FF"></stop>
        <stop offset="100%" stop-color="#4B0082"></stop>
      </linearGradient>
      <linearGradient id="linearColors6" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stop-color="#4B0082"></stop>
        <stop offset="100%" stop-color="#8F00FF"></stop>
      </linearGradient>
    </defs>`;
}


