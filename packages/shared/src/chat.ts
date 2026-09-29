/**
 * Cleans chat text: removes control, zero-width and bidi-override characters,
 * collapses whitespace and caps the length. The UI renders chat as plain
 * text (React escapes it), so no HTML is ever interpreted.
 */
export function sanitizeChat(input: string, maxLength = 200): string {
  return input
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
