export interface Segment {
  text: string;
  bold: boolean;
}

export type ReplyBlock =
  { kind: 'paragraph'; segments: Segment[] } | { kind: 'list'; items: Segment[][] };

const BOLD = /\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g;
const BULLET = /^\s*- (.*)$/;

function segments(text: string): Segment[] {
  const parts: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index), bold: false });
    }
    parts.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), bold: false });
  }
  return parts;
}

/**
 * The assistant's text as paragraphs and "- " lists with **bold** runs, for the template to render as plain
 * text: nothing here is ever treated as HTML.
 */
export function parseReplyText(text: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  let lines: string[] = [];
  const flush = () => {
    if (lines.length) {
      blocks.push({ kind: 'paragraph', segments: segments(lines.join('\n')) });
      lines = [];
    }
  };
  for (const line of text.split(/\r\n|\r|\n/)) {
    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      const last = blocks.at(-1);
      const item = segments(bullet[1]);
      if (last?.kind === 'list') {
        last.items.push(item);
      } else {
        blocks.push({ kind: 'list', items: [item] });
      }
    } else if (line.trim() === '') {
      flush();
    } else {
      lines.push(line);
    }
  }
  flush();
  return blocks;
}

/** What the user typed, as one paragraph that keeps its line breaks. */
export function plainBlocks(text: string): ReplyBlock[] {
  return text.trim() ? [{ kind: 'paragraph', segments: [{ text: text.trim(), bold: false }] }] : [];
}
