import { parseReplyText, plainBlocks } from './reply-text';

const plain = (text: string) => ({ text, bold: false });
const bold = (text: string) => ({ text, bold: true });

describe('parseReplyText', () => {
  it('makes a paragraph of plain text and keeps its line breaks', () => {
    expect(parseReplyText('Line one\nLine two')).toEqual([
      { kind: 'paragraph', segments: [plain('Line one\nLine two')] },
    ]);
  });

  it('splits paragraphs at blank lines', () => {
    expect(parseReplyText('One\n\n\nTwo')).toEqual([
      { kind: 'paragraph', segments: [plain('One')] },
      { kind: 'paragraph', segments: [plain('Two')] },
    ]);
  });

  it('renders **bold** runs', () => {
    expect(parseReplyText('Lina owes **ILS 250.00** now')).toEqual([
      { kind: 'paragraph', segments: [plain('Lina owes '), bold('ILS 250.00'), plain(' now')] },
    ]);
  });

  it('leaves unclosed or empty markers as they are', () => {
    expect(parseReplyText('a ** b and **** c')).toEqual([
      { kind: 'paragraph', segments: [plain('a ** b and **** c')] },
    ]);
  });

  it('groups "- " lines into one list, with bold inside', () => {
    expect(parseReplyText('Low stock:\n- **POT-30**: 2\n- Seed mix: 0\nDone')).toEqual([
      { kind: 'paragraph', segments: [plain('Low stock:')] },
      {
        kind: 'list',
        items: [[bold('POT-30'), plain(': 2')], [plain('Seed mix: 0')]],
      },
      { kind: 'paragraph', segments: [plain('Done')] },
    ]);
  });

  it('treats a dash without a space as text', () => {
    expect(parseReplyText('-5 degrees')).toEqual([
      { kind: 'paragraph', segments: [plain('-5 degrees')] },
    ]);
  });

  it('never treats markup as anything but text', () => {
    const html = '<img src=x onerror=alert(1)> <b>hi</b>';
    expect(parseReplyText(html)).toEqual([{ kind: 'paragraph', segments: [plain(html)] }]);
  });

  it('reads CRLF line ends and returns nothing for blank text', () => {
    expect(parseReplyText('a\r\n- b')).toHaveLength(2);
    expect(parseReplyText('  \n ')).toEqual([]);
  });
});

describe('plainBlocks', () => {
  it('keeps what the user typed as one paragraph, markers and all', () => {
    expect(plainBlocks('  **hi**\n- there ')).toEqual([
      { kind: 'paragraph', segments: [plain('**hi**\n- there')] },
    ]);
    expect(plainBlocks('   ')).toEqual([]);
  });
});
