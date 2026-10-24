# SiteTrace cost-benefit worksheets — populated planning estimates

The current files fill the financial tables with user-authorized, realistic **planning estimates**. They are not actual company salaries, expenses, quotations or measured benefits. Company data still comes only from the green inventory image: **26 categories, 758 recorded units and 463 missing or unreported units**. No system demonstration records are used.

## Current files

- `SiteTrace_Cost_Benefit_Report.pdf`: five A4 pages, with the three reference-style worksheet views, the green company inventory, and the planning basis/sources.
- `SiteTrace_Cost_Benefit_Report.docx`: the same five pages as editable Word text and vector shapes.
- `SiteTrace_Cost_Benefit_Worksheets.pptx`: five editable portrait PowerPoint slides.
- `SiteTrace_Cost_Benefit_Analysis.xlsx`: five editable, printable worksheets with cached calculated figures and automatic recalculation.
- `recreated-views/`: high-resolution images of all five pages.

## Estimated figures

| Item | PHP |
|---|---:|
| Part-time development services | 107,000.00 |
| Two-day training and materials | 4,000.00 |
| Deployment setup and backup drive | 3,500.00 |
| **One-time investment** | **114,500.00** |
| **Annual recurring cost** | **31,800.00** |
| Existing annual supplies | 7,500.00 |
| Proposed annual supplies | 2,810.00 |
| **Potential annual supplies cash saving** | **4,690.00** |
| Released staff capacity value | 75,600.00 |
| **Annual tangible operational value** | **80,290.00** |
| Operational value less recurring cost (includes noncash capacity) | 48,490.00 |
| **Cash impact from supplies saving less recurring cost** | **−27,110.00** |

The labor comparison values time allocated to inventory work; it does **not** assume salary cuts, layoffs or lower headcount. Estimated task time falls from 80 to 38 person-hours per month at PHP 150/hour, releasing 504 hours/year. Staff can use that capacity for other work. Only supplies spending is counted as a potential cash saving, so the system still needs an estimated PHP 27,110/year cash operating allocation before any separate proven payroll or equipment saving. The initial investment is additional.

## Why the estimates are plausible

- Development is a three-month, part-time project allowance: analyst PHP 10,000/month for 3 months; programmer PHP 20,000/month for 3 months; encoding PHP 5,000 for 1 month; research/QA PHP 6,000/month for 2 months. These are capped part-time service retainers, not full-time employee salaries. Full small-system build/implementation scope is costed; exclude already-incurred development before using the workbook for a remaining-work purchase decision.
- Training is two trainer days at PHP 1,500/day plus PHP 1,000 materials. The scenario assumes attendance during normal paid hours; separately paid overtime would require an added allowance.
- One-time production setup is PHP 1,000, independent offline backup drive allowance is PHP 2,500, and open-source/SSL license fees are zero. No unnecessary physical database server is purchased.
- Hosted backend is budgeted at Supabase Pro's published USD 25/month starting level, converted at a rounded planning PHP 65/USD: PHP 1,625/month. Usage is assumed to stay inside the included plan limits. Database storage and bundled daily database backups are not charged again. This is not a claim about an existing company subscription.
- Static frontend hosting uses Cloudflare Pages Free within its published limits. Maintenance is PHP 750/month; incremental communication PHP 200/month; domain allowance PHP 900/year. Free frontend hosting, SSL and open-source licenses explicitly show 0.00. Domain and hardware allowances are estimates, not vendor quotations. Confirm actual bank conversion, taxes, usage and any overage charges before buying.
- Annual paper, stationery and ink quantities are modest planning allowances. USB quantity is zero because cloud reports and the separately budgeted backup drive cover this scenario. Prices and task-time reductions are assumptions, not findings from the green inventory.
- NWPC wage information is a general Philippine costing benchmark only. It is not company payroll evidence or a legal wage-compliance assessment. No equipment recovery, theft prevention, reduced loss or avoided procurement is monetized. The 463-unit reporting gap is not a confirmed financial loss.

## Sources checked 24 October 2026

- [Supabase pricing](https://supabase.com/pricing): Pro starts at USD 25/month, with published quotas and database-backup retention.
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/): Free static hosting subject to limits.
- [Cloudflare Registrar](https://www.cloudflare.com/domains/): domain pricing model and included DNS/SSL; the PHP 900 domain allowance is an estimate.
- [NWPC NCR](https://nwpc.dole.gov.ph/ncr/): general local wage context; project retainers and PHP 150/hour valuation are analyst estimates.
- [BSP exchange-rate statistics](https://www.bsp.gov.ph/SitePages/Statistics/exchangerate.aspx): official reference resource; PHP 65/USD is the model's rounded planning rate.

## Editing and verification

All financial input cells now have numbers; genuine free/bundled items are 0.00. Supply descriptions specify bundles, boxes, reams, packs, pieces, pads or bottles so each unit price is clear. Replace these estimates with actual company rates when available. The Input Details sheet controls training duration, hardware quantities, hosting FX and six monthly activity-hour assumptions. Labor allocations and hosted-backend PHP cost calculate from those inputs. Duplicate cost-view cells link to the first worksheet, rather than creating another charge. Excel formula guards continue to display blank if an essential estimate is deleted. Narrative paragraphs describe the saved baseline and should be refreshed when a scenario is changed; calculated value cells recalculate automatically.

The green inventory remains separate. A dash means not reported, not zero. No quantities or shortages were invented for the other categories. The unused source row 27 is omitted. The original source spelling “CATWALK FLATFORM SCAFFOLDING” is retained.

`validation/validation-report.json` records independent total checks, complete financial cells, formula caches, cloud-service cost boundaries, green-data preservation, missing-input protection, consistent figures in all formats, XML package integrity and A4 layout checks. The Word/PowerPoint editions use editable text/vector shapes, not pasted screenshots. Native Office automation was unavailable (COM 80070520); PDF and common scene geometry were checked. Minor native Office differences may occur.

`archive/blank-reference-edition/` preserves the previous blank version. `archive/initial-analysis/` is an older, superseded analysis. Open the current files in this directory to see the completed estimates. Application source, database schemas and production settings remain untouched.

Rebuild this populated scenario with Python 3.11 and `source/requirements.txt`: `python source/build_estimated_cba.py`. It uses `build_reference_recreation.py` for the reference-style layout and `build_estimated_cba.py` for the explicit input estimates. Rebuilding restores this planning scenario, so back up later workbook edits. Word/PowerPoint/PDF are static snapshots; refresh those editions alongside any revised Excel figures.
