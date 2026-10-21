import { realTranslator } from '../../../testing/real-translator';
import { deleteDialogText, deleteProblemText, deletedNoticeText } from './draft-delete-view';

const visible = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/[⁦-⁩]/g, '')) as T;

describe('draft delete wording', () => {
  it('names the draft in the dialog and the notice', () => {
    const tr = realTranslator('en');
    expect(visible(deleteDialogText(tr, 'sale', 'Lina Haddad'))).toEqual({
      title: 'Delete this draft?',
      message: "Sale for Lina Haddad will be deleted. This can't be undone.",
      confirm: 'Delete',
      keep: 'Keep',
    });
    expect(visible(deletedNoticeText(tr, 'purchase', 'Green Clay'))).toEqual({
      title: 'Draft deleted',
      message: 'Purchase from Green Clay was deleted.',
    });
  });

  it('words the dialog and notice in Arabic', () => {
    const tr = realTranslator('ar');
    expect(visible(deleteDialogText(tr, 'sale', 'Lina Haddad'))).toEqual({
      title: 'حذف هذه المسودة؟',
      message: 'سيتم حذف بيع إلى Lina Haddad. لا يمكن التراجع عن ذلك.',
      confirm: 'حذف',
      keep: 'إبقاء',
    });
    expect(visible(deletedNoticeText(tr, 'quotation', 'Samir')).message).toBe(
      'تم حذف عرض سعر إلى Samir.',
    );
  });

  it('explains every way a delete can fail, in both languages', () => {
    for (const language of ['en', 'ar'] as const) {
      const tr = realTranslator(language);
      for (const problem of ['permission', 'linked', 'offline', 'error', 'changed'] as const) {
        const text = deleteProblemText(tr, problem);
        expect(text.title).not.toContain('drafts.delete');
        expect(text.message).not.toContain('drafts.delete');
      }
    }
    expect(deleteProblemText(realTranslator('en'), 'linked').title).toBe('This draft is linked');
    expect(deleteProblemText(realTranslator('en'), 'changed').title).toBe(
      'Already confirmed or gone',
    );
  });
});
