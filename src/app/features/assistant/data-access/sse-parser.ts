export interface SseEvent {
  event: string;
  data: string;
}

const LINE_END = /\r\n|\n|\r/;

/** Server-sent events from text chunks that may split anywhere, including inside a line break. */
export class SseParser {
  private buffer = '';
  private event = '';
  private data: string[] = [];

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    for (;;) {
      const match = LINE_END.exec(this.buffer);
      // A lone CR at the very end may be the first half of CRLF.
      if (!match || (match[0] === '\r' && match.index === this.buffer.length - 1)) {
        return events;
      }
      const line = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const done = this.line(line);
      if (done) {
        events.push(done);
      }
    }
  }

  /** The stream closed: a last event not followed by a blank line still counts. */
  end(): SseEvent[] {
    const events = this.push('');
    if (this.buffer) {
      const done = this.line(this.buffer.replace(/\r$/, ''));
      this.buffer = '';
      if (done) {
        events.push(done);
      }
    }
    const last = this.dispatch();
    if (last) {
      events.push(last);
    }
    return events;
  }

  private line(line: string): SseEvent | null {
    if (line === '') {
      return this.dispatch();
    }
    if (line.startsWith(':')) {
      return null;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const raw = colon === -1 ? '' : line.slice(colon + 1);
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    if (field === 'event') {
      this.event = value;
    } else if (field === 'data') {
      this.data.push(value);
    }
    return null;
  }

  private dispatch(): SseEvent | null {
    const event = this.data.length
      ? { event: this.event || 'message', data: this.data.join('\n') }
      : null;
    this.event = '';
    this.data = [];
    return event;
  }
}
