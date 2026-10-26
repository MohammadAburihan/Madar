import { effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { SessionService } from '../auth/session.service';
import { ErpnextError } from '../erpnext/erpnext-error';
import { Translator } from '../i18n/translator';
import { PrefillKind, PrefillPayloads, TaskPrefillService } from './task-prefill.service';

export type PrefillOpening = 'opened' | 'busy' | 'stale';
export type PrefillPhase = 'ready' | 'loading';
export type PrefillNotice = 'filled' | 'expired' | 'unavailable' | 'busy';

/** Something the proposal names is gone, disabled or not allowed for the user: nothing is filled in. */
export class PrefillUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`Proposal can't be opened: ${reason}`);
  }
}

/**
 * Loads `?prefill=<id>` into a task flow before any step shows; one that is gone or can't be applied leaves a fresh task
 * with a notice. Each id is taken once, so stepping back to the same address keeps the user's edits.
 */
export function injectPrefillEntry<K extends PrefillKind>(
  kind: K | readonly K[],
  open: (payload: PrefillPayloads[K], kind: K) => Promise<PrefillOpening>,
  failed: (notice: 'expired' | 'unavailable' | 'busy') => void,
) {
  const kinds: readonly K[] = typeof kind === 'string' ? [kind] : kind;
  const route = inject(ActivatedRoute);
  const prefills = inject(TaskPrefillService);
  const session = inject(SessionService);
  const id = toSignal(route.queryParamMap.pipe(map((params) => params.get('prefill'))), {
    initialValue: route.snapshot.queryParamMap.get('prefill'),
  });
  const phase = signal<PrefillPhase>(id() ? 'loading' : 'ready');
  let handled: string | null = null;
  let turn = 0;

  const run = async (prefill: string | null) => {
    if (!prefill || prefill === handled) {
      phase.set('ready');
      return;
    }
    handled = prefill;
    const mine = ++turn;
    let held: K | undefined;
    let payload: PrefillPayloads[K] | null = null;
    for (const k of kinds) {
      payload = prefills.peek(k, prefill);
      if (payload) {
        held = k;
        break;
      }
    }
    const dropAll = () => kinds.forEach((k) => prefills.drop(k, prefill));
    if (!held || !payload) {
      dropAll();
      failed('expired');
      phase.set('ready');
      return;
    }
    phase.set('loading');
    try {
      const opening = await open(payload, held);
      if (opening !== 'busy') {
        dropAll();
      }
      if (mine !== turn || opening === 'stale') {
        return;
      }
      if (opening === 'busy') {
        failed('busy');
      }
    } catch (error) {
      dropAll();
      if (mine !== turn) {
        return;
      }
      if (ErpnextError.from(error).kind === 'forbidden') {
        void session.checkExpired();
      }
      failed('unavailable');
    }
    phase.set('ready');
  };

  effect(() => {
    const prefill = id();
    untracked(() => void run(prefill));
  });

  return { phase: phase.asReadonly() };
}

const FILLED_MESSAGE: Record<PrefillKind, string> = {
  quick_sale: 'prefill.filled.sale',
  quotation: 'prefill.filled.sale',
  purchase_order: 'prefill.filled.purchase',
  collect_payment: 'prefill.filled.payment',
  stock_move: 'prefill.filled.move',
  new_customer: 'prefill.filled.contact',
  new_supplier: 'prefill.filled.contact',
  new_item: 'prefill.filled.contact',
};

export function prefillNoticeText(tr: Translator, notice: PrefillNotice, kind: PrefillKind) {
  return notice === 'filled'
    ? {
        tone: 'tint' as const,
        title: tr.t('prefill.filled.title'),
        message: tr.t(FILLED_MESSAGE[kind]),
      }
    : {
        tone: 'warning' as const,
        title: tr.t(`prefill.${notice}.title`),
        message: tr.t(`prefill.${notice}.message`),
      };
}
