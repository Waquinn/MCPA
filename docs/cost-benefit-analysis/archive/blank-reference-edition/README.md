# SiteTrace cost-benefit worksheets — reference recreation

This version follows the user's corrected instructions. **Only the green “HAND TOOLS AND OTHERS MONITORING” image supplies company data. All application records are demonstration data. All missing financial amounts remain blank.**

## Files

- `SiteTrace_Cost_Benefit_Worksheets.pptx`: editable PowerPoint text and vector shapes; three reference views plus the green company inventory appendix.
- `SiteTrace_Cost_Benefit_Analysis.xlsx`: editable Excel worksheets with blank financial inputs and 63 guarded formulas.
- `SiteTrace_Cost_Benefit_Report.docx`: editable Word text boxes and vector borders using the same fixed page layout.
- `SiteTrace_Cost_Benefit_Report.pdf`: four A4 pages generated from the same layout.
- `recreated-views/`: clean high-resolution PNG copies of the three recreated views and the green inventory appendix.

## How the photos were recreated

1. **Photo 1:** the full, bordered cost worksheet, with development/training/hardware tables on the left and one-time summary/recurring costs on the right.
2. **Photo 2:** the repeated lower part of the same worksheet, followed by its explanatory paragraph. In Excel these repeated monetary cells link to the first sheet instead of becoming duplicate inputs.
3. **Photo 3:** side-by-side Existing System and Proposed System supplies and labour tables, with the original-style pale blue reduction bands and a paragraph underneath.
4. **Appendix:** the actual green inventory table, including all 26 populated categories and the original blank row 27.

Monitor borders, browser controls, perspective distortion and the Windows taskbar are excluded from the clean document recreation. Maroon chapter bands, plain borders, grey headings, narrow type, two-column layouts and blue result bands follow the reference photographs. Worksheet labels are generic categories, not assertions about actual company employees or purchases. Cashier/CIO examples were replaced with unquantified inventory-related personnel groups. The hardware header uses “Unit Cost” to match its calculation. No financial example amount, three-month duration, training-day quantity, employee count or discount rate from another project is copied.

## Company data

The green table contains 26 populated categories and 758 recorded units. Three categories have 463 missing or unreported units: 19 round shovels, 75 GI pipes and 369 swivel clamps. Each gap equals its supplied requirement minus its recorded quantity. Blank requirements and gaps stay blank. The source spelling “CATWALK FLATFORM SCAFFOLDING” is preserved. Missing/no-report units are reconciliation gaps, not confirmed physical losses or monetary losses.

## Excel editing

The first three sheets reproduce the reference views. `Company Inventory` contains the supplied data. `Input Details` holds the unknown training-day and hardware/software quantities required by the formulas. Every financial input has an editable-cell comment and numeric validation. It is intentionally white to preserve the reference appearance.

- Enter documented rates, durations, quantities and monthly labour totals only when available.
- Training Kit is a total materials charge; no kit count is assumed.
- Hardware subtotals require a unit cost on the cost sheet and quantity on Input Details.
- Monthly labour fields represent the combined monthly cost of each named personnel group; no employee count is assumed. Annualization multiplies by 12 as a unit conversion.
- Maintenance and communication rates are monthly and license renewal is annual, following the reference's billing units; these are not claims about an actual subscription.
- All subtotals, totals, differences and repeated-view values remain blank until their necessary inputs are numeric. A documented zero is supported and is distinct from an unknown blank.
- Payroll reduction cannot be inferred from faster reporting. No headcount reduction, equipment price, loss recovery or annual saving is assumed.

PowerPoint, Word and PDF are static blank versions of the worksheets. They do not live-link to later Excel edits. Their text and borders can be edited in PowerPoint/Word; update those editions alongside a completed Excel scenario.

## Validation and previous version

`validation/validation-report.json` records quantity checks, missing-input guards, all formula results, cross-sheet references, isolated arithmetic checks, XML package integrity, editable document content, page geometry and source exclusions. `validation/company-data-source.json` contains only the four supplied image sources and hashes. No application dataset or repository documentation is a company-data source.

All pages are inspected through the PDF and common vector layout. Native Office automation was unavailable in this Windows session (COM 80070520); the editable Office packages are checked structurally. Word/PowerPoint use native vector shapes and editable text, not pasted page screenshots. Minor native font/pagination differences may occur. Excel uses an A4 portrait grid fitted to one printed page per sheet.

The superseded initial analysis is retained in `archive/initial-analysis/`. It is not an input to this recreation. No application source code, database schema or production configuration was modified.

Rebuild with Python 3.11 and `source/requirements.txt` by running `python source/build_reference_recreation.py`. This restores the requested blank baseline; back up any later workbook edits first. The original four attachments are expected at their supplied Downloads paths only for provenance hashing.
