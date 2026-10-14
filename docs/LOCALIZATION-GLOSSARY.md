# Madar Arabic glossary and locale contract

Use these terms across navigation, headings, labels, errors, statuses and accessible names. Inflection may agree with the record noun; the underlying state must not change.

| English | Arabic |
| --- | --- |
| Business / active business | المنشأة / المنشأة الحالية |
| Home | الرئيسية |
| Sales | المبيعات |
| Purchases | المشتريات |
| Inventory / stock | المخزون |
| Contacts | جهات الاتصال |
| Money | الأموال |
| Projects | المشاريع |
| Settings | الإعدادات |
| Customer / supplier | العميل / المورد |
| Stock item / service | صنف مخزني / خدمة |
| Warehouse | المستودع |
| Purchase order / sales order | أمر الشراء / أمر البيع |
| Sales invoice / supplier invoice | فاتورة البيع / فاتورة المورد |
| Quotation / delivery | عرض السعر / التسليم |
| Draft / save draft | مسودة / حفظ المسودة |
| Confirmed | مؤكد |
| Posted | مرحّل |
| Recorded | مسجّل |
| Partially received / fully received | مستلم جزئياً / مستلم بالكامل |
| Paid / partially paid / unpaid | مدفوع / مدفوع جزئياً / غير مدفوع |
| Amount paid / outstanding | المبلغ المدفوع / المتبقي |
| Unresolved result | نتيجة غير محسومة |
| Check result / retry | التحقّق من النتيجة / المحاولة مجدداً |
| Site stock / consumed / returned | مخزون الموقع / المستهلك / المعاد |
| Count variance / damage | فرق الجرد / التلف |
| Required / optional | مطلوب / اختياري |
| Back / cancel / keep editing | رجوع / إلغاء / متابعة التعديل |
| Search / clear filters | بحث / مسح عوامل التصفية |
| Reports | التقارير |
| Profit / sales income / cost of goods sold / expenses | الربح / إيرادات المبيعات / تكلفة البضاعة المباعة / المصروفات |
| Money in / money out / net for the period | الأموال الواردة / الأموال الصادرة / الصافي للفترة |
| Customer statement / supplier statement | كشف حساب العميل / كشف حساب المورد |
| Opening balance / invoiced / balance | الرصيد الافتتاحي / قيمة الفواتير / الرصيد |
| Period: this month / last month / this year / custom | الفترة: هذا الشهر / الشهر الماضي / هذه السنة / مخصصة |

## Locale and direction

- Arabic UI uses Noto Sans Arabic; English uses Inter. Arabic child order, text alignment, sidebar, navigation, tables and directional controls are reversed structurally. Graphics and nondirectional icons are not flipped.
- Use Western digits0–9 consistently in both languages. Keep decimal point and comma grouping for this first-release sample (ILS3,500.00). The configured business currency determines the real currency; preview uses literal ILS and does not expose a variable token.
- Dates in entry fields use dd/MM/yyyy (11/10/2026). Read-only headings may use a localized month name. Parse dates explicitly; never infer MM/dd from browser defaults. Date picker follows locale reading order and keeps the same underlying date when language changes.
- Preserve identifiers exactly: SI-1042,SO-0187,PO-2048,PINV-0068,PAY-0156,OLV-20,POT-30,URLs,emails,barcodes and phone numbers. In implementation use isolated LTR runs/bdi for each identifier and amount embedded in Arabic text. Pencil has no lang/dir or bidi-isolation property; rendered examples and context notes specify the required behavior.
- Long sample names include مشتل ريحان للنباتات والحدائق and استشارة تنسيق الحدائق. Labels and values wrap instead of truncating required transaction information. Control heights grow beyond48px where needed.
- Language action uses the destination language endonym: العربية in English UI; English in Arabic UI. Its accessible name is localized to the current language.
- Changing language retains active business,current route,query,filters,basket,allocation,draft ID and focused control. It does not prompt for discarding changes. Business switching uses the separate scoped-draft guard.

## Scope and parity

All 132 English screen frames have Arabic counterparts; see COMPLETION-MATRIX.md. The32 Arabic reusable component/state variants cover dialogs,selectors,notifications,empty/error/loading/permission/connection/unsaved/unresolved states. Eight pairs of shared form bodies support desktop task panels. Arabic functionality is specified to match English; native clickable flows remain blocked by Pencil's transition API limitation.

