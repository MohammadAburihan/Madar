import { effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { SessionService } from '../auth/session.service';
import { DraftUnavailableError } from '../erpnext/draft';
import { ErpnextError } from '../erpnext/erpnext-error';
import { Translator } from '../i18n/translator';

export type DraftOpening = 'opened' | 'busy' | 'stale';
export type DraftPhase = 'ready' | 'loading' | 'unavailable' | 'error';

/**
 * For a task flow that can be entered with `?draft=<name>`: loads that draft into the task before any step is
 * shown, and never falls through to an empty form when it can't (the phase says why instead).
 */
export function injectDraftEntry(
  open: (name: string) => Promise<DraftOpening>,
  onBusy: () => void,
) {
  const route = inject(ActivatedRoute);
  const session = inject(SessionService);
  const name = toSignal(route.queryParamMap.pipe(map((params) => params.get('draft'))), {
    initialValue: route.snapshot.queryParamMap.get('draft'),
  });
  const phase = signal<DraftPhase>(name() ? 'loading' : 'ready');
  let turn = 0;

  const run = async (draft: string | null) => {
    const mine = ++turn;
    if (!draft) {
      phase.set('ready');
      return;
    }
    phase.set('loading');
    try {
      const opening = await open(draft);
      if (mine !== turn || opening === 'stale') {
        return;
      }
      if (opening === 'busy') {
        onBusy();
      }
      phase.set('ready');
    } catch (error) {
      if (mine !== turn) {
        return;
      }
      const forbidden = ErpnextError.from(error).kind === 'forbidden';
      if (forbidden) {
        void session.checkExpired();
      }
      phase.set(forbidden || error instanceof DraftUnavailableError ? 'unavailable' : 'error');
    }
  };

  effect(() => {
    const draft = name();
    untracked(() => void run(draft));
  });

  return { phase: phase.asReadonly(), retry: () => void run(name()) };
}

/** The wording around a draft that is loading or can't be opened, shared by every task that continues drafts. */
export function draftGateText(tr: Translator, phase: DraftPhase) {
  const key = phase === 'error' ? 'error' : 'unavailable';
  return {
    loading: tr.t('draft.opening.loading'),
    title: tr.t(`draft.opening.${key}.title`),
    message: tr.t(`draft.opening.${key}.message`),
    back: tr.t('draft.opening.back'),
    retry: tr.t('draft.opening.retry'),
  };
}
