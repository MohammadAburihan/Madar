import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ErpnextClient } from './erpnext-client';

/**
 * Renders a self-contained HTML page to PDF on the ERPNext server (`report_to_pdf`). Madar builds its documents'
 * HTML itself: the print formats fetch their styles from the site's own host name, which a container may not reach.
 */
@Injectable({ providedIn: 'root' })
export class HtmlPdfService {
  private readonly erpnext = inject(ErpnextClient);

  render(html: string): Promise<Blob> {
    return firstValueFrom(
      this.erpnext.postForBlob('frappe.utils.print_format.report_to_pdf', {
        html,
        orientation: 'Portrait',
      }),
    );
  }
}

/** Escapes text for HTML and drops the bidi isolates the translator adds, which the PDF fonts can't draw. */
export function htmlText(text: string): string {
  return text
    .replace(/[⁦-⁩]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
