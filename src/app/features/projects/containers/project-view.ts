import { formatDayMonth, formatMoney, formatShortDate } from '../../../core/format/format';
import { Language } from '../../../core/i18n/language.service';
import { Translator } from '../../../core/i18n/translator';
import { Stat } from '../../../shared/ui/stat-card.component';
import { TotalRow } from '../../../shared/ui/totals-card.component';
import {
  Attachment,
  LinkedRecord,
  ProjectDetail,
  ProjectSummary,
  ProjectTask,
  Requirement,
} from '../data-access/project.models';

const qtyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const qty = (value: number) => qtyFormat.format(Math.round(value * 1e6) / 1e6);

export interface TextCard {
  title: string;
  message: string;
}

/** "Garden installation · PRJ-018" / "Customer project · Lina Haddad". */
export function projectCard(project: ProjectSummary, tr: Translator): TextCard {
  return {
    title: tr.t('project.card', { title: project.title, name: project.name }),
    message:
      project.kind === 'customer'
        ? tr.t('project.customerProject', {
            customer: project.customerName ?? tr.t('project.noCustomer'),
          })
        : tr.t('project.internalProject'),
  };
}

export function overviewHeading(project: ProjectDetail, tr: Translator) {
  return {
    title: project.title,
    subtitle:
      project.kind === 'customer'
        ? tr.t('project.overview.customerSubtitle', {
            customer: project.customerName ?? tr.t('project.noCustomer'),
          })
        : tr.t('project.overview.internalSubtitle', { name: project.name }),
    chip: {
      label: tr.t(`project.status.${project.status}`),
      tone: project.status === 'cancelled' ? ('warning' as const) : ('tint' as const),
    },
  };
}

/** Budget, actual and remaining; the actual and remaining only when the ledger could be read. */
export function budgetStats(project: ProjectDetail, currency: string, tr: Translator): Stat[] {
  // Whole amounts, as on the mock: three figures share one row on a phone.
  const money = (value: number) => formatMoney(value, currency, 0);
  const stats: Stat[] = [{ label: tr.t('project.overview.budget'), value: money(project.budget) }];
  if (project.actual !== null) {
    stats.push(
      { label: tr.t('project.overview.actual'), value: money(project.actual) },
      { label: tr.t('project.overview.remaining'), value: money(project.budget - project.actual) },
    );
  }
  return stats;
}

/** "Prepare planting beds" / "12 Oct · Salim". */
export function taskCard(task: ProjectTask, language: Language, tr: Translator): TextCard {
  return {
    title: task.subject,
    message: tr.t('project.overview.taskDetail', {
      due: task.due ? formatDayMonth(task.due, language) : tr.t('project.overview.noDue'),
      owners: task.owners.join(', '),
    }),
  };
}

/** "Ceramic planter · POT-30" with "12 needed · 8 available", flagged when stock falls short. */
export function requirementRow(requirement: Requirement, tr: Translator) {
  return {
    label: tr.t('project.overview.requirementLine', {
      item: requirement.itemName,
      code: requirement.item,
    }),
    status: tr.t('project.overview.requirementStatus', {
      required: qty(requirement.required),
      available: qty(Math.max(requirement.available, 0)),
    }),
    short: requirement.available < requirement.required,
  };
}

export function attachmentCard(attachment: Attachment, language: Language): TextCard {
  return {
    title: attachment.name,
    message:
      attachment.size !== null && attachment.size > 0
        ? `${(attachment.size / 1_000_000).toFixed(1)} MB`
        : formatShortDate(attachment.date, language),
  };
}

/** "Sale · SI-042 · ILS 500.00" for each linked record. */
export function linkedRows(
  linked: readonly LinkedRecord[],
  currency: string,
  tr: Translator,
): TotalRow[] {
  return linked.map((record) => ({
    label: tr.t(`project.overview.kinds.${record.kind}`),
    value: [record.name, record.amount !== null ? formatMoney(record.amount, currency) : null]
      .filter(Boolean)
      .join(' · '),
  }));
}
