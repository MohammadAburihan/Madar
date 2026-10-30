const MARKER = /^Madar contact \S+$/;

/** The About text and the `Madar contact …` line that makes a create repeatable, both kept in the party's details field. */
export function splitAbout(text: unknown): { about: string; marker: string | null } {
  const rows = String(text ?? '').split(/\r?\n/);
  const at = rows.findIndex((row) => MARKER.test(row.trim()));
  if (at < 0) {
    return { about: rows.join('\n').trim(), marker: null };
  }
  const marker = rows[at].trim();
  rows.splice(at, 1);
  return { about: rows.join('\n').trim(), marker };
}

export function joinAbout(about: string, marker: string | null): string {
  return [about.trim(), marker].filter(Boolean).join('\n\n');
}
