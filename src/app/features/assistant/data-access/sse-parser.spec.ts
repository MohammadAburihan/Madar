import { SseEvent, SseParser } from './sse-parser';

const parse = (...chunks: string[]): SseEvent[] => {
  const parser = new SseParser();
  return [...chunks.flatMap((chunk) => parser.push(chunk)), ...parser.end()];
};

describe('SseParser', () => {
  it('reads an event with its name and data', () => {
    expect(parse('event: text\ndata: {"text":"Hi"}\n\n')).toEqual([
      { event: 'text', data: '{"text":"Hi"}' },
    ]);
  });

  it('reads several events from one chunk, in order', () => {
    expect(parse('event: text\ndata: 1\n\nevent: message\ndata: 2\n\n')).toEqual([
      { event: 'text', data: '1' },
      { event: 'message', data: '2' },
    ]);
  });

  it('gives the same events however the stream is cut', () => {
    const stream = 'event: text\ndata: {"text":"Hello"}\n\nevent: error\ndata: {"code":"busy"}\n\n';
    const whole = parse(stream);
    for (let cut = 1; cut < stream.length; cut++) {
      expect(parse(stream.slice(0, cut), stream.slice(cut))).toEqual(whole);
    }
    expect(parse(...stream.split(''))).toEqual(whole);
  });

  it('joins multi-line data with line feeds', () => {
    expect(parse('event: text\ndata: first\ndata: second\n\n')).toEqual([
      { event: 'text', data: 'first\nsecond' },
    ]);
  });

  it('accepts CRLF and CR line ends, even when a CRLF is split between chunks', () => {
    const expected = [{ event: 'text', data: 'x' }];
    expect(parse('event: text\r\ndata: x\r\n\r\n')).toEqual(expected);
    expect(parse('event: text\rdata: x\r\r')).toEqual(expected);
    expect(parse('event: text\r', '\ndata: x\r', '\n\r', '\n')).toEqual(expected);
  });

  it('skips comments and fields it does not know, and keeps a colon inside the value', () => {
    expect(parse(': keep-alive\nid: 7\nevent: text\ndata: a:b\n\n')).toEqual([
      { event: 'text', data: 'a:b' },
    ]);
  });

  it('removes only the one space after the colon', () => {
    expect(parse('data:  two\n\n')).toEqual([{ event: 'message', data: ' two' }]);
    expect(parse('data:none\n\n')).toEqual([{ event: 'message', data: 'none' }]);
  });

  it('names an event without an event field "message", and drops one without data', () => {
    expect(parse('data: x\n\n')).toEqual([{ event: 'message', data: 'x' }]);
    expect(parse('event: text\n\n')).toEqual([]);
  });

  it('keeps an event the stream ended in the middle of only if it has data', () => {
    expect(parse('event: message\ndata: done')).toEqual([{ event: 'message', data: 'done' }]);
    expect(parse('event: message\ndata: done\n')).toEqual([{ event: 'message', data: 'done' }]);
    expect(parse('event: message')).toEqual([]);
  });

  it('does not repeat an event name for the next event', () => {
    expect(parse('event: text\ndata: 1\n\ndata: 2\n\n')).toEqual([
      { event: 'text', data: '1' },
      { event: 'message', data: '2' },
    ]);
  });
});
