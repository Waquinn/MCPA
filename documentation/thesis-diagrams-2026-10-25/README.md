# MCPA / SiteTrace thesis diagrams

These diagrams describe the checked-out `integration/quantity-custody-v2` implementation, including existing working-tree updates, reviewed on 25 October 2026 (Asia/Manila). The attached PDFs and DFD screenshots were used as visual references, not as a specification of current behavior.

| Requested deliverable | Editable file | PDF | Paper and pages |
|---|---|---|---|
| Complete system flowchart | [Draw.io](MCPA_System_Flowchart.drawio) | [PDF](MCPA_System_Flowchart.pdf) | **13 long-bond pages total: landscape main menu, 12 portrait workflows** |
| DFD Level 0 | [Draw.io](MCPA_DFD_Level_0.drawio) | [PDF](MCPA_DFD_Level_0.pdf) | 1 sheet; 20 × 15 inches |
| DFD Level 1 | [Draw.io](MCPA_DFD_Level_1.drawio) | [PDF](MCPA_DFD_Level_1.pdf) | 1 sheet; 25 × 31.25 inches |

The DFDs use larger sheets to keep all labeled flows readable without splitting the logical diagram. Zoom or print at the PDF's actual size. The flowchart uses Arial, approximately 10.5-point body text, with smaller annotations. All symbols, labels and arrows are native editable Draw.io objects; the PDFs retain selectable vector text.

Open each `.drawio` in diagrams.net / Draw.io. Its page setup is already stored in the document. When printing the flowchart, select custom **8.5 × 13-inch** paper and actual size. Do not substitute US Legal, which is 8.5 × 14 inches.

Numbered circles occur as one matching entry/exit pair on the same flowchart page. They are used for retries and jumps that would otherwise require a reverse or crossing arrow. Normal completion paths descend into a module-completion oval.

Lettered pentagons identify exact cross-page destinations. **A-L** link the main menu to pages **2-13** respectively; each pentagon prints `TO Pxx` or `FROM Pxx`. **X** continues approved named-asset requests from page 5 to release on page 7; **Y** continues approved quantity allocations from page 6 to page 7. Each code has exactly one departure and matching arrival. The generic `W` references have been removed. Related roles share a workflow rather than receiving separate copies of the complete system flowchart.

The DFDs use the reference's plain black-and-white symbols, uppercase flow labels, rectangular entities, small rounded processes, and two-line data stores. Only the diagram title, symbols and data-flow labels are printed. The flowchart also omits background notes, legends and explanatory paragraphs.

The DFDs place hosted Auth, RPC / Edge-function services, database and private file storage inside the MCPA system boundary. As requested, both DFDs show exactly two external entities: **Admin** and **Engineers/Architects**. Engineer and Architect are combined; Admin-only maintenance, review, procurement, issuance and purchase flows retain their existing permissions. This diagram scope does not change the implementation's other roles or the system flowchart.

The [source analysis](SOURCE_ANALYSIS.md) explains coverage, implementation limits and the mapping to source files. The `validation` folder contains page previews, a flowchart contact sheet, source hashes and machine-readable checks. Generation scripts are isolated in `source`; they do not invoke application services or apply SQL.

Validation checks the actual PDFs, not just editable settings: page count, physical size, searchable text, text containment / overlap and source preservation. `validation/professional-flow-audit.json` additionally checks every rendered arrow for orthogonal down/right direction, decision entry / exit ports, Yes/No branches, paired on-page circles and reciprocal cross-page references. All application, migration and environment files in the starting baseline remain unchanged.
