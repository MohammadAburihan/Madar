# Madar accessibility audit

Design audit dated 11 October 2026. Target: [WCAG 2.2](https://www.w3.org/TR/WCAG22/) AA. This is a design review, not a claim of application conformance.

## Checks performed

- Inspected the repository: design-only; no runnable application.
- Audited all 254 screen frames through Pencil's resolved node tree. All 127 English screens have Arabic counterparts and visible language controls.
- Parsed 2238 control route specifications. Every static destination resolves to an existing screen; return placeholders require the origin stack. No invalid destination IDs remained.
- Checked enabled-node bounds with a 1 px tolerance for floating-point rounding: **0 material overflows**. Disabled descendants were excluded.
- Checked annotated interactive frame dimensions: **0 below 48 × 48 px** after corrections. The requested iOS44 pt/Android48 dp mappings remain implementation requirements; canvas pixels do not prove native platform sizing.
- Computed WCAG relative luminance for every solid text/background pair present in resolved screen layers. Minimum **5.16:1**; all audited text pairs exceed4.5:1. This excludes hypothetical runtime, alpha compositing and images not represented by the checked text surfaces.
- Changed functional input boundaries from #D8E1DD (1.33:1 on white) to #78918B (3.38:1 white;3.12:1 warm background). Teal focus and icons contrast above3:1 on their surfaces. Decorative dividers retain the approved light tone.
- Statuses include visible wording, not color alone. Selected navigation also has bold text and an implementation current-page requirement.
- Added persistent search labels, required markers on task fields, optional wording, actionable validation summary, and explicit focus/role/name notes.
- Inspected representative English/Arabic mobile,320 px,desktop workspace,desktop task,service/project forms,full receipt and component screenshots. Workers and independent reviewer inspected the expanded modules; root rechecked the final search fields and desktop forms.

## Text contrast evidence

| Foreground | Background | Text nodes | Ratio |
| --- | --- | ---: | ---: |
| #182E2B | #F7F6F2 | 748 | 13.26:1 |
| #0B5C56 | #F7F6F2 | 616 | 7.25:1 |
| #0B5C56 | #FFFFFF | 838 | 7.84:1 |
| #526763 | #F7F6F2 | 676 | 5.58:1 |
| #182E2B | #FFFFFF | 1140 | 14.34:1 |
| #FFFFFF | #0B5C56 | 258 | 7.84:1 |
| #0B5C56 | #E4F0EB | 392 | 6.7:1 |
| #182E2B | #E4F0EB | 266 | 12.27:1 |
| #526763 | #FFFFFF | 498 | 6.04:1 |
| #865400 | #FFF1D6 | 52 | 5.73:1 |
| #182E2B | #FFF1D6 | 18 | 12.84:1 |
| #A13030 | #F7F6F2 | 2 | 6.51:1 |
| #865400 | #FFFFFF | 10 | 6.4:1 |
| #526763 | #E4F0EB | 38 | 5.16:1 |
| #A13030 | #FFFFFF | 2 | 7.04:1 |
| #526763 | #FFF1D6 | 4 | 5.41:1 |

## Implementation-ready requirements

1. Keyboard: logical DOM order follows reading order; RTL rows reverse without positive tabindex. Enter/Space activates buttons. All lists/table records, selectors and stepper actions remain keyboard reachable. Provide skip-to-content and no focus hidden under chrome.
2. Focus:3 px teal ring with2 px white separation; focus visible and unobscured. Dialog initial focus lands on title/safe action, traps while modal, Escape cancels, then returns to opener. Review/success moves focus to heading; validation moves focus to error summary and links to invalid controls.
3. Semantics: native inputs/buttons/links; persistent programmatic labels; required/invalid/described-by; current-page navigation; named dialogs; status announcements polite, blocking errors alert. Decorative icons hidden. Quantity exposes value/min/max and named increment/decrement controls.
4. Input: preserve input across selectors, Back, review, failed connection, session recovery and language switches. Allow password managers, paste and accessible authentication. Store drafts by business+user+document type; never move transactions across businesses.
5. Alternatives: manual barcode search beside scanning; text actions beside icon-only/gesture actions; no drag-only interaction. Attachment is optional. Real auth/camera/upload/share are clearly identified stubs in this design.
6. Reflow: test200% text enlargement and400% zoom/320 CSS px. Grow fields/buttons rather than clipping labels. Desktop task panel becomes a full-page task at narrow widths. Avoid page-level horizontal scrolling except genuinely two-dimensional data.
7. Locale: lang/dir, Arabic accessible labels, LTR isolation for record IDs/amounts/phones/URLs/emails. Do not mirror logos/nondirectional icons. Use localized reading order, dates and numeral policy in LOCALIZATION-GLOSSARY.md.
8. Motion: no required animation. Honor reduced motion with immediate changes; never communicate status only through animation.

## Runtime verification

| Check | Result |
| --- | --- |
| axe / browser accessibility tree | not run—requires runnable application |
| Keyboard traversal / focus trap / focus return | not run—requires runnable application |
|200% text /400% zoom / reflow | not run—requires runnable application |
| Screen-reader announcements / accessible names | not run—requires runnable application |
| RTL DOM order / bidi isolation | not run—requires runnable application |
| VoiceOver / TalkBack | not run—requires runnable application |
| Reduced motion preference | not run—requires runnable application |

Pencil does not expose native focus, accessibility roles or screen transitions. These are explicit handoff notes; visual presence is not runtime proof. Implement the application, then run the checks above on the real build before release.

