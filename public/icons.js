// Line icons (24px grid, stroke follows currentColor) and two small illustrations.

const svg = (body, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  trash: svg('<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5.5M14 11v5.5"/>'),
  kitchen: svg('<path d="M3 10h18"/><path d="M5 10v6.5A3.5 3.5 0 0 0 8.5 20h7a3.5 3.5 0 0 0 3.5-3.5V10"/><path d="M8.5 6.5c.8-1.5 2-2.2 3.5-2.2s2.7.7 3.5 2.2"/><path d="M12 4.3V3"/>'),
  bathroom: svg('<path d="M3 12h18v1.5A5.5 5.5 0 0 1 15.5 19h-7A5.5 5.5 0 0 1 3 13.5z"/><path d="M6 12V6a2 2 0 0 1 3.7-1"/><path d="M7.5 19l-1 2M16.5 19l1 2"/>'),
  floors: svg('<path d="M15 3l-3.5 9"/><path d="M7.5 12h8l2 9h-12z"/><path d="M9.5 16v5M13.5 16v5"/>'),
  fridges: svg('<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M6 10h12"/><path d="M9.5 6v1.5M9.5 13v3"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.75"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.5"/>'),
  share: svg('<path d="M12 15V3"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
};

// A flat house with a sparkle, for the welcome screen.
export const HOUSE = `<svg viewBox="0 0 240 160" width="240" height="160" aria-hidden="true" class="illo">
  <ellipse cx="120" cy="146" rx="92" ry="8" fill="var(--blue-50)"/>
  <rect x="58" y="70" width="124" height="76" rx="8" fill="var(--blue-100)"/>
  <path d="M46 78 120 22l74 56" fill="none" stroke="var(--blue)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="104" y="98" width="32" height="48" rx="5" fill="var(--blue)"/>
  <circle cx="128" cy="124" r="2.5" fill="var(--surface)"/>
  <rect x="72" y="88" width="22" height="22" rx="4" fill="var(--surface)"/>
  <rect x="146" y="88" width="22" height="22" rx="4" fill="var(--surface)"/>
  <path d="M83 88v22M72 99h22M157 88v22M146 99h22" stroke="var(--blue-100)" stroke-width="3"/>
  <path d="M196 30v16M188 38h16" stroke="var(--blue)" stroke-width="4" stroke-linecap="round"/>
  <path d="M40 40v10M35 45h10" stroke="var(--blue-300)" stroke-width="3" stroke-linecap="round"/>
  <circle cx="210" cy="72" r="4" fill="var(--blue-300)"/>
</svg>`;

// A tick in a circle with a little burst, for "nothing left to do".
export const ALL_CLEAR = `<svg viewBox="0 0 160 120" width="160" height="120" aria-hidden="true" class="illo">
  <circle cx="80" cy="60" r="38" fill="var(--blue-100)"/>
  <circle cx="80" cy="60" r="26" fill="var(--blue)"/>
  <path d="M68 60.5l8 8 16-17" fill="none" stroke="var(--surface)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M28 34l8 5M132 34l-8 5M24 78h10M126 78h10M80 6v10" stroke="var(--blue-300)" stroke-width="4" stroke-linecap="round"/>
</svg>`;
