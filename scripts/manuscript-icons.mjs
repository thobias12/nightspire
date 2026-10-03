// Original small SVG emblems. Broad shapes share one ink/paper palette.
// Regenerate with: node scripts/prepare-manuscript-ui.mjs
const path = (d, fill = '#e0d4b5') => `<path d="${d}" fill="${fill}"/>`
const circle = (x, y, r, fill = '#e0d4b5') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`
const line = d => path(d, 'none')
const house = path('M5 16 16 5l11 11-3 1v11H8V17Z') + path('M13 28V18h6v10', '#555c54') + line('m7 14 9-6 9 6')
const tree = path('M14 29V18h5v11Z', '#c5a276') + path('m16 3 6 8-3 1 7 8-8-1v4l-4-1-8 1 5-8-4-1Z', '#818669')
const hammer = path('m8 5 5-3 11 9-4 5-5-4-9 17-4-3 10-17-5-1Z')
const cart = path('m4 10 19 1-2 10H8Z') + line('M2 6h4l3 17h17M13 9V5M18 10V6') + circle(11, 26, 3) + circle(23, 26, 3)
const wheat = line('M15 29 18 4M9 28l2-16M22 29l3-16') + path('m18 5-5-3-1 5 5 3 5-3-1-5Z', '#bdab77') + path('m17 13-5-3-1 5 5 3 5-3-1-5Z', '#bdab77') + path('m11 13-4-3v5l3 2 4-2v-5Zm14 0-4-3v5l3 2 4-2v-5Z', '#bdab77')
const shield = path('M6 5 16 2l10 3-1 13c-1 5-5 8-9 12-5-4-9-7-10-12Z', '#adb4a5') + line('M16 5v21M7 12h18')
const fire = path('M16 2c4 9 9 10 8 17-1 5-4 8-9 8-7 0-10-4-9-9 1-4 4-6 5-11l3 7c3-4 3-7 2-12Z', '#b7895c') + path('M16 14c4 6 5 11 0 13-5-2-4-7 0-13Z', '#dfc791') + line('m4 29 24-3M5 26l22 4')
const scroll = path('M8 4c5 2 14-2 18 0l-2 23c-6-2-12 2-19 0Z') + line('M11 9h10M11 13h8M10 18h10M10 22h6')
const chalice = path('M7 4h18l-2 10c-1 3-4 5-7 5s-6-2-7-5Z') + line('M16 19v7M10 29l2-3h8l2 3Z')
const tower = path('M5 4h5v4h4V3h5v5h4V4h5v10l-3 2v13H8V16l-3-2Z') + path('M13 29V19h7v10', '#555c54')
const person = path('M11 15c-3-3-3-9 1-11 5-3 11 1 10 7 0 3-2 5-4 6v3l8 4 2 6H4l2-6 7-4v-3Z')
export const ICONS = {
  wood: path('m5 10 16-5 7 16-17 6Z', '#bca47c') + path('m5 10 6 17c-6 3-10-12-6-17Z', '#e0c995') + line('m7 14 2 9M14 11l10-3M16 16l9-3M18 21l7-2'),
  food: path('M4 13c2-6 9-7 13-3 4-4 11 0 11 6 0 7-5 12-11 12H9C3 27 1 19 4 13Z', '#b4a374') + line('m8 12 3 5M14 10l2 7M22 12l-1 5'),
  ale: path('M6 9h17v19H6Z', '#c5a478') + path('M23 12h5v11h-5', 'none') + path('M6 10c-3-4 1-8 5-6 1-4 7-4 8 0 4-2 7 3 4 6Z') + line('M11 13v11M17 13v11'),
  ore: path('m3 21 6-14 12-3 9 16-8 8-15-1Z', '#9b9f99') + line('m9 7 4 10 8-13M13 17l9 11M13 17 3 21m10-1-11-3'),
  tools: hammer + line('m6 10 20 18M3 8l3-5 4 6-3 4Z'),
  gold: circle(18, 18, 11, '#c8af70') + circle(12, 12, 9, '#d8c38c') + line('m12 7-4 5 4 5 4-5Z'),
  planning: tree,
  logistics: cart,
  industry: path('M3 15h26l-6 6H11l-3-3H3Z') + path('M12 21h10l2 7H10Z'),
  services: chalice,
  defense: tower,
  housing: house,
  safety: shield,
  recreation: chalice,
  agriculture: wheat,
  build: hammer,
  rotate: path('M6 12c2-7 13-11 20-3l-4 4c-4-4-10-3-11 2l4 1-11 7-2-12Z') + path('M26 20c-2 7-13 11-20 3l4-4c4 4 10 3 11-2l-4-1 11-7 2 12Z'),
  inspect: path('M2 16C9 5 23 5 30 16 23 27 9 27 2 16Z') + circle(16, 16, 6, '#737969') + circle(16, 16, 2, '#e0d4b5'),
  camera: path('m3 7 8-3 10 3 8-3-1 23-8 2-9-3-8 3Z') + line('M11 4v22M21 7l-1 22m-6-16 3-3 3 4-4 4Z'),
  'street-view': path('M4 14 9 5l5 9H4Zm15-1 5-9 5 9H19Z') + line('M6 14v10M12 14v8M21 13v9M27 13v11') + path('m13 20 6-1 5 11H8Z'),
  center: circle(16, 16, 10) + path('m16 4 3 10 9 2-10 3-2 10-3-10-10-3 10-3Z', '#697570') + circle(16, 16, 2),
  save: scroll + path('m19 16 4 4 4-4v7h-8Z', '#a58e66'),
  load: scroll + path('m19 23 4-4 4 4v-7h-8Z', '#a58e66'),
  overview: house + line('M3 30h27'),
  selection: path('m7 3 18 14-8 1-3 11-3-1 2-10-7 3Z'),
  developer: path('M16 3 28 24H4Z') + line('M16 10v7M16 21v1'),
  tasks: scroll,
  pause: path('M8 5h5v23H8Zm11 0h5v23h-5Z'),
  grid: line('M4 4h24v24H4ZM4 12h24M4 20h24M12 4v24M20 4v24'),
  person,
  raid: shield + line('m7 27 19-22M21 4l5 4M23 6l4-4'),
  repair: hammer,
  storage: path('M4 9 16 3l12 6v19H4Z') + line('M5 10h22M9 15h14M9 21h14M16 10v18'),
  trade: cart,
  arrival: person + path('m21 18 8 5-8 5v-3h-6v-4h6Z', '#8c9a7c'),
  event: path('M14 3c-1 7-5 11-11 13 7 2 10 5 13 14 2-8 6-11 13-14-8-2-11-6-13-13Z'),
  crest: circle(16, 16, 14, '#9c8763') + path('M7 6h18v12c-1 5-4 7-9 10-5-3-8-5-9-10Z', '#647370') + path('m12 20 4-10 4 10Z') + path('M23 9c-6 1-7-4-6-6-6 4-3 11 3 10Z', '#d6bd85'),
  fire,
}

export function iconSvg(name) {
  if (!ICONS[name]) throw new Error(`Unknown manuscript icon: ${name}`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#4a4438" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>\n`
}
