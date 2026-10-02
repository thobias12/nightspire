/** Original simple silhouettes for the enamel command buttons. */
const COMMAND_PATHS = {
  build: '<path d="m8 4 5-2 9 9-3 3-4-4-3 3 3 4-9 9-3-3 9-9-3-3-4 1z" fill="currentColor" stroke="none"/>',
  rotate: '<path d="M7 10a9 9 0 1 1-1 10M7 4v6H1"/><path d="m12 10 8 4-8 4z" fill="currentColor"/>',
  inspect: '<circle cx="13" cy="12" r="8"/><path d="m19 18 7 8M13 8v8M9 12h8"/>',
  camera: '<path d="m3 7 8-3 10 3 8-3v20l-8 3-10-3-8 3zM11 4v20M21 7v20"/>',
  street: '<path d="M8 27h16M11 27l3-11M21 27l-3-11M14 11h4M16 3v3"/><path d="m3 18 3-9h4M29 18l-3-9h-4"/>',
  center: '<circle cx="16" cy="16" r="8"/><circle cx="16" cy="16" r="3"/><path d="M16 1v7M16 24v7M1 16h7M24 16h7"/>',
} as const

export function commandIcon(name: keyof typeof COMMAND_PATHS): string {
  return '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + COMMAND_PATHS[name] + '</svg>'
}
