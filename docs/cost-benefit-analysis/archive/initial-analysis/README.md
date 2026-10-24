# SiteTrace cost-benefit analysis

Prepared 24 October 2026 (Asia/Manila) for IT303 Systems Analysis and Design.

## Deliverables

- `SiteTrace_Cost_Benefit_Analysis.xlsx`: ten sheets, editable assumptions, 321 evaluated/cached formulas, cross-sheet links, inventory gap chart and A4 print settings.
- `SiteTrace_Cost_Benefit_Report.docx`: academic report with 14 sections and 11 numbered tables.
- `SiteTrace_Cost_Benefit_Report.pdf`: 11-page PDF edition from the same content model.

The supplied inventory has **758 recorded units across 26 categories**, with **463 missing or unreported units across three categories**. The three gap calculations match. Missing/no-report quantities are not confirmed physical losses. Inventory exposure is unverified because replacement prices were not provided.

Financial feasibility is **Not Yet Determined**. Implementation cost, recurring cost, annual cash benefits, ROI, payback and NPV show **Insufficient Data**. The academic reference amounts of ₱178,500 and ₱20,500 are excluded.

## Complete the editable model

1. Read `Assumptions and References`. Blue cells are editable. The 3-month planning window, 8% discount rate, one-person staffing placeholders, billing conversions and full-year multipliers are conventions, not company facts.
2. Supply development rates/effort, training quantities and scoped deployment quotations. Separate sunk spend from the future investment being decided.
3. Select a treatment for every cost line: `Estimated`, `Confirmed`, `Bundled`, `Not applicable`, or `To confirm`. Numeric zero requires evidence; a blank is unknown. Bundle a separately listed service only after confirming where its cost is counted.
4. Enter baseline and pilot person-hours, staffing, reporting frequency, hourly wages, supplies and administrative cash costs. Proposed reporting frequency and wages link to the baseline. Keep tasks and expense boundaries disjoint.
5. Credit payroll savings only for a demonstrated cash reduction. Keep equipment benefit claims excluded until approved annual evidence exists. Do not repeat a historical recovery as a yearly saving. Optional inventory prices estimate exposure only.
6. Recalculate in Excel and review Financial Analysis and Executive Dashboard. Year multipliers can model changing benefit realization and recurring costs. Word/PDF are static baseline snapshots and must be revised alongside any changed financial scenario.

No application code, schema, production configuration or live business data was changed. Current source features are distinguished from confirmed deployment and measured benefits.

## Validation and reproducibility

`validation/validation-report.json` records inventory, formula, scenario, document and layout checks. `validation/source-evidence.json` contains repository revision, source anchors and SHA-256 hashes. `source/inventory-baseline.csv` preserves unknown cells as blanks. Synthetic financial fixtures exist only in temporary validation files; their amounts are not company estimates or report findings.

Formula results were evaluated with the locally installed `formulas` engine and independently checked against direct financial calculations. Cached results allow preview readers to display the delivered baseline; Excel is set to recalculate automatically on edit/open. Native desktop Excel/Word automation was unavailable (COM 80070520). The Word OOXML package was checked structurally. PDF text, A4 geometry and all pages were checked with PyMuPDF. Worksheet preview images reproduce cell geometry and a dashboard chart approximation; they are not native Excel screenshots. Print text-size estimates and manual page breaks are recorded; native Office pagination can differ.

The generator is `source/build_cba.py`; dependencies are in `source/requirements.txt`. Python 3.11 was downloaded to a task-specific temporary directory because the system Python aliases were inaccessible and only GIMP Python 2.7 was otherwise usable. Libraries were installed in that temporary runtime; application dependencies were untouched.

To reproduce the **original supplied-data baseline**, run `python source/build_cba.py` from this directory using Python 3.11 with the listed libraries. This rebuilds the baseline files and does not preserve later workbook edits. Back up edited scenarios before rebuilding. The source register expects the original four image attachments at their supplied local paths; their hashes record provenance without copying private images into the deliverable directory.
