import { getDoc } from './db';
import { defaultDoc } from './setlist';
import type { Doc } from './types';

// Shared by "/" and "/[slug]": read the document, falling back to the built-in default
// so the page still renders read-only when the database isn't configured.
export async function loadDoc(): Promise<Doc> {
  try {
    return await getDoc();
  } catch {
    return defaultDoc();
  }
}
