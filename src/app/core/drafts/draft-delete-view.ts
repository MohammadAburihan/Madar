import { Translator } from '../i18n/translator';
import { DeleteFailure } from './draft-deletion.service';
import { DraftKind } from './draft-kind';

export type DeleteProblem = DeleteFailure | 'changed';

/** "Sale for Lina Haddad": how a draft is named in the dialog and the notices. */
export const draftName = (tr: Translator, kind: DraftKind, party: string) =>
  tr.t(`drafts.title.${kind}`, { party });

export function deleteDialogText(tr: Translator, kind: DraftKind, party: string) {
  return {
    title: tr.t('drafts.delete.dialog.title'),
    message: tr.t('drafts.delete.dialog.message', { draft: draftName(tr, kind, party) }),
    confirm: tr.t('drafts.delete.dialog.confirm'),
    keep: tr.t('drafts.delete.dialog.keep'),
  };
}

export function deleteProblemText(tr: Translator, problem: DeleteProblem) {
  return {
    title: tr.t(`drafts.delete.problem.${problem}.title`),
    message: tr.t(`drafts.delete.problem.${problem}.message`),
  };
}

export function deletedNoticeText(tr: Translator, kind: DraftKind, party: string) {
  return {
    title: tr.t('drafts.delete.done.title'),
    message: tr.t('drafts.delete.done.message', { draft: draftName(tr, kind, party) }),
  };
}
