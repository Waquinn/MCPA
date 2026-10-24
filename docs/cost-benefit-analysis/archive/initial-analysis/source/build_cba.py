"""Build the evidence-based SiteTrace CBA. Application files are read only.

Python 3.11; openpyxl, python-docx, reportlab, Pillow, formulas, PyMuPDF.
The workbook is the editable model; the report is a dated snapshot.
"""
from pathlib import Path
import csv, hashlib, json, math, re, shutil, subprocess, zipfile
from datetime import datetime, timezone
from xml.etree import ElementTree as ET
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.comments import Comment
from openpyxl.workbook.properties import CalcProperties
from openpyxl.worksheet.pagebreak import Break

OUT = Path(__file__).resolve().parents[1]
ROOT = OUT.parents[1]
VAL = OUT / 'validation'
DATE = '24 October 2026'
UNKNOWN = 'Insufficient Data'
NAVY, GOLD, TEAL = '18364E', 'B38A35', '146B69'
PALE, BLUE, GRAY, AMBER = 'EDF3F6', 'E5F1FF', '627080', 'FFF0CC'
MONEY = '"₱"#,##0.00;[Red]("₱"#,##0.00);"₱"0.00'
NUM = '#,##0.00;[Red](#,##0.00);0.00'
INT = '#,##0'
SHEETS = ['Inventory Baseline','One-Time Development Cost','Recurring Costs',
          'Existing System Operating Costs','Proposed System Operating Costs',
          'Tangible Benefits Worksheet','Intangible Benefits','Financial Analysis',
          'Assumptions and References','Executive Dashboard']
INV = [
 ('Shovel (Pala, Lapad)',19,None,None),('Shovel (Pala, Bilog)',23,42,19),
 ('Bareta',13,None,None),('Itak',4,None,None),('Piko',4,None,None),
 ('Plastic Drum 200L',14,None,None),('IBC Water Tank 1000L',5,None,None),
 ('Wheel Barrow',4,None,None),('Oxygen Tank',3,None,None),('Gas Tank',5,None,None),
 ('Electric Kettle',2,None,None),('Extension',10,None,None),
 ('Double Burner Stove',8,None,None),('Lababo',5,None,None),('Maso',4,None,None),
 ('Garden Hose',5,None,None),('GI Pipes',225,300,75),('Base Jack',27,None,None),
 ('U-Jack',56,None,None),('Buckets',39,None,None),
 ('Catwalk Platform Scaffolding',33,None,None),('H-Frame Scaffolding',64,None,None),
 ('Braces Scaffolding',41,None,None),('Water Pump',2,None,None),
 ('Garden Sprinkler',2,None,None),('Swivel Clamp',141,510,369)]
TOTAL = sum(r[1] for r in INV)
GAP = sum(r[3] or 0 for r in INV)
assert len(INV) == 26 and GAP == 463

EVIDENCE = [
 ('R1','Supplied inventory image','HAND TOOLS AND OTHERS MONITORING; undated; 26 populated rows. Blank row 27 excluded.',None,None),
 ('R2','User-supplied transcription','Pasted text.txt; supplied quantities cross-checked against R1.',None,None),
 ('R3','Academic reference images','IT303 Systems Analysis and Design, Unit 2; visible printed page 105 and subsequent benefits worksheet / viewer pages 58–59. Layout only; full bibliographic details not supplied.',None,None),
 ('R4','Asset masterlist','Registration, quantity, site, holder and condition/status views.', '1-admin/modules/masterlist/masterlist.js','current_holder_id'),
 ('R5','Authenticated movement client','Requests, release, transfer receipt, returns, repairs and recovery actions.', 'js/movement-cloud.js',"['receiveTransfer', 'completeRepair', 'recoverMissing']"),
 ('R6','Movement interface','Whole asset records; per-tool receipt inspection and follow-up cases.', 'js/movement-ui.js','(whole record)'),
 ('R7','Reports implementation','Current inventory, prospective snapshots, movement reports and PDF export.', '1-admin/modules/reports/reports.js','SiteTracePDF.download'),
 ('R8','Monitoring backend','Prospective weekly snapshot functions; scheduler remains external.', 'supabase/migrations/202610100006_monitoring.sql','Service role/scheduler only'),
 ('R9','Permissions and identity','Role routes/actions; authenticated Supabase sessions.', 'js/permissions.js','Database policies remain authoritative'),
 ('R10','Accountability verification','Server reservation verification and availability checks; migration presence does not prove deployment.', 'supabase/migrations/202610200001_verified_request_inventory.sql','inventory_lock'),
 ('R11','Activity log export','Saved movement history with PDF export.', 'js/movement-overview.js','Export activity logs as PDF'),
 ('R12','Product operating context','Weekly Monday 16:00 monitoring requirement. Planning prose can be stale; code takes precedence.', 'PRODUCT.md','Weekly monitoring reports'),
 ('R13','Current materials scope','Consumables have separate quantities, receipts and stock history; illustrative seeds excluded.', 'documentation/consumables-upgrade-2026-10-22/REPORT.md','stock movements'),
 ('R14','Purchase ledger scope','Ledger/reference evidence and private receipt files; no evidence of avoided procurement.', '1-admin/modules/purchases/purchases.js',''),
 ('R15','Authentication source','Actual sign-in/session controls supersede older prototype-only descriptions.', 'js/auth.js','Supabase owns credentials')]

def ref(sheet, cell): return "'%s'!%s" % (sheet, cell)
def guarded_sum(cells):
    return '=IF(COUNT(%s)=%d,SUM(%s),"%s")' % (','.join(cells),len(cells),','.join(cells),UNKNOWN)
def difference(a,b): return '=IF(COUNT(%s,%s)=2,%s-%s,"%s")' % (a,b,a,b,UNKNOWN)

wb = Workbook()
wb.remove(wb.active)
wb.calculation = CalcProperties(calcId=191029,fullCalcOnLoad=True,forceFullCalc=True,calcMode='auto')
wb.properties.creator = 'SiteTrace Academic Documentation'
wb.properties.title = 'SiteTrace Cost-Benefit Analysis'
wb.properties.subject = 'IT303; source-based inventory and conditional financial appraisal'
wb.properties.created = datetime(2026,10,24,0,0,0)
INPUTS = []

def sheet(name,widths,last,landscape=True):
    ws=wb.create_sheet(name)
    ws.sheet_view.showGridLines=False
    for i,w in enumerate(widths,1): ws.column_dimensions[chr(64+i)].width=w
    ws.sheet_properties.pageSetUpPr.fitToPage=True
    ws.page_setup.paperSize=ws.PAPERSIZE_A4
    ws.page_setup.orientation='landscape' if landscape else 'portrait'
    ws.page_setup.fitToWidth=1; ws.page_setup.fitToHeight=0
    ws.page_margins.left=.28;ws.page_margins.right=.28
    ws.page_margins.top=.42;ws.page_margins.bottom=.42
    ws.print_options.horizontalCentered=True
    ws.print_area=f'A1:{chr(64+len(widths))}{last}'
    ws.print_title_rows='1:4'
    ws.freeze_panes='C7'
    ws.oddHeader.center.text='SiteTrace | IT303 Cost-Benefit Analysis'
    ws.oddHeader.center.size=8
    ws.oddFooter.left.text=DATE+' | Financial inputs unverified'
    ws.oddFooter.left.size=8
    ws.oddFooter.right.text='Page &P of &N'
    ws.sheet_properties.tabColor=NAVY
    return ws

def merge(ws,row,start,end,text,fill=None,size=10,bold=False,color='18202A',height=None):
    ws.merge_cells(start_row=row,start_column=start,end_row=row,end_column=end)
    c=ws.cell(row,start,text);c.font=Font(name='Calibri',size=size,bold=bold,color=color)
    c.alignment=Alignment(vertical='center',wrap_text=True)
    if fill:
        for col in range(start,end+1): ws.cell(row,col).fill=PatternFill('solid',fgColor=fill)
    if height:ws.row_dimensions[row].height=height

def title(ws,text,n,subtitle):
    merge(ws,1,1,n,text,NAVY,17,True,'FFFFFF',34)
    merge(ws,2,1,n,subtitle,None,10,False,GRAY,32)
    merge(ws,3,1,n,'Blue cells: editable inputs | Gray: supplied data / fixed scope | Green text: formulas | Blank: unknown, never a verified zero',PALE,9,False,GRAY,23)

def section(ws,row,text,n):merge(ws,row,1,n,text,NAVY,11,True,'FFFFFF',25)
def note(ws,row,text,n,height=34):merge(ws,row,1,n,text,AMBER,10,False,'6A4D16',height)
def header(ws,row,labels):
    for i,v in enumerate(labels,1):
        c=ws.cell(row,i,v);c.fill=PatternFill('solid',fgColor=NAVY);c.font=Font(name='Calibri',size=10,color='FFFFFF',bold=True)
        c.alignment=Alignment(wrap_text=True,vertical='center')
    ws.row_dimensions[row].height=32

def cell(ws,row,col,value=None,kind='fixed',fmt=None):
    c=ws.cell(row,col,value)
    c.font=Font(name='Calibri',size=10,color=TEAL if kind=='formula' else ('165CA0' if kind=='input' else '18202A'))
    c.fill=PatternFill('solid',fgColor=BLUE if kind=='input' else ('F5F7F8' if kind=='fixed' else 'FFFFFF'))
    c.border=Border(bottom=Side(style='hair',color='CBD4DA'))
    c.alignment=Alignment(vertical='center',wrap_text=True)
    if fmt:c.number_format=fmt
    if kind=='input':
        INPUTS.append([ws.title,c.coordinate])
        c.comment=Comment('Editable planning input. Supply a measured value, approved estimate or supplier quotation. Blank means unknown; enter 0 only when supported.','SiteTrace CBA')
    return c

def dropdown(ws,area,values):
    v=DataValidation(type='list',formula1='"'+','.join(values)+'"',allow_blank=False)
    v.errorTitle='Choose a listed treatment';v.error='Use a value from the list.';v.showErrorMessage=True;v.errorStyle='stop'
    ws.add_data_validation(v);v.add(area)

def numeric(ws,area,percent=False):
    v=DataValidation(type='decimal',operator='between',formula1=0,formula2=1 if percent else 1000000000,allow_blank=True)
    v.showErrorMessage=True;v.error='Enter a non-negative number'+(' between 0 and 1.' if percent else '.');v.errorStyle='stop'
    ws.add_data_validation(v);v.add(area)

def total(ws,row,label,formula,n=7,col=5,fmt=MONEY):
    merge(ws,row,1,col-1,label,PALE,11,True,height=28)
    cell(ws,row,col,formula,'formula',fmt).font=Font(name='Calibri',size=11,bold=True,color=TEAL)
    if col<n:merge(ws,row,col+1,n,'',PALE)

def build_inventory():
    ws=sheet(SHEETS[0],[4,29,10.5,10,10,10,13,12,15,24,22,8],48)
    title(ws,'INVENTORY BASELINE',12,'Actual quantities from the supplied, undated monitoring worksheet. Unit prices have not been supplied.')
    note(ws,4,'463 units are unreconciled / missing or without reports. This is not evidence that 463 units were physically lost, stolen or recoverable.',12,27)
    header(ws,6,['No.','Equipment description','Recorded qty.','Need to comply','Missing / no report','Calculated gap','Gap validation','Est. unit price (₱)','Potential exposure (₱)','Reconciliation indicator','Price source / date','Source'])
    for r,(name,qty,req,gap) in enumerate(INV,7):
        vals=[r-6,name,qty,req,gap,f'=IF(ISNUMBER(D{r}),MAX(D{r}-C{r},0),"")',
              f'=IF(D{r}="","Not supplied",IF(E{r}="","No reported gap",IF(F{r}=E{r},"Match","Mismatch")))',None,
              f'=IF(OR(E{r}="",H{r}=""),"Unverified",E{r}*H{r})',
              f'=IF(E{r}="","Gap information not supplied",IF(E{r}>0,"Physical / record check required","Reported zero; verify"))',None,'R1/R2']
        for c,v in enumerate(vals,1):cell(ws,r,c,v,'input' if c in [8,11] else ('formula' if isinstance(v,str) and v.startswith('=') else 'fixed'),MONEY if c in [8,9] else (INT if c in [3,4,5,6] else None))
        ws.row_dimensions[r].height=33
    header(ws,34,['','TOTAL / PROVIDED CELLS ONLY','','','','','','','','',''])
    for c in [3,4,5]:cell(ws,34,c,f'=SUM({chr(64+c)}7:{chr(64+c)}32)','formula',INT)
    cell(ws,34,9,'=IF(COUNT(I7:I32)=COUNT(E7:E32),SUM(I7:I32),"Unverified")','formula',MONEY)
    note(ws,35,'Need-to-comply total covers only 3 categories (852 units); it is not an all-inventory requirement. Reported gaps cover only those 3 categories. Prices value exposure only; they do not create annual benefits.',12,32)
    header(ws,38,['','FLAGGED CATEGORIES','Recorded','Requirement','Reported gap','Gap share','','','Exposure (₱)','','',''])
    for r,source in zip(range(39,42),[8,23,32]):
        cell(ws,r,2,f'=B{source}','formula')
        for c in [3,4,5,9]:cell(ws,r,c,f'={chr(64+c)}{source}','formula',MONEY if c==9 else INT)
        cell(ws,r,6,f'=E{source}/$E$34','formula','0.0%');ws.row_dimensions[r].height=28
    note(ws,43,'Reconciliation method: confirm description and unit; count at each site; inspect issue/return/transfer records; identify the holder; classify unresolved, found, in transit or confirmed loss; approve corrections with evidence.',12,37)
    note(ws,45,'Do not add the 463 gaps to recorded stock as a confirmed company total. Different equipment units are counted as recorded units, not equivalent economic assets. Blank cells remain unknown.',12,32)
    ws.auto_filter.ref='A6:L32';ws.print_title_rows='1:6'
    ws.row_breaks.append(Break(id=35))
    numeric(ws,'H7:H32')
    ws.conditional_formatting.add('E7:E32',CellIsRule(operator='greaterThan',formula=['0'],fill=PatternFill('solid',fgColor=AMBER)))

TREATMENTS=['To confirm','Estimated','Confirmed','Bundled','Not applicable']
def cost_formula(row):
    return f'=IF(OR(F{row}="Bundled",F{row}="Not applicable"),0,IF(AND(OR(F{row}="Estimated",F{row}="Confirmed"),COUNT(B{row}:C{row})=2),B{row}*C{row},"{UNKNOWN}"))'

def build_costs():
    ws=sheet(SHEETS[1],[34,15,13,14,20,17,43],39)
    title(ws,'BREAKDOWN OF ONE TIME COST WORKSHEET',7,'Rates and effort are unverified. Full development valuation; distinguish already incurred cost from remaining work before investment approval.')
    merge(ws,4,1,7,'="Planning duration (calendar months): "&'+ref(SHEETS[8],'B8')+'&". Enter actual allocated person-months below; calendar duration does not determine effort."',PALE,10,height=28)
    ws['A4'].font=Font(name='Calibri',size=10,color=TEAL)
    section(ws,5,'A. DEVELOPMENT COST',7)
    header(ws,6,['Description','Rate (₱ / unit)','Effort / quantity','Unit','Subtotal (₱)','Treatment','Basis / scope'])
    roles=['System Analyst','System Developer / Programmer','Database Development','System Testing and Quality Assurance','Documentation and Implementation']
    for r,name in enumerate(roles,7):
        for c,v in enumerate([name,None,None,'person-month',cost_formula(r),'To confirm','Enter allocated person-months; roles may overlap. Do not charge full monthly effort twice.'],1):
            cell(ws,r,c,v,'formula' if c==5 else ('input' if c in [2,3,6,7] else 'fixed'),MONEY if c in [2,5] else NUM if c==3 else None)
        ws.row_dimensions[r].height=36
    total(ws,12,'Total development cost',guarded_sum([f'E{r}' for r in range(7,12)]))
    section(ws,14,'B. USER TRAINING',7)
    header(ws,15,['Description','Rate (₱ / unit)','Quantity','Unit','Subtotal (₱)','Treatment','Basis / scope'])
    for r,(name,unit) in enumerate([('Training preparation','hour'),('User orientation','hour'),('Training materials','kit'),('Training sessions','session')],16):
        for c,v in enumerate([name,None,None,unit,cost_formula(r),'To confirm','Separate preparation, orientation and session delivery. Include participant paid time once if incremental.'],1):cell(ws,r,c,v,'formula' if c==5 else ('input' if c in [2,3,6,7] else 'fixed'),MONEY if c in [2,5] else None)
        ws.row_dimensions[r].height=35
    total(ws,20,'Total training cost',guarded_sum([f'E{r}' for r in range(16,20)]))
    section(ws,22,'C. ADDITIONAL HARDWARE / SOFTWARE',7)
    header(ws,23,['Description','One-time rate (₱)','Quantity','Unit','Subtotal (₱)','Treatment','Basis / scope'])
    hardware=['Hosting / deployment setup','Separate database setup','Backup storage setup','Domain / SSL setup','Additional hardware','Other necessary licenses']
    for r,name in enumerate(hardware,24):
        for c,v in enumerate([name,None,1,'setup / item',cost_formula(r),'To confirm','Check existing capacity, provider bundles and open-source license terms before adding a charge.'],1):cell(ws,r,c,v,'formula' if c==5 else ('input' if c in [2,3,6,7] else 'fixed'),MONEY if c in [2,5] else None)
        ws.row_dimensions[r].height=35
    total(ws,30,'Total hardware / software cost',guarded_sum([f'E{r}' for r in range(24,30)]))
    total(ws,33,'TOTAL ONE-TIME COST',guarded_sum(['E12','E20','E30']))
    note(ws,35,'Total = development + user training + additional hardware/software. Mark a separately listed bundled charge as Bundled; cite the bundle in its basis. A free tier or existing device is not presumed sufficient.',7,35)
    note(ws,37,'₱178,500 in the teaching photograph belongs to another project and is excluded. Paid effort already incurred must be separated from future cash outlay before making a forward investment decision.',7,34)
    for area in ['F7:F11','F16:F19','F24:F29']:dropdown(ws,area,TREATMENTS)
    for area in ['B7:C11','B16:C19','B24:C29']:numeric(ws,area)
    ws.row_breaks.append(Break(id=20))
    ws=sheet(SHEETS[2],[34,15,12,16,20,17,45],23)
    title(ws,'RECURRING SYSTEM COSTS',7,'Annual incremental system expenses. Confirm production usage, shared-service allocation and bundled services.')
    header(ws,6,['Description','Rate (₱ / event)','Quantity','Events per year','Annual subtotal (₱)','Treatment','Basis / scope'])
    names=['System maintenance','Hosting','Database service charges','Data backup and storage','Incremental internet / communication','Software / domain renewals','Technical support','Other recurring costs / scheduler']
    for r,name in enumerate(names,7):
        expr=f'=IF(OR(F{r}="Bundled",F{r}="Not applicable"),0,IF(AND(OR(F{r}="Estimated",F{r}="Confirmed"),COUNT(B{r}:D{r})=3),B{r}*C{r}*D{r},"{UNKNOWN}"))'
        basis='Maintenance excludes separately billed support. Count shared charges only at the incremental attributable amount.' if r==7 else 'No provider quote or approved allocation supplied. Bundle evidence or no-cost basis required.'
        for c,v in enumerate([name,None,1,1 if r in [12,14] else 12,expr,'To confirm',basis],1):cell(ws,r,c,v,'formula' if c==5 else ('input' if c in [2,3,4,6,7] else 'fixed'),MONEY if c in [2,5] else None)
        ws.row_dimensions[r].height=44
    total(ws,16,'TOTAL ANNUAL RECURRING COST',guarded_sum([f'E{r}' for r in range(7,15)]))
    note(ws,18,'Default quantities and billing frequencies are editable modelling conventions, not purchased subscriptions. Database and storage may be bundled with hosting; use Bundled only after confirmation.',7,36)
    note(ws,20,'Technical support is owned by this sheet. Do not repeat it in Proposed Operating Costs. ₱20,500 in the teaching photograph is not a SiteTrace recurring cost.',7,34)
    dropdown(ws,'F7:F14',TREATMENTS);numeric(ws,'B7:D14')

ACTIVITIES=['Inventory monitoring / updates','Manual report preparation','Inventory reconciliation','Equipment accountability follow-ups']
SUPPLIES=['Paper','Printing / copy service (excludes ink)','Ink / toner (excludes copy-service charge)','Recordkeeping materials','Other office supplies']
def build_operations(proposed=False):
    name=SHEETS[4] if proposed else SHEETS[3]
    ws=sheet(name,[32,13,9,12,15,16,18,16,40],43)
    title(ws,('PROPOSED' if proposed else 'EXISTING')+' SYSTEM OPERATING COSTS',9,'Labour is an allocated productivity cost. It is not a payroll saving. Activity timing, staffing and wages have not been measured.')
    section(ws,5,'A. ACTIVITY LABOUR / CAPACITY',9)
    header(ws,6,['Activity','Hours / person / event','Staff','Events / year','Hourly rate (₱)','Annual person-hours','Allocated labour (₱)','Treatment','Measurement basis'])
    for r,name in enumerate(ACTIVITIES,7):
        f=f'=IF(H{r}="Not applicable",0,IF(AND(OR(H{r}="Estimated",H{r}="Confirmed"),COUNT(B{r}:D{r})=3),B{r}*C{r}*D{r},"{UNKNOWN}"))'
        g=f'=IF(H{r}="Not applicable",0,IF(COUNT(E{r}:F{r})=2,E{r}*F{r},"{UNKNOWN}"))'
        vals=[name,None,1,52 if r==8 else None,None,f,g,'To confirm','Use disjoint tasks and timesheets; avoid overlap between reconciliation and follow-up work.']
        if proposed:
            vals[3]=f'=IF(ISNUMBER({ref(SHEETS[3],f"D{r}")}),{ref(SHEETS[3],f"D{r}")},"")'
            vals[4]=f'=IF(ISNUMBER({ref(SHEETS[3],f"E{r}")}),{ref(SHEETS[3],f"E{r}")},"")'
            vals[8]='Include data entry, inspections and any residual manual checks. Same annual workload and wage basis as baseline.'
        for c,v in enumerate(vals,1):cell(ws,r,c,v,'formula' if isinstance(v,str) and v.startswith('=') else ('input' if c in [2,3,4,5,8,9] else 'fixed'),MONEY if c in [5,7] else NUM if c in [2,6] else None)
        ws.row_dimensions[r].height=48
    total(ws,12,'Total annual person-hours',guarded_sum([f'F{r}' for r in range(7,11)]),9,6,NUM)
    total(ws,13,'Total allocated annual labour',guarded_sum([f'G{r}' for r in range(7,11)]),9,7)
    section(ws,15,'B. SUPPLIES AND OTHER CASH OPERATING COSTS',9)
    header(ws,16,['Expense','Rate (₱ / unit)','Quantity / event','Events / year','Annual cost (₱)','Treatment','Cost boundary','Evidence / quote','Notes'])
    rows=SUPPLIES+['Manual record storage','Reporting / communication','Other attributable admin cash costs']
    for r,name in enumerate(rows,17):
        expr=f'=IF(OR(F{r}="Bundled",F{r}="Not applicable"),0,IF(AND(OR(F{r}="Estimated",F{r}="Confirmed"),COUNT(B{r}:D{r})=3),B{r}*C{r}*D{r},"{UNKNOWN}"))'
        boundary='Supplies only' if r<=21 else 'Admin only; no hosting, support or system internet' if proposed else 'Direct administration expense'
        for c,v in enumerate([name,None,None,None,expr,'To confirm',boundary,None,'Use incremental cash spending; avoid printing / toner overlap.'],1):cell(ws,r,c,v,'formula' if c==5 else ('input' if c in [2,3,4,6,8,9] else 'fixed'),MONEY if c in [2,5] else None)
        ws.row_dimensions[r].height=38
    total(ws,26,'Total annual supplies',guarded_sum([f'E{r}' for r in range(17,22)]),9)
    total(ws,27,'Other annual admin cash costs',guarded_sum([f'E{r}' for r in range(22,25)]),9)
    total(ws,28,'Annual admin cash cost',guarded_sum(['E26','E27']),9)
    section(ws,30,'C. COST VIEW AND FINANCIAL BOUNDARY',9)
    total(ws,31,'Admin cash + allocated labour',guarded_sum(['E28','G13']),9)
    if proposed:
        total(ws,32,'Recurring system cost (reference only)',f'={ref(SHEETS[2],"E16")}',9)
        total(ws,33,'Full proposed cash cost',guarded_sum(['E28','E32']),9)
        note(ws,35,'Financial Analysis starts with existing minus proposed admin cash, then subtracts recurring system cost once. Row 33 is a reference comparison, not another model expense.',9,34)
    else:
        cell(ws,33,1,'Historical confirmed loss / replacement cost');cell(ws,33,5,None,'input',MONEY)
        merge(ws,33,6,9,'Not supplied. Informational only; no loss savings inferred.',None,height=29)
        note(ws,35,'No company salaries, historical loss records, paperwork budgets or timing studies were supplied. The worksheet image supports quantities, not a measured labour workflow. Weekly report frequency of 52 follows R12 as a planning convention.',9,38)
    note(ws,38,'Treatments: Estimated / Confirmed need numeric inputs; Bundled / Not applicable equal an explicit zero; To confirm remains Insufficient Data. Record the supporting basis. Enter zero only after confirming it.',9,36)
    dropdown(ws,'H7:H10',['To confirm','Estimated','Confirmed','Not applicable'])
    dropdown(ws,'F17:F24',TREATMENTS)
    for area in ['B7:E10','B17:D24']:numeric(ws,area)
    ws.row_breaks.append(Break(id=14));ws.row_breaks.append(Break(id=29))

def build_benefits():
    ws=sheet(SHEETS[5],[29,14,14,14,13,17,15,17,17,31],51)
    title(ws,'BREAKDOWN OF TANGIBLE BENEFIT WORKSHEET',10,'Cash savings, released staff capacity and potential equipment exposure are separate measures. Positive savings are not presumed.')
    section(ws,5,'A. SUPPLIES COST REDUCTION',10)
    header(ws,6,['Supply','Existing annual (₱)','Proposed annual (₱)','Reduction (₱)','Classification','Evidence','','','',''])
    for r,source in enumerate(range(17,22),7):
        cell(ws,r,1,SUPPLIES[r-7]);cell(ws,r,2,f'={ref(SHEETS[3],f"E{source}")}','formula',MONEY)
        cell(ws,r,3,f'={ref(SHEETS[4],f"E{source}")}','formula',MONEY)
        cell(ws,r,4,difference(f'B{r}',f'C{r}'),'formula',MONEY)
        merge(ws,r,5,10,'Potential cash saving; receipts / budget and post-pilot spending required.',height=29)
    total(ws,12,'ANNUAL SUPPLIES REDUCTION',guarded_sum([f'D{r}' for r in range(7,12)]),10,4)
    section(ws,14,'B. LABOUR AND PRODUCTIVITY BENEFITS',10)
    header(ws,15,['Activity','Existing person-hours','Proposed person-hours','Annual hours saved','Rate (₱ / hour)','Productivity value (₱)','Cash realization share','Payroll cash saving (₱)','Retained capacity (₱)','Basis / evidence'])
    for r,src in enumerate(range(7,11),16):
        vals=[ACTIVITIES[r-16],f'={ref(SHEETS[3],f"F{src}")}',f'={ref(SHEETS[4],f"F{src}")}',difference(f'B{r}',f'C{r}'),
              f'=IF(ISNUMBER({ref(SHEETS[3],f"E{src}")}),{ref(SHEETS[3],f"E{src}")},"")',
              f'=IF(COUNT(D{r}:E{r})=2,D{r}*E{r},"{UNKNOWN}")',0,
              f'=IF(G{r}=0,0,IF(COUNT(F{r},G{r})=2,F{r}*G{r},"{UNKNOWN}"))',difference(f'F{r}',f'H{r}'),
              '0% credits no payroll saving. A higher share requires a documented overtime, contract or payroll reduction.']
        for c,v in enumerate(vals,1):cell(ws,r,c,v,'formula' if isinstance(v,str) and v.startswith('=') else ('input' if c in [7,10] else 'fixed'),MONEY if c in [5,6,8,9] else '0%' if c==7 else NUM if c in [2,3,4] else None)
        ws.row_dimensions[r].height=48
    for r,label,col in [(21,'Total annual hours saved',4),(22,'Total productivity value',6),(23,'Credited annual payroll cash savings',8),(24,'Retained capacity value (excluded from cash ROI)',9)]:
        total(ws,r,label,guarded_sum([f'{chr(64+col)}{v}' for v in range(16,20)]),10,col,NUM if col==4 else MONEY)
    section(ws,26,'C. EQUIPMENT ACCOUNTABILITY / COST AVOIDANCE',10)
    header(ws,27,['Benefit / measure','Observed units','Claim input (₱ / year)','Include in cash model?','Credited amount (₱)','Evidence / boundary','','','',''])
    cell(ws,28,1,'Unreconciled inventory exposure');cell(ws,28,2,f'={ref(SHEETS[0],"E34")}','formula',INT)
    cell(ws,28,3,f'={ref(SHEETS[0],"I34")}','formula',MONEY);cell(ws,28,4,'Never automatic');cell(ws,28,5,0,'fixed',MONEY)
    merge(ws,28,6,10,'Stock-value exposure, not a yearly benefit. Unit replacement prices and physical status unverified.',height=39)
    for r,name in [(29,'Avoided confirmed loss / replacement'),(30,'Avoided duplicate procurement')]:
        cell(ws,r,1,name);cell(ws,r,3,None,'input',MONEY);cell(ws,r,4,'Exclude','input')
        cell(ws,r,5,f'=IF(D{r}="Exclude",0,IF(ISNUMBER(C{r}),C{r},"{UNKNOWN}"))','formula',MONEY)
        merge(ws,r,6,10,'Annual attributable saving needs approved evidence, a repeatable baseline and a distinct purchase / loss event. The same event cannot be credited twice.',height=42)
    total(ws,32,'Equipment benefits credited to cash model',guarded_sum(['E29','E30']),10)
    note(ws,34,'Both equipment benefit lines are excluded by default. Blank claims remain unverified. A one-time recovery of historical items must not be entered as a repeating annual saving. No assumed recovery rate is applied to 463 units.',10,36)
    section(ws,36,'D. TOTAL ANNUAL TANGIBLE BENEFITS',10)
    for r,label,expr in [
        (37,'Supplies cash reduction','=D12'),
        (38,'Other admin cash reduction',difference(ref(SHEETS[3],'E27'),ref(SHEETS[4],'E27'))),
        (39,'Payroll cash savings credited','=H23'),
        (40,'Equipment / procurement savings credited','=E32'),
        (42,'TOTAL ANNUAL CASH TANGIBLE BENEFITS',guarded_sum(['E37','E38','E39','E40'])),
        (43,'Released capacity value (noncash)','=I24'),
        (44,'Cash + retained productivity value',guarded_sum(['E42','E43']))]:total(ws,r,label,expr,10)
    note(ws,46,'Cash ROI uses row 42 only. Productivity-inclusive appraisal uses cash plus retained capacity (row 44), which is labelled separately and is not cash flow. Financial Analysis deducts recurring system cost once.',10,35)
    note(ws,48,'Annual person-hours = hours/person/event × staff × events/year. Annual hours saved = existing annual person-hours − proposed annual person-hours. With equal staff and workload this equals hours saved per activity × frequency.',10,36)
    dropdown(ws,'D29:D30',['Exclude','Include with evidence']);numeric(ws,'C29:C30');numeric(ws,'G16:G19',True)
    ws.row_breaks.append(Break(id=13));ws.row_breaks.append(Break(id=25));ws.row_breaks.append(Break(id=35))

INTANGIBLE=[
 ('Equipment accountability','Named holder, reservation and inspected receipt associate an asset with an accountable person.','R4–R6, R10','Share of held records with a named active custodian.','Needs timely, truthful handover entry; no automatic physical recovery.'),
 ('Visibility of assignments','Equipment profiles and project / personal lists expose recorded holder, quantity and location.','R4–R6','Time to identify recorded holder and site.','Recorded state still requires a physical check.'),
 ('Record accuracy','Eligibility verification and condition capture reduce inconsistent handovers.','R5, R6, R10','Record-to-count variance and correction rate.','Actual server migrations and role controls must match reviewed code.'),
 ('Faster equipment information','Search and filtered inventory views reduce repeated manual lookup.','R4, R7','Median lookup time in matched pilot tasks.','No measured speed improvement supplied.'),
 ('Management decisions','Current inventory and movement reports can inform allocation and purchasing review.','R7, R11','Percentage of purchase decisions checked against available inventory.','No automated procurement optimization or guaranteed savings claimed.'),
 ('Fewer reporting errors','Report output reuses recorded fields and PDF export instead of retyping a separate summary.','R7, R11','Report corrections per cycle.','Input errors and incomplete field reports remain possible.'),
 ('Inventory transparency','Current state is separated from saved historical observations.','R7, R8','Coverage of scheduled snapshots and reported exceptions.','No historical reconstruction; scheduler setup must be confirmed.'),
 ('Stronger audit trails','Saved movement actions, inspection notes and recovery actions support traceability.','R5, R6, R11','Share of sampled handovers with complete movement / receipt evidence.','Movement history is not proof of physical count or a full financial audit.'),
 ('Management oversight','Role routes, missing / repair views and notifications expose unresolved work.','R6, R8, R9','Age of unresolved discrepancy cases and overdue actions.','Notifications and scheduling depend on deployed services and user follow-through.')]

def build_intangibles():
    ws=sheet(SHEETS[6],[24,46,11,40,45],22)
    title(ws,'INTANGIBLE BENEFITS',5,'Qualitative benefits tied to reviewed features. Each needs a pilot measure; no monetary amount is assigned.')
    header(ws,6,['Benefit','Supporting implemented feature','Evidence','Proposed performance indicator','Limitation / condition'])
    for r,items in enumerate(INTANGIBLE,7):
        for c,v in enumerate(items,1):cell(ws,r,c,v)
        ws.row_dimensions[r].height=66
    note(ws,18,'Source review establishes capability, not measured business performance or confirmed production deployment. Demo records and seeded materials do not establish company inventory or financial facts.',5,36)
    note(ws,20,'Prioritize physical verification of the 3 flagged categories and a matched workload pilot. Do not promise automatic recovery, theft prevention, partial equipment-record receipt or unattended historical reconstruction.',5,36)
    ws.auto_filter.ref='A6:E15'

def build_financial():
    ws=sheet(SHEETS[7],[45,24,20,20,20,41],53)
    title(ws,'THREE-YEAR FINANCIAL ANALYSIS',6,'Primary model: incremental cash savings. Supplemental economic result adds retained staff capacity. All outputs remain conditional on supplied inputs.')
    cell(ws,5,1,'Analysis horizon (fixed projection)');cell(ws,5,2,3,'fixed','0" years"')
    cell(ws,6,1,'Annual discount rate (planning convention)');cell(ws,6,2,f'={ref(SHEETS[8],"B9")}','formula','0.0%')
    header(ws,8,['Year-specific controls','Year 1','Year 2','Year 3','','Basis / scope'])
    cell(ws,9,1,'Cash benefit realization multiplier')
    cell(ws,10,1,'Recurring cost multiplier')
    for r in [9,10]:
        for c in [2,3,4]:cell(ws,r,c,1,'input','0%')
        cell(ws,r,6,'100% = constant annual scenario, not a measured adoption or inflation forecast.')
    section(ws,12,'A. LINKED BASE-YEAR INPUTS',6)
    for r,label,expr in [
        (13,'Total one-time investment',f'={ref(SHEETS[1],"E33")}'),
        (14,'Annual recurring system cost',f'={ref(SHEETS[2],"E16")}'),
        (15,'Annual cash tangible benefits',f'={ref(SHEETS[5],"E42")}'),
        (16,'Annual retained productivity value (noncash)',f'={ref(SHEETS[5],"E43")}'),
        (17,'Annual net cash benefit',difference('B15','B14'))]:
        cell(ws,r,1,label);cell(ws,r,2,expr,'formula',MONEY);ws.row_dimensions[r].height=28
    section(ws,19,'B. CASH FLOW AT YEAR END; INITIAL INVESTMENT AT YEAR 0',6)
    header(ws,20,['Cash flow measure','Year 0','Year 1','Year 2','Year 3','Interpretation'])
    cell(ws,21,1,'Annual tangible cash benefits');cell(ws,22,1,'Recurring system cash cost')
    cell(ws,23,1,'One-time investment');cell(ws,24,1,'Net cash flow');cell(ws,25,1,'Cumulative cash flow');cell(ws,26,1,'Discount factor');cell(ws,27,1,'Present value of net cash flow')
    for r in [21,22]:cell(ws,r,2,0,'fixed',MONEY)
    cell(ws,23,2,'=B13','formula',MONEY)
    for c in [3,4,5]:
        L=chr(64+c);control=chr(63+c)
        cell(ws,21,c,f'=IF(ISNUMBER($B$15),$B$15*{control}9,"{UNKNOWN}")','formula',MONEY)
        cell(ws,22,c,f'=IF(ISNUMBER($B$14),$B$14*{control}10,"{UNKNOWN}")','formula',MONEY)
        cell(ws,23,c,0,'fixed',MONEY)
    for c in [2,3,4,5]:
        L=chr(64+c);P=chr(63+c)
        cell(ws,24,c,f'=IF(COUNT({L}21:{L}23)=3,{L}21-{L}22-{L}23,"{UNKNOWN}")','formula',MONEY)
        cell(ws,25,c,f'={L}24' if c==2 else guarded_sum([f'{P}25',f'{L}24']),'formula',MONEY)
        cell(ws,26,c,f'=1/(1+$B$6)^{c-2}','formula','0.0000')
        cell(ws,27,c,f'=IF(ISNUMBER({L}24),{L}24*{L}26,"{UNKNOWN}")','formula',MONEY)
        ws.row_dimensions[24].height=29
    merge(ws,29,1,6,'Core financial results include no automatic value for 463 gaps. Benefits and recurring costs are linked once. Negative savings remain negative.',AMBER,10,height=30)
    section(ws,31,'C. CASH INVESTMENT RESULTS',6)
    metrics=[
      (32,'Three-year undiscounted cash benefits',guarded_sum(['C21','D21','E21'])),
      (33,'Three-year total cost incl. initial investment',guarded_sum(['B13','C22','D22','E22'])),
      (34,'Three-year ROI',f'=IF(COUNT(B13,C24:E24)=4,IF(B13>0,(SUM(C24:E24)-B13)/B13,"Not applicable: zero investment"),"{UNKNOWN}")'),
      (35,'Discounted benefit-cost ratio',f'=IF(COUNT(B13,C21:E22)=7,IF(B13+C22*C26+D22*D26+E22*E26>0,(C21*C26+D21*D26+E21*E26)/(B13+C22*C26+D22*D26+E22*E26),"Not applicable: zero cost"),"{UNKNOWN}")'),
      (36,'Cash NPV',f'=IF(COUNT(B24:E24)=4,SUM(B27:E27),"{UNKNOWN}")'),
      (37,'Payback period (years)',f'=IF(COUNT(B13,C24:E24)=4,IF(B13=0,0,IF(AND(C24=D24,D24=E24,C24>0),IF(B13/C24<=3,B13/C24,"Not recovered in 3 years"),IF(C25>=0,B13/C24,IF(D25>=0,1-C25/D24,IF(E25>=0,2-D25/E24,"Not recovered in 3 years"))))),"{UNKNOWN}")'),
      (38,'Year 3 cumulative net cash result','=E25'),
      (39,'Required level annual cash benefit (zero NPV)',f'=IF(COUNT(B13,B14)=2,B14+B13/SUM(C26:E26),"{UNKNOWN}")'),
      (40,'Required level annual cash benefit (3-year payback)',f'=IF(COUNT(B13,B14)=2,B14+B13/3,"{UNKNOWN}")')]
    for r,label,expr in metrics:
        cell(ws,r,1,label);cell(ws,r,2,expr,'formula','0.0%' if r==34 else '0.00" ×"' if r==35 else '0.00" years"' if r==37 else MONEY);ws.row_dimensions[r].height=31
    note(ws,42,'ROI = (sum of operating net benefits in Years 1–3 − initial investment) / initial investment. Discounted BCR = PV cash benefits / (initial investment + PV recurring costs). NPV discounts year-end flows.',6,39)
    note(ws,44,'Payback assumes net benefits accrue evenly within each year. Constant positive flow uses investment / annual net benefit; variable flow uses the first cumulative crossing. No recovery within the horizon is reported explicitly.',6,40)
    section(ws,46,'D. SUPPLEMENTAL ECONOMIC VIEW — NOT CASH FLOW',6)
    cell(ws,47,1,'Productivity-inclusive NPV')
    cell(ws,47,2,f'=IF(COUNT(B36,B16)=2,B36+B16*(B9*C26+C9*D26+D9*E26),"{UNKNOWN}")','formula',MONEY)
    note(ws,49,'Economic NPV adds retained capacity after excluding any portion already credited to payroll cash savings. It is not cash ROI. No terminal resale value, tax effect, price escalation, financing charge or confirmed equipment saving is assumed.',6,38)
    numeric(ws,'B9:D10');ws.row_breaks.append(Break(id=29));ws.row_breaks.append(Break(id=45))

def build_assumptions():
    ws=sheet(SHEETS[8],[36,25,26,70],49)
    title(ws,'ASSUMPTIONS AND REFERENCES',4,'Read this sheet first. Confirmed inventory facts are separated from estimates, unknowns and modelling conventions.')
    header(ws,5,['Item','Value / input','Evidence class','Basis / limitation'])
    assumptions=[
      ('Prepared date',DATE,'Document date','Asia/Manila; source worksheet date not supplied.'),
      ('Currency','PHP / Philippine Peso','Display convention','No foreign exchange assumption needed; request local quotations.'),
      ('Development duration (calendar months)',3,'Editable planning assumption','Academic three-month planning window only; not actual elapsed development effort. Person-months must be supplied separately.'),
      ('Annual discount rate',.08,'Editable modelling convention','8% is an illustrative sensitivity input, not a company hurdle rate or market quote. Replace with an approved rate.'),
      ('Analysis horizon',3,'Fixed model scope','Years 1–3 plus Year 0. Set year multipliers in Financial Analysis; no escalation assumed.'),
      ('Financial inputs at preparation','Not supplied','Unknown','No rates, supplier quotes, measured task times, approved cash reductions or confirmed loss history supplied.'),
      ('Recorded equipment units',TOTAL,'Supplied quantity','26 populated categories. Mixed units are not equivalent economic assets.'),
      ('Reported missing / no-report units',GAP,'Supplied reconciliation gap','Three supplied gaps: 19 + 75 + 369. No conclusion of theft, physical loss or automatic recovery.'),
      ('Required units in flagged categories',852,'Supplied partial coverage','42 + 300 + 510. Requirements for the remaining 23 categories were not supplied.'),
      ('Labour rates and task times','Not supplied','Unknown','Use timesheets and approved pay / contractor rates. No employee headcount reduction assumed.'),
      ('Hosting, database and storage','Not supplied','Unknown','Supabase-backed code does not identify the paid plan, actual usage, free capacity or incremental provider bill.'),
      ('Equipment unit replacement prices','Not supplied','Unknown','Blue price/source fields remain blank. Use dated local supplier quotes matching specifications, tax and delivery basis.'),
      ('Payroll cash realization',0,'Default model exclusion','0% of productivity value credited to cash savings until a corresponding cash expense can be shown to decline.'),
      ('Equipment cost-avoidance credit',0,'Default model exclusion','Equipment replacement and duplicate-procurement claims excluded until supported by disjoint annual evidence.'),
      ('Task staffing default',1,'Editable modelling convention','One person per activity is a placeholder, not actual company staffing. Confirm for both workflows.'),
      ('Weekly report frequency default',52,'Editable planning convention','PRODUCT.md specifies a weekly report; 52 cycles assumes one full operating year. Actual reporting calendar remains to confirm.'),
      ('Billing frequencies', '12 monthly / 1 annual','Editable modelling convention','These are unit conversions only, not actual purchased services. Verify each line.'),
      ('Cash model boundary','Incremental cash savings','Analysis policy','Admin cash reduction plus evidenced payroll and equipment saving, less recurring system cost once.'),
      ('Economic model boundary','Cash + retained capacity','Supplemental only','Retained capacity excludes the portion already realized as payroll cash saving.'),
      ('Existing workflow','Partly inferred','Evidence limitation','Worksheet proves recorded monitoring fields. Collection, follow-up, reconciliation and report activities are analytical workflow assumptions pending staff interview.'),
      ('Production effectiveness','Not verified','Evidence limitation','Repository supports features; no live database, uptime, scheduler operation or performance benchmark was verified.'),
      ('Taxes / terminal value / financing','Excluded','Modelling convention','Use consistent gross cash quotes; no tax shield, resale proceeds or financing cost is credited. Three-year constant-price view.'),
      ('Prior development work','Separate before approval','Decision boundary','Workbook values full development/implementation scope. For a remaining-investment decision, exclude sunk cash already spent and document the revised scope.'),
      ('Report synchronization','Dated snapshot','Use instruction','Excel formulas update on editing. Word/PDF do not live-link; regenerate/update both reports after financial inputs change.')]
    for r,items in enumerate(assumptions,6):
        for c,v in enumerate(items,1):cell(ws,r,c,v,'input' if (r,c) in [(8,2),(9,2)] else 'fixed','0.0%' if r==9 and c==2 else None)
        ws.row_dimensions[r].height=45
    header(ws,32,['ID / source','Location / source','Evidence class','Description / limits'])
    for r,(eid,name,desc,path,anchor) in enumerate(EVIDENCE,33):
        cell(ws,r,1,eid+' | '+name);cell(ws,r,2,path or name);cell(ws,r,3,'Repository source' if path else 'Supplied reference');cell(ws,r,4,desc)
        ws.row_dimensions[r].height=47
    note(ws,49,'Teaching amounts ₱178,500 and ₱20,500 are from another project. They are layout examples only and are excluded from all SiteTrace financial calculations. Full source hashes and line anchors are in validation/source-evidence.json.',4,38)
    numeric(ws,'B8');numeric(ws,'B9',True)
    ws.row_breaks.append(Break(id=19));ws.row_breaks.append(Break(id=31));ws.row_breaks.append(Break(id=42))

def build_dashboard():
    ws=sheet(SHEETS[9],[40,25,8,31,22,14,14],40)
    title(ws,'SITETRACE | EXECUTIVE DASHBOARD',7,'Evidence-led appraisal • Baseline dated 24 October 2026 • financial results depend on documented inputs and selected assumptions.')
    header(ws,5,['Inventory indicator','Actual quantity','','Financial indicator','Result','',''])
    kpis=[(6,'Total recorded equipment quantity',f'=SUM({ref(SHEETS[0],"C7:C32")})'),
          (7,'Equipment categories',f'=COUNTA({ref(SHEETS[0],"B7:B32")})'),
          (8,'Categories with reported inventory gaps',f'=COUNTIF({ref(SHEETS[0],"E7:E32")},">0")'),
          (9,'Units missing or without report',f'={ref(SHEETS[0],"E34")}')]
    for r,label,expr in kpis:cell(ws,r,1,label);cell(ws,r,2,expr,'formula',INT);ws.row_dimensions[r].height=33
    metrics=[(6,'One-time implementation cost',SHEETS[1],'E33',MONEY),(7,'Annual recurring system cost',SHEETS[2],'E16',MONEY),
             (8,'Annual cash financial benefits',SHEETS[5],'E42',MONEY),(9,'Three-year cash ROI',SHEETS[7],'B34','0.0%'),
             (10,'Cash payback period',SHEETS[7],'B37','0.00" years"'),(11,'Cash NPV',SHEETS[7],'B36',MONEY)]
    for r,label,s,c,f in metrics:
        cell(ws,r,4,label);ws.merge_cells(start_row=r,start_column=5,end_row=r,end_column=7);cell(ws,r,5,f'={ref(s,c)}','formula',f);ws.row_dimensions[r].height=33
    note(ws,13,'463 units represent a reporting / reconciliation gap. They are not confirmed losses. Financial figures remain Insufficient Data until financial and operational inputs are supplied.',7,36)
    header(ws,16,['Flagged equipment category','Reported gap','Share of 463','','','',''])
    for r,(name,gap) in enumerate([(INV[1][0],19),(INV[16][0],75),(INV[25][0],369)],17):
        cell(ws,r,1,name);cell(ws,r,2,gap);cell(ws,r,3,f'=B{r}/$B$9','formula','0.0%');ws.row_dimensions[r].height=28
    chart=BarChart();chart.type='bar';chart.style=10;chart.title='Reported gaps by equipment category'
    chart.add_data(Reference(ws,min_col=2,min_row=16,max_row=19),titles_from_data=True)
    chart.set_categories(Reference(ws,min_col=1,min_row=17,max_row=19));chart.legend=None
    chart.x_axis.title='Unreconciled units';chart.height=8.3;chart.width=25
    chart.dLbls=DataLabelList();chart.dLbls.showVal=True;ws.add_chart(chart,'A21')
    note(ws,38,'Next evidence: development effort/rates, supplier bills and bundles, baseline and pilot task times, wages, supplies spending, and approved cash reductions. Reconcile the 3 flagged categories first.',7,35)
    ws.freeze_panes='B6'

def make_workbook():
    build_inventory();build_costs();build_operations();build_operations(True)
    build_benefits();build_intangibles();build_financial();build_assumptions();build_dashboard()
    assert wb.sheetnames==SHEETS
    for ws in wb:
        ws.sheet_view.zoomScale=85
        # Visually flag unknown results without masking genuine zero values.
        for row in ws:
            for c in row:
                if c.data_type=='f':
                    assert '#REF!' not in c.value
        ws.sheet_properties.outlinePr.summaryRight=False
    wb.active=9
    path=OUT/'SiteTrace_Cost_Benefit_Analysis.xlsx';wb.save(path)
    return path

# A single content model feeds Word and PDF to keep their figures consistent.
BLOCKS=[]
def p(text):BLOCKS.append(('p',text))
def h(text):BLOCKS.append(('h',text))
def sub(text):BLOCKS.append(('sub',text))
def page():BLOCKS.append(('page',None))
def table(caption,heads,rows,widths=None):BLOCKS.append(('table',(caption,heads,rows,widths)))
def bullets(items):BLOCKS.append(('bullets',items))
def formula(text):BLOCKS.append(('formula',text))

def report_content():
    h('1. Introduction')
    p('This cost-benefit analysis evaluates the proposed MCPA / SiteTrace equipment accountability and inventory management system against the existing manual or spreadsheet-based monitoring process. It is prepared for IT303 Systems Analysis and Design. The analysis uses the supplied equipment worksheet and a read-only review of the current repository. It does not rely on sample application records as company inventory evidence.')
    p(f'The supplied worksheet contains {TOTAL:,} recorded equipment units across 26 categories. Three categories have reported gaps totaling {GAP:,} units. These figures establish an accountability and reconciliation concern. They do not establish the cost of that concern or demonstrate that the computerized system is already financially feasible.')
    table('Table 1. Evidence and interpretation boundaries',['Evidence class','Available evidence','Permitted interpretation'],[
      ['Supplied facts','26 categories; 758 recorded units; gaps of 19, 75 and 369','Observed worksheet quantities; not a dated physical count.'],
      ['Reviewed capability','Equipment, movement, receipt, missing, repair and reporting source','Implemented code can support accountability; production effectiveness is not confirmed.'],
      ['Planning conventions','3-month window, 3-year horizon, 8% discount input','Editable modelling assumptions; not actual labour effort or an approved hurdle rate.'],
      ['Unknown finances','Rates, quotations, measured hours, spending and loss history','Financial totals, ROI, payback and NPV remain Insufficient Data.']], [23,36,41])
    h('2. Overview of the Existing System')
    p('The primary source is an undated worksheet titled “HAND TOOLS AND OTHERS MONITORING.” It records equipment descriptions, recorded quantities, need-to-comply quantities, and missing or no-report quantities. Only three categories have requirements and reported gaps. Blank cells mean that information was not supplied.')
    p('For comparison, the analysis models staff collecting counts, updating the worksheet, preparing reports, reconciling differences and following up with equipment holders. These activities are reasonable workflow inferences, not results of a staff interview or timing study. Staffing, reporting effort, reconciliation frequency, office supply costs and communication expenses remain to be measured. The product documentation specifies weekly monitoring, but it does not prove the actual calendar followed by the company. [R1, R2, R12]')
    h('3. Overview of the Proposed System')
    p('The reviewed system is a plain HTML, CSS and JavaScript web application with Supabase-backed data operations. The equipment masterlist stores identifiers, quantities, holders, sites and statuses. Shared movement code supports requests, approval and release, direct transfer, receipt inspection, returns, repair reports and missing-equipment recovery. Current authentication and permission code supersede older descriptions of prototype-only roles. [R4–R6, R9, R15]')
    p('Current report code distinguishes present inventory from saved historical snapshots and exports PDF reports. Movement activity also has PDF export. These current implementations take precedence over older CSV-only documentation. Snapshot capture is prospective and requires backend scheduling; the source does not establish that a production job is operating. Equipment movements select whole asset records, not arbitrary partial quantities. These limits affect the effort and benefits that should be measured during a pilot. [R6–R8, R11]')
    page()
    h('4. Existing Equipment Monitoring Analysis')
    p('Table 2 transcribes all 26 populated rows. A dash means not supplied, not zero. Descriptions are standardized for readability: “Water Pump” and “Catwalk Platform Scaffolding” retain the meaning of the source labels. The unpopulated row 27 is excluded. [R1, R2]')
    table('Table 2. Supplied inventory baseline',['No.','Equipment description','Recorded','Need to comply','Missing / no report'],
      [[str(i),name,str(qty),'—' if req is None else str(req),'—' if gap is None else str(gap)] for i,(name,qty,req,gap) in enumerate(INV,1)]+
      [['','Total recorded / provided cells only',str(TOTAL),'852','463']],[5,48,14,16,17])
    page()
    sub('4.1 Reconciliation interpretation')
    p('The 852 required units are a partial subtotal for the three flagged categories; no requirement was supplied for the other 23 categories. The total of 758 is the sum of recorded units of different equipment types, not a market valuation or a verified count of equivalent assets.')
    table('Table 3. Validation of the reported reconciliation gaps',['Category','Requirement − recorded','Reported gap','Share of 463'],[
      ['Shovel (Pala, Bilog)','42 − 23 = 19','19','4.1%'],['GI Pipes','300 − 225 = 75','75','16.2%'],['Swivel Clamp','510 − 141 = 369','369','79.7%'],['Total','852 − 389 = 463','463','100.0%']],[38,28,17,17])
    p('All three reported gaps agree with requirement minus recorded quantity. Swivel clamps account for 79.7% of reported gap units, making that category a useful first reconciliation priority by volume. Unit volume does not establish financial priority because prices and specifications are unknown. The sheet does not distinguish unreported stock, items in transit, counting errors, unavailable items and confirmed physical losses. Adding the gaps to recorded stock would therefore not establish a confirmed company-wide stock total.')
    p('The workbook calculates exposure only when a flagged category has an entered replacement price. Potential value exposure equals reported gap units multiplied by the estimated price for the same unit and specification. This is a valuation of an unresolved position, not a confirmed loss, a promised recovery, or an annual benefit. The aggregate exposure remains Unverified until all three prices are supplied.')
    h('5. One-Time Development Cost')
    p('The workbook follows the academic “BREAKDOWN OF ONE TIME COST WORKSHEET” structure. The scope values full development and implementation effort. Because a system already exists, a future investment decision must distinguish remaining work from paid development already incurred. No retrospective payment, salary or development price is inferred from the existence of the code.')
    table('Table 4. One-time investment structure',['Section','Included items','Calculation / current result'],[
      ['A. Development','System analysis; programming; database development; testing and QA; documentation and implementation','Rate per person-month × allocated person-months. Subtotal: Insufficient Data.'],
      ['B. User training','Preparation; orientation; materials; training sessions','Rate per hour, kit or session × quantity. Subtotal: Insufficient Data.'],
      ['C. Hardware / software','Deployment setup; separate database setup; backup setup; domain/SSL; necessary devices; licenses','One-time unit rate × quantity. Subtotal: Insufficient Data.'],
      ['Total investment','Development + training + hardware/software','Insufficient Data. No actual company quotation supplied.']], [22,40,38])
    p('The three-month development window is an editable planning convention. It does not mean that every role works full time for three months. Rates and role effort are blank until supported. Separate preparation and delivery tasks should not be charged twice. Existing devices, open-source components, provider bundles and existing service capacity must be checked before assuming a new purchase is required.')
    formula('Total one-time cost = development cost + user training cost + additional hardware/software cost.')
    p('Each line has an editable treatment. Estimated and Confirmed require numeric inputs and an evidence basis. Bundled or Not applicable explicitly contributes zero. To confirm contributes Insufficient Data. A teaching example of ₱178,500 is not a SiteTrace budget and has not been imported into the analysis. [R3]')
    h('6. Recurring System Costs')
    p('The annual operating model includes maintenance, hosting, database charges, backup/storage, attributable internet costs, software/domain renewal, technical support and other necessary recurring services such as a scheduler. Provider usage, subscriptions, retention needs, available capacity and approved service allocations are not supplied. A Supabase-backed application does not by itself identify a paid plan or the cost of production operation.')
    table('Table 5. Recurring cost and double-counting controls',['Cost group','Annual calculation','Boundary'],[
      ['Maintenance and technical support','Rate × quantity × annual frequency','Separate only when the services are distinct; bundled support is not repeated.'],
      ['Hosting, database and backup','Rate × attributable quantity × annual frequency','Record provider bundles once. Free capacity is not presumed sufficient.'],
      ['Internet, renewal and scheduling','Incremental rate × quantity × frequency','Include only costs attributable to SiteTrace. General existing connectivity is not charged in full.'],
      ['Annual recurring total','Insufficient Data','Linked once to Financial Analysis.']], [29,30,41])
    p('Monthly and annual frequency defaults convert billing units; they are not subscription evidence. Residual administrative work and consumables belong in Proposed System Operating Costs. System hosting, maintenance and technical support belong in Recurring Costs. The academic example of ₱20,500 is excluded. [R3]')
    h('7. Tangible Benefits')
    sub('7.1 Supplies and administrative cash savings')
    p('The comparison covers paper, printing/copy services, ink or toner, recordkeeping materials and other office supplies. Other administrative cash costs cover record storage and non-system reporting/communication. Existing and proposed rates, quantities and frequency are editable. Printing charges and ink must use distinct spending boundaries. Proposed office costs exclude system expenses already listed as recurring costs.')
    formula('Supplies cash reduction = existing annual supplies cost − proposed annual supplies cost.')
    p('The reduction is attributable only if the system reduces an actual cash purchase, service charge or storage expense for the same workload. Reusing recorded inventory and PDF reports can reduce retyping and some printing, but these effects have not been measured. A decrease in paper use is a projection until supported by budgets or receipts and post-pilot use. Negative reductions remain additional costs; formulas do not force savings to be positive. [R7, R11]')
    sub('7.2 Labour and productivity')
    p('The four modelled activities are inventory updates, report preparation, reconciliation and accountability follow-ups. Annual person-hours equal hours per person per event multiplied by staff and events per year. The proposed model uses the baseline reporting frequency and wage for comparability. Staff must include continuing data entry, inspection and physical checks. Activities need separate time boundaries so the same investigation is not counted twice.')
    formula('Annual hours saved = existing annual person-hours − proposed annual person-hours.\nAnnual productivity value = annual hours saved × applicable hourly rate.')
    p('Faster work releases staff capacity, which may improve service without reducing payroll. The model therefore credits a default 0% of productivity value as cash savings. A higher cash-realization share needs a corresponding documented reduction in paid overtime, contractor hours or payroll expenditure. The retained portion is presented as noncash capacity value. Cash savings and retained capacity are never added twice. No employee dismissal or full-salary saving is assumed.')
    sub('7.3 Equipment accountability and avoided procurement')
    p('The observed 463-unit gap gives a reason to improve reconciliation. The system can preserve named custody, inspect receipts, show missing cases and record recovery after verification. It cannot automatically locate or recover stock. No annual monetary benefit is calculated from the 463 units because confirmed loss history, prices, recurrence, avoidability and recovery evidence are absent. [R4–R6, R10]')
    p('Avoided replacement and avoided duplicate procurement are separate optional benefit claims. Both are excluded from the cash model by default. Inclusion requires annual evidence, a credible comparison with what would otherwise have been bought, and disjoint underlying events. A recovered historical item is a one-time event and must not be repeated as a yearly saving. Improved visibility may support purchasing decisions, but no automatic procurement optimizer or verified avoided purchase is claimed. [R14]')
    table('Table 6. Annual benefit classification at preparation',['Measure','Current value','Treatment'],[
      ['Supplies and other admin cash reduction','Insufficient Data','Needs measured spending for both workflows.'],
      ['Productivity / released capacity value','Insufficient Data','Needs task times, staffing, frequency and wage.'],
      ['Payroll cash saving credited','₱0.00','Default exclusion, not a verified payroll expense.'],
      ['Equipment / procurement saving credited','₱0.00','Default exclusion, not a finding that physical losses are zero.'],
      ['Total annual cash tangible benefit','Insufficient Data','Cash benefit input to the main financial model.'],
      ['Potential flagged stock exposure','Unverified','Separate from annual benefits; three replacement prices missing.']], [43,23,34])
    h('8. Intangible Benefits')
    p('The following benefits are supported by reviewed system features but cannot yet be assigned dependable monetary amounts. Their realization depends on correct deployment, complete records, staff use and continued physical verification. Suggested indicators provide a practical pilot evaluation plan.')
    table('Table 7. Qualitative benefits and feature support',['Benefit','Supporting feature','Pilot measure'],[[a,b+' ['+c+']',d] for a,b,c,d,e in INTANGIBLE],[23,49,28])
    p('An audit trail is evidence of recorded actions, not proof of an actual physical count. Searchable data may still be stale. Historical snapshots do not reconstruct past inventory and need a configured backend job. Whole-record equipment handling also means that arbitrary partial receipts cannot be assumed to reduce workload. [R6–R8]')
    h('9. Existing versus Proposed System Comparison')
    table('Table 8. Operational comparison',['Activity','Existing comparison workflow','Reviewed proposed support'],[
      ['Inventory monitoring','Spreadsheet quantity entries; dates/holder detail not supplied','Asset identifiers, quantity, site, holder and status views. [R4]'],
      ['Movement accountability','Issue/return/transfer evidence not included in supplied sheet','Requests, reservations, release, named inspected receipt, return and recovery. [R5, R6]'],
      ['Reconciliation','Compare requirements and recorded quantities; investigate gaps','Recorded movements and custody can help investigate; physical checks remain necessary. [R5, R10]'],
      ['Report preparation','Manual/spreadsheet preparation assumed; effort unknown','Current and historical inventory views, movement history and PDF export. [R7, R11]'],
      ['Financial cost','Admin cash and labour allocation unmeasured','Residual admin cash/labour plus recurring system expenses; totals unknown.']], [23,34,43])
    p('The proposed administrative cash cost is shown separately from recurring system cost. A full proposed cash view adds them once. Labour allocation is shown separately to explain resource use. The cash financial model uses the reduction in admin cash spending plus evidenced payroll and equipment benefits, then deducts recurring system cost. It does not subtract the entire proposed operating total a second time.')
    h('10. Three-Year Financial Projection')
    p('The model has an initial investment at Year 0 and three year-end operating cash flows. The 8% annual discount rate is an adjustable modelling convention. Benefit-realization and recurring-cost multipliers default to 100% for each year and can be changed independently. These are scenario controls, not an adoption forecast. The baseline report uses no invented prices or salaries.')
    table('Table 9. Cash projection at the supplied-data baseline',['Measure','Year 0','Year 1','Year 2','Year 3'],[
      ['Cash tangible benefits','₱0.00',UNKNOWN,UNKNOWN,UNKNOWN],
      ['Recurring system costs','₱0.00',UNKNOWN,UNKNOWN,UNKNOWN],
      ['Initial investment',UNKNOWN,'₱0.00','₱0.00','₱0.00'],
      ['Net cash flow',UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN],
      ['Cumulative cash flow',UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN],
      ['Discount factor','1.0000','0.9259','0.8573','0.7938'],
      ['Discounted net flow',UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN]],[28,18,18,18,18])
    p('Year 0 operating amounts and later one-time investment entries are zero by model timing, not evidence of free operations. Cash tangible benefits consist of admin cash reductions and any separately supported payroll and equipment benefits. Costs already present in the comparison are not deducted again.')
    formula('Annual net benefit = annual cash tangible benefits − annual recurring system cost.\nNPV = −initial investment + Σ[annual net benefit in year t / (1 + discount rate)^t], t = 1 to 3.')
    h('11. Return on Investment and Payback Analysis')
    table('Table 10. Financial results and calculation basis',['Indicator','Calculation basis','Baseline result'],[
      ['Three-year ROI','(Sum of Years 1–3 net operating benefits − investment) / investment',UNKNOWN],
      ['Discounted benefit-cost ratio','PV of cash benefits / (initial investment + PV of recurring costs)',UNKNOWN],
      ['Payback period','Investment / constant positive annual net benefit; otherwise first cumulative crossing',UNKNOWN],
      ['Cash NPV','Initial outlay plus discounted operating cash flows',UNKNOWN],
      ['Productivity-inclusive economic NPV','Cash NPV plus PV of retained capacity value; not cash flow',UNKNOWN]],[22,55,23])
    p('Payback interpolation assumes benefits accrue evenly within each year. If the investment is not recovered within three years, the workbook reports that outcome explicitly. A zero investment produces a defined non-applicable ROI rather than division by zero. The benefit-cost ratio is discounted consistently with NPV. This makes the incremental comparison explicit rather than suggesting that all existing company costs are system benefits.')
    p('The workbook also computes the level annual cash benefit needed for zero NPV: annual recurring cost plus investment divided by the three-year discount-factor sum. For simple recovery in three years, the requirement is recurring cost plus one third of investment. These thresholds remain Insufficient Data until investment and annual recurring cost are known. They help assess a quotation without inventing a benefit forecast.')
    h('12. Interpretation of Results')
    p('The inventory evidence supports the operational need for better reporting and reconciliation. All three gap calculations match the supplied sheet. However, a gap is not a financial loss statement. The missing information prevents a reliable appraisal of the peso exposure, annual savings, implementation cost and recurring cost. The financial conclusion is therefore Not Yet Determined; the current data does not justify an affirmative or negative ROI claim.')
    p('The code review gives a credible mechanism for benefit: named custody and inspection evidence can make follow-up more focused; current inventory and PDF export can reduce duplicate reporting; and saved history can help explain recorded changes. These are capabilities, not measured savings. No code-only review can establish user compliance, actual deployment, production reliability, successful recovery or a reduction in payroll and purchasing expenditure.')
    p('Productivity and cash feasibility can lead to different conclusions. A system could improve reporting and release staff time while still requiring additional cash for hosting and maintenance. The supplemental economic NPV makes that distinction visible. It must not be reported as cash return. Similarly, a high replacement value exposure does not make the whole exposure a realizable yearly benefit.')
    h('13. Conclusion and Recommendations')
    p('SiteTrace has reviewed features that are relevant to the worksheet’s accountability problem. The evidence is sufficient to recommend a controlled reconciliation and operational pilot. It is insufficient to approve a financial return or guarantee recovery of 463 units. A final investment recommendation should follow completion of the workbook inputs and review of the resulting cash projection.')
    bullets([
      'Reconcile the three flagged categories. Confirm specifications and units, count at relevant sites, identify holders, inspect issue/transfer/return records and approve any adjustment with evidence. Classify unresolved items before recognizing a physical loss.',
      'Measure a representative baseline and matched pilot, suggested over four weekly reporting cycles. Record separate person-hours for monitoring, report preparation, reconciliation and follow-up. Include continued data entry and physical checking in proposed effort.',
      'Obtain a scoped remaining-work quotation and record any historical development spend separately. Confirm person-month allocations, training needs, existing devices and provider bundles. Do not copy another project’s teaching budget.',
      'Enter actual or approved estimated wages, supplies purchases, incremental connectivity, hosting, backup, maintenance and support. Record dates, source documents and whether each cost is estimated, confirmed, bundled or inapplicable.',
      'Credit payroll reduction only when an expense actually declines. Support equipment and duplicate-procurement claims with distinct annual events and avoid repeating a historical recovery as a recurring benefit.',
      'Confirm production authentication, server authorization, availability verification and scheduler readiness as part of implementation planning. Recalculate the workbook, test conservative benefit-realization scenarios, and update the Word/PDF snapshot before seeking investment approval.'
    ])
    page()
    h('14. Assumptions, Limitations, and References')
    sub('14.1 Assumptions and limitations')
    p('The analysis is dated 24 October 2026 in Asia/Manila. The inventory worksheet has no supplied observation date, signed count, valuation, individual custody listing or reconciliation outcome. Requirements for 23 categories, actual salaries, task timings, staffing, supplies expenditure, service quotations, confirmed losses and avoided purchases were not supplied. No live database was queried and no production configuration was changed.')
    table('Table 11. Modelling assumptions and exclusions',['Item','Treatment'],[
      ['Development duration','3 calendar months as an editable planning window; actual person-months remain unknown.'],
      ['Discount rate and horizon','8% editable convention, 3-year fixed projection; no claim that 8% is an approved company rate.'],
      ['Workload and wages','Proposed frequency and hourly rates link to existing baseline; staff/time remain editable.'],
      ['Timing / escalation','Year-end cash flow; within-year payback interpolation; constant-price defaults; editable year multipliers.'],
      ['Other financial effects','No tax shield, financing cost, terminal resale value or monetary theft-prevention benefit credited. Use consistently defined quotations.'],
      ['Exclusion defaults','0% payroll realization and excluded equipment claims are model policies, not verified zero expenses or zero losses.'],
      ['Source priority','Current implementation takes precedence over old feature prose; live deployment and measured performance remain unverified.'],
      ['Report and workbook','Report is a static baseline snapshot. Editing Excel does not update Word/PDF automatically. Rebuild or revise both together.']],[28,72])
    p('All peso financial inputs remain unknown unless a documented value is entered. No external equipment price or hosting price has been substituted for company evidence. The source photographs contain another project’s sample amounts of ₱178,500 and ₱20,500; these are excluded from SiteTrace totals. The photographs supply the academic layout only. [R3]')
    sub('14.2 References and source register')
    p('References are supplied primary materials and repository sources reviewed on 24 October 2026. The academic photographs do not provide a complete author, institution, publication year or textbook title. No missing bibliographic detail has been invented. Repository line anchors, hashes and revision are recorded in validation/source-evidence.json.')
    for eid,name,desc,path,anchor in EVIDENCE:
        p(f'[{eid}] {name}. '+(path+'. ' if path else '')+desc)
    sub('14.3 Workbook completion guide')
    p('Start with Assumptions and References. Complete blue inputs and choose a treatment for every cost line. Enter measured task data for both workflows, document supplies and administrative cash costs, and keep equipment claims excluded until supported. Inventory replacement prices are optional exposure inputs. Review Tangible Benefits, Financial Analysis and Executive Dashboard after recalculation. Confirm negative values, no-recovery results and missing-data messages before updating this report.')

def build_docx():
    from docx import Document
    from docx.shared import Mm, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    doc=Document();s=doc.sections[0]
    s.page_width=Mm(210);s.page_height=Mm(297)
    s.top_margin=Mm(19);s.bottom_margin=Mm(19);s.left_margin=Mm(19);s.right_margin=Mm(19)
    s.header_distance=Mm(8);s.footer_distance=Mm(8)
    normal=doc.styles['Normal'];normal.font.name='Calibri';normal.font.size=Pt(10.5)
    normal.paragraph_format.space_after=Pt(7);normal.paragraph_format.line_spacing=1.10
    for name,size in [('Title',32),('Heading 1',16),('Heading 2',12)]:
        st=doc.styles[name];st.font.name='Calibri';st.font.size=Pt(size);st.font.color.rgb=RGBColor.from_string(NAVY)
        st.paragraph_format.keep_with_next=True
    doc.styles['Caption'].font.size=Pt(9);doc.styles['Caption'].font.color.rgb=RGBColor.from_string(GRAY)
    headerp=s.header.paragraphs[0];headerp.text='SITETRACE  /  IT303 SYSTEMS ANALYSIS AND DESIGN';headerp.style='Caption'
    fp=s.footer.paragraphs[0];fp.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    fp.add_run('24 October 2026  •  Page ')
    for instr in ['PAGE','NUMPAGES']:
        if instr=='NUMPAGES':fp.add_run(' of ')
        field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),instr);fp._p.append(field)
    for run in fp.runs:run.font.size=Pt(8)
    doc.add_paragraph('MCPA / SITETRACE','Subtitle')
    doc.add_paragraph('Cost-Benefit\nAnalysis','Title')
    doc.add_paragraph('Equipment accountability and inventory management','Subtitle')
    doc.add_paragraph('IT303 • Systems Analysis and Design\nPrepared 24 October 2026 • Philippines')
    doc.add_paragraph('\n758 recorded units  |  26 categories  |  463 unreconciled units')
    doc.add_paragraph('Assessment status: Financial feasibility not yet determined. The inventory gap supports reconciliation and a measured pilot. It does not establish confirmed losses or a guaranteed return.')
    doc.add_paragraph('Companion workbook: SiteTrace_Cost_Benefit_Analysis.xlsx\nFinancial inputs are editable; this report is a dated baseline snapshot.','Caption')
    doc.add_paragraph('Contents','Heading 1')
    for kind,item in BLOCKS:
        if kind=='h':doc.add_paragraph(item,'Caption')
    doc.add_page_break()
    for kind,item in BLOCKS:
        if kind=='page':doc.add_page_break()
        elif kind in ['p','formula']:
            pp=doc.add_paragraph(item)
            if kind=='formula':
                pp.paragraph_format.left_indent=Mm(3)
                for run in pp.runs:run.font.color.rgb=RGBColor.from_string(TEAL);run.font.size=Pt(10)
        elif kind=='h':doc.add_paragraph(item,'Heading 1')
        elif kind=='sub':doc.add_paragraph(item,'Heading 2')
        elif kind=='bullets':
            for line in item:doc.add_paragraph(line,'List Bullet')
        elif kind=='table':
            caption,heads,rows,widths=item
            cp=doc.add_paragraph(caption,'Caption');cp.paragraph_format.keep_with_next=True
            t=doc.add_table(rows=1,cols=len(heads));t.style='Table Grid';t.autofit=False
            widths=widths or [100/len(heads)]*len(heads)
            for i,width in enumerate(widths):t.columns[i].width=Mm(172*width/100)
            for i,text in enumerate(heads):t.rows[0].cells[i].text=text
            for row in rows:
                cells=t.add_row().cells
                for i,text in enumerate(row):cells[i].text=str(text)
            for ri,row in enumerate(t.rows):
                trpr=row._tr.get_or_add_trPr();cant=OxmlElement('w:cantSplit');trpr.append(cant)
                if ri==0:
                    repeat=OxmlElement('w:tblHeader');trpr.append(repeat)
                for ci,cc in enumerate(row.cells):
                    cc.width=Mm(172*widths[ci]/100)
                    tcpr=cc._tc.get_or_add_tcPr();sh=OxmlElement('w:shd');sh.set(qn('w:fill'),NAVY if ri==0 else ('F1F5F7' if ri%2==0 else 'FFFFFF'));tcpr.append(sh)
                    for pp in cc.paragraphs:
                        pp.paragraph_format.space_after=Pt(3);pp.paragraph_format.space_before=Pt(3);pp.paragraph_format.line_spacing=1.03
                        for run in pp.runs:
                            run.font.size=Pt(9);run.bold=ri==0
                            if ri==0:run.font.color.rgb=RGBColor(255,255,255)
            doc.add_paragraph('').paragraph_format.space_after=Pt(1)
    settings=doc.settings.element
    upd=OxmlElement('w:updateFields');upd.set(qn('w:val'),'true');settings.append(upd)
    doc.core_properties.title='SiteTrace Cost-Benefit Analysis'
    doc.core_properties.subject='IT303; actual inventory baseline and conditional financial appraisal'
    doc.core_properties.author='SiteTrace Academic Documentation'
    doc.core_properties.created=datetime(2026,10,24,tzinfo=timezone.utc)
    path=OUT/'SiteTrace_Cost_Benefit_Report.docx';doc.save(path)
    return path

def build_pdf():
    from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.enums import TA_LEFT
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from xml.sax.saxutils import escape
    fontdir=Path('C:/Windows/Fonts')
    for name,file in [('Arial','arial.ttf'),('Arial-Bold','arialbd.ttf'),('Arial-Italic','ariali.ttf')]:pdfmetrics.registerFont(TTFont(name,str(fontdir/file)))
    pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold',italic='Arial-Italic',boldItalic='Arial-Bold')
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name='BodyCBA',fontName='Arial',fontSize=10,leading=13,spaceAfter=6,textColor=colors.HexColor('#18202A')))
    styles.add(ParagraphStyle(name='H1CBA',fontName='Arial-Bold',fontSize=15,leading=19,spaceBefore=10,spaceAfter=9,keepWithNext=True,textColor=colors.HexColor('#'+NAVY)))
    styles.add(ParagraphStyle(name='H2CBA',fontName='Arial-Bold',fontSize=11.5,leading=15,spaceBefore=7,spaceAfter=6,keepWithNext=True,textColor=colors.HexColor('#'+NAVY)))
    styles.add(ParagraphStyle(name='SmallCBA',fontName='Arial',fontSize=8.6,leading=11,spaceAfter=4,textColor=colors.HexColor('#'+GRAY)))
    styles.add(ParagraphStyle(name='CaptionCBA',fontName='Arial',fontSize=8.6,leading=11,spaceAfter=4,keepWithNext=True,textColor=colors.HexColor('#'+GRAY)))
    styles.add(ParagraphStyle(name='CellCBA',fontName='Arial',fontSize=8.4,leading=10.5,textColor=colors.HexColor('#18202A')))
    styles.add(ParagraphStyle(name='HeadCellCBA',fontName='Arial-Bold',fontSize=8.4,leading=10.5,textColor=colors.white))
    styles.add(ParagraphStyle(name='FormulaCBA',fontName='Arial',fontSize=9.5,leading=14,spaceAfter=9,leftIndent=9,textColor=colors.HexColor('#'+TEAL)))
    def para(text,style='BodyCBA'):return Paragraph(escape(str(text)).replace('\n','<br/>'),styles[style])
    path=OUT/'SiteTrace_Cost_Benefit_Report.pdf'
    document=SimpleDocTemplate(str(path),pagesize=A4,rightMargin=54,leftMargin=54,topMargin=50,bottomMargin=48,title='SiteTrace Cost-Benefit Analysis',author='SiteTrace Academic Documentation')
    story=[]
    story+=[Spacer(1,18),para('MCPA / SITETRACE','H2CBA'),Spacer(1,14)]
    cover=ParagraphStyle(name='Cover',fontName='Arial-Bold',fontSize=35,leading=41,textColor=colors.HexColor('#'+NAVY),spaceAfter=18)
    story+=[Paragraph('Cost-Benefit<br/>Analysis',cover),para('Equipment accountability and inventory management'),para('IT303 • Systems Analysis and Design\nPrepared 24 October 2026 • Philippines'),Spacer(1,9),para('758 recorded units  |  26 categories  |  463 unreconciled units','H2CBA')]
    story+=[para('Assessment status: Financial feasibility not yet determined. The inventory gap supports reconciliation and a measured pilot. It does not establish confirmed losses or a guaranteed return.'),para('Companion workbook: SiteTrace_Cost_Benefit_Analysis.xlsx\nFinancial inputs are editable; this report is a dated baseline snapshot.','SmallCBA'),Spacer(1,10),para('Contents','H2CBA')]
    for kind,item in BLOCKS:
        if kind=='h':story.append(para(item,'SmallCBA'))
    story.append(PageBreak())
    for kind,item in BLOCKS:
        if kind=='page':story.append(PageBreak())
        elif kind in ['p','formula','h','sub']:story.append(para(item,{'p':'BodyCBA','formula':'FormulaCBA','h':'H1CBA','sub':'H2CBA'}[kind]))
        elif kind=='bullets':
            for line in item:story.append(para('• '+line))
        elif kind=='table':
            caption,heads,rows,widths=item;story.append(para(caption,'CaptionCBA'))
            widths=widths or [100/len(heads)]*len(heads)
            data=[[para(x,'HeadCellCBA') for x in heads]]+[[para(x,'CellCBA') for x in row] for row in rows]
            t=Table(data,colWidths=[document.width*w/100 for w in widths],repeatRows=1,hAlign='LEFT')
            t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#'+NAVY)),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F1F5F7')]),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#CBD4DA')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5)]))
            story.extend([t,Spacer(1,8)])
    def decorate(canvas,doc):
        canvas.saveState();canvas.setFont('Arial',7.5);canvas.setFillColor(colors.HexColor('#'+GRAY))
        canvas.drawString(54,A4[1]-29,'SITETRACE  /  IT303 SYSTEMS ANALYSIS AND DESIGN')
        canvas.drawString(54,27,'24 October 2026 • Evidence-based baseline • Financial inputs incomplete')
        canvas.drawRightString(A4[0]-54,27,f'Page {doc.page}')
        canvas.restoreState()
    document.build(story,onFirstPage=decorate,onLaterPages=decorate)
    return path

def calculate(path):
    import formulas
    model=formulas.ExcelModel().loads(str(path)).finish()
    solution=model.calculate()
    values={}
    for key,rng in solution.items():
        if not hasattr(rng,'ranges') or not hasattr(rng,'value'):continue
        for spec in rng.ranges:
            if 'sheet' not in spec:continue
            arr=rng.value
            if len(rng.ranges)!=1:continue
            for i,row in enumerate(arr.tolist()):
                for j,value in enumerate(row):
                    from openpyxl.utils import get_column_letter
                    addr=get_column_letter(spec['n1']+j)+str(int(spec['r1'])+i)
                    if hasattr(value,'item'):value=value.item()
                    values[(spec['sheet'].upper(),addr)]=value
    return values

def vget(values,sheet,addr):return values[(sheet.upper(),addr)]

def write_caches(path,values):
    """Preserve styles/charts and cache evaluated results for non-calculating readers."""
    ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    main=ns['s']
    patched=0
    temp=path.with_suffix('.cached.xlsx')
    with zipfile.ZipFile(path) as src,zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            data=src.read(item.filename)
            match=re.fullmatch(r'xl/worksheets/sheet(\d+)\.xml',item.filename)
            if match:
                wsname=SHEETS[int(match[1])-1];root=ET.fromstring(data)
                for c in root.findall('.//s:sheetData/s:row/s:c',ns):
                    if c.find('s:f',ns) is None:continue
                    addr=c.attrib['r'];key=(wsname.upper(),addr)
                    assert key in values,(wsname,addr,'missing formula evaluation')
                    value=values[key]
                    for old in c.findall('s:v',ns):c.remove(old)
                    elem=ET.SubElement(c,'{'+main+'}v')
                    if isinstance(value,bool):c.set('t','b');elem.text='1' if value else '0'
                    elif isinstance(value,(int,float)):
                        assert math.isfinite(value),(key,value)
                        c.pop('t',None) if hasattr(c,'pop') else c.attrib.pop('t',None)
                        elem.text=str(value)
                    else:
                        text=str(value) if value is not None else ''
                        assert text not in ['#REF!','#VALUE!','#DIV/0!','#NAME?','#N/A','#NUM!','#SPILL!'],(key,text)
                        c.set('t','str');elem.text=text
                    patched+=1
                data=ET.tostring(root,encoding='utf-8',xml_declaration=True)
            dst.writestr(item,data)
    temp.replace(path)
    return patched

def layout_workbook(path,values):
    from PIL import ImageFont
    from openpyxl.cell.cell import MergedCell
    book=load_workbook(path)
    fpath='C:/Windows/Fonts/arial.ttf'
    for ws in book:
        merge_map={(r.min_row,r.min_col):r for r in ws.merged_cells.ranges}
        for row in ws:
            required=ws.row_dimensions[row[0].row].height or 19
            for c in row:
                if isinstance(c,MergedCell):continue
                value=vget(values,ws.title,c.coordinate) if c.data_type=='f' else c.value
                if value is None or value=='':continue
                span=merge_map.get((c.row,c.column))
                cols=range(span.min_col,span.max_col+1) if span else [c.column]
                width=sum(ws.column_dimensions[__import__('openpyxl').utils.get_column_letter(n)].width*7+5 for n in cols)-10
                size=c.font.sz or 10;font=ImageFont.truetype(fpath,math.ceil(size*96/72))
                text=display(value,c.number_format)
                lines=wrap(text,font,width)
                required=max(required,len(lines)*(size*1.45)+10)
            ws.row_dimensions[row[0].row].height=round(required,1)
    book.save(path)

def display(value,fmt=None):
    if value is None:return ''
    if isinstance(value,(int,float)) and not isinstance(value,bool):
        if fmt and '₱' in fmt:return f'₱{value:,.2f}'
        if fmt and '%' in fmt:return f'{value*100:,.1f}%'
        if fmt and 'years' in fmt:return f'{value:.2f} years'
        if fmt=='0.0000':return f'{value:.4f}'
        if fmt==NUM:return f'{value:,.2f}'
        if value==int(value):return f'{int(value):,}'
        return f'{value:,.2f}'
    return str(value)

def wrap(text,font,width):
    lines=[]
    for para in str(text).split('\n'):
        line=''
        for word in para.split():
            candidate=(line+' '+word).strip()
            if font.getlength(candidate)>width and line:lines.append(line);line=word
            else:line=candidate
            # Long repository paths need character wrapping rather than overflow.
            while font.getlength(line)>width and len(line)>1:
                cut=len(line)-1
                while cut>1 and font.getlength(line[:cut])>width:cut-=1
                lines.append(line[:cut]);line=line[cut:]
        lines.append(line)
    return lines or ['']

def workbook_previews(path,values,only=None):
    from PIL import Image,ImageDraw,ImageFont
    from openpyxl.cell.cell import MergedCell
    from openpyxl.utils import get_column_letter
    book=load_workbook(path);results=[]
    fontpath='C:/Windows/Fonts/arial.ttf';boldpath='C:/Windows/Fonts/arialbd.ttf'
    for si,ws in enumerate(book,1):
        if only and si not in only:continue
        cols=ws.max_column;last=int(re.search(r'(\d+)$',str(ws.print_area)).group(1)) if False else ws.max_row
        # Print area is bounded; empty trailing rows are intentional whitespace.
        widths=[ws.column_dimensions[get_column_letter(c)].width*7+5 for c in range(1,cols+1)]
        scale=1400/sum(widths);heights=[(ws.row_dimensions[r].height or 19)*96/72*scale for r in range(1,last+1)]
        xs=[20];ys=[20]
        for width in widths:xs.append(xs[-1]+width*scale)
        for height in heights:ys.append(ys[-1]+height)
        im=Image.new('RGB',(1440,math.ceil(ys[-1]+34)),'white');d=ImageDraw.Draw(im)
        merges={(r.min_row,r.min_col):r for r in ws.merged_cells.ranges}
        for row in ws:
            for c in row:
                if isinstance(c,MergedCell):continue
                span=merges.get((c.row,c.column));endcol=span.max_col if span else c.column
                x,y=xs[c.column-1],ys[c.row-1];right,bottom=xs[endcol],ys[c.row]
                if c.fill.fgColor.type=='rgb' and c.fill.fgColor.rgb:
                    fill='#'+str(c.fill.fgColor.rgb)[-6:]
                    if fill!='#000000':d.rectangle([x,y,right,bottom],fill=fill)
                val=vget(values,ws.title,c.coordinate) if c.data_type=='f' else c.value
                if val is None:continue
                color='#'+str(c.font.color.rgb)[-6:] if c.font.color and c.font.color.type=='rgb' else '#18202A'
                font=ImageFont.truetype(boldpath if c.font.bold else fontpath,max(9,round((c.font.sz or 10)*96/72*scale)))
                lines=wrap(display(val,c.number_format),font,right-x-10)
                yy=y+4
                for line in lines:d.text((x+5,yy),line,font=font,fill=color);yy+=font.size*1.17
                d.line([(x,bottom),(right,bottom)],fill='#D7E0E5',width=1)
        if si==10:
            chart_top=ys[20]+12;chart_left=230;chart_right=1320
            d.text((chart_left,chart_top),'Reported gaps by equipment category',font=ImageFont.truetype(boldpath,20),fill='#18364E')
            for i,(name,gap) in enumerate([('Round shovel',19),('GI Pipes',75),('Swivel Clamp',369)]):
                yy=chart_top+48+i*58
                d.text((30,yy+5),name,font=ImageFont.truetype(fontpath,17),fill='#18364E')
                x2=chart_left+(chart_right-chart_left)*gap/400
                d.rectangle([chart_left,yy,x2,yy+28],fill='#146B69');d.text((x2+8,yy+5),str(gap),font=ImageFont.truetype(boldpath,16),fill='#18364E')
        target=VAL/f'worksheet-{si:02d}.png';im.save(target)
        # Estimated printed text size after width fit, separate from native Office rendering.
        printable_pixels=(297-2*.28*25.4)/25.4*96
        factor=min(1,printable_pixels/sum(widths))
        results.append({'sheet':ws.title,'preview':target.name,'minimum_body_font_after_width_fit_pt':round(10*factor,2),'print_area':str(ws.print_area),'manual_row_breaks':[b.id for b in ws.row_breaks.brk]})
    return results

def evidence_register():
    entries=[]
    for eid,name,desc,path,anchor in EVIDENCE:
        rec={'id':eid,'title':name,'description':desc}
        if path:
            file=ROOT/path;data=file.read_bytes();text=data.decode('utf-8-sig')
            line=next((i for i,x in enumerate(text.splitlines(),1) if anchor and anchor in x),1)
            rec.update(path=path,line=line,sha256=hashlib.sha256(data).hexdigest(),anchor=anchor)
        entries.append(rec)
    attached=[
      ('R1','C:/Users/Roland Carl/Downloads/dc83a570-9cc7-472d-be16-137f87d2c5e9.jpg'),
      ('R3','C:/Users/Roland Carl/Downloads/4402c8cb-1525-479f-ba0b-8aa5a8a23ba7.jpg'),
      ('R3','C:/Users/Roland Carl/Downloads/006f9d77-0cab-47a5-b65f-bcf640b8e2df.jpg'),
      ('R3','C:/Users/Roland Carl/Downloads/7a1bd893-e0fc-4dba-ac70-24ada0c81048.jpg')]
    for eid,path in attached:
        file=Path(path)
        entries.append({'id':eid,'attachment':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'role':'Supplied data / visual reference; not an instruction source'})
    commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    (VAL/'source-evidence.json').write_text(json.dumps({'review_date':'2026-10-24','timezone':'Asia/Manila','git_revision':commit,'sources':entries},indent=2),encoding='utf-8')
    with (OUT/'source'/'inventory-baseline.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f);writer.writerow(['No.','Equipment Description','Recorded Qty.','Need to Comply','Missing or No Report'])
        for i,row in enumerate(INV,1):writer.writerow([i,*row])
    return entries

def run_financial_checks(path):
    import tempfile
    results=[]
    def record(label,checks):
        assert all(checks.values()),(label,checks)
        results.append({'case':label,'checks':checks,'status':'passed'})
    def near(a,b):return isinstance(a,(int,float)) and math.isclose(a,b,rel_tol=1e-9,abs_tol=1e-7)
    with tempfile.TemporaryDirectory(prefix='sitettrace-cba-check-') as folder:
        book=load_workbook(path)
        # Fully synthetic fixture; not a company estimate and never shipped as a projection.
        for r in list(range(7,12))+list(range(16,20))+list(range(24,30)):book[SHEETS[1]][f'F{r}']='Not applicable'
        book[SHEETS[1]]['F7']='Estimated';book[SHEETS[1]]['B7']=10000;book[SHEETS[1]]['C7']=2
        for r in range(7,15):book[SHEETS[2]][f'F{r}']='Not applicable'
        for a,v in {'F7':'Estimated','B7':1000,'C7':1,'D7':12}.items():book[SHEETS[2]][a]=v
        for name,hours in [(SHEETS[3],2),(SHEETS[4],1)]:
            ws=book[name]
            for r in range(7,11):
                ws[f'B{r}']=hours;ws[f'C{r}']=1;ws[f'H{r}']='Estimated'
                if name==SHEETS[3]:ws[f'D{r}']=52;ws[f'E{r}']=100
            for r in range(17,25):ws[f'F{r}']='Not applicable'
            for r,qty in [(17,5 if name==SHEETS[3] else 1),(22,20 if name==SHEETS[3] else 5)]:
                for a,val in {f'B{r}':100,f'C{r}':qty,f'D{r}':12,f'F{r}':'Estimated'}.items():ws[a]=val
        def calc_fixture(label):
            fp=Path(folder)/(label+'.xlsx');book.save(fp);return calculate(fp)
        vals=calc_fixture('constant');g=lambda s,c:vget(vals,s,c)
        annuity=sum(1/1.08**t for t in [1,2,3]);expected_npv=-20000+10800*annuity
        record('constant positive cash flows',{
          'investment_20000':near(g(SHEETS[7],'B13'),20000),'recurring_12000':near(g(SHEETS[7],'B14'),12000),
          'cash_benefits_22800':near(g(SHEETS[7],'B15'),22800),'noncash_productivity_20800':near(g(SHEETS[7],'B16'),20800),
          'ROI_62_percent':near(g(SHEETS[7],'B34'),.62),'NPV_independent':near(g(SHEETS[7],'B36'),expected_npv),
          'payback_1_85185_years':near(g(SHEETS[7],'B37'),20000/10800),
          'discounted_BCR_independent':near(g(SHEETS[7],'B35'),22800*annuity/(20000+12000*annuity)),
          'cashflow_cumulative_12400':near(g(SHEETS[7],'E25'),12400),
          'economic_NPV_independent':near(g(SHEETS[7],'B47'),expected_npv+20800*annuity)})
        book[SHEETS[7]]['B9']=.5;book[SHEETS[7]]['D9']=1.5
        vals=calc_fixture('variable')
        record('variable annual realization and cumulative payback',{
          'first_year_negative':near(g(SHEETS[7],'C24'),-600),'last_year_positive':near(g(SHEETS[7],'E24'),22200),
          'payback_interpolated':near(g(SHEETS[7],'B37'),2+9800/22200),
          'NPV_independent':near(g(SHEETS[7],'B36'),-20000-600/1.08+10800/1.08**2+22200/1.08**3)})
        for a in ['B9','C9','D9']:book[SHEETS[7]][a]=0
        vals=calc_fixture('negative')
        record('negative net benefit / no recovery',{'no_recovery':g(SHEETS[7],'B37')=='Not recovered in 3 years','negative_ROI':g(SHEETS[7],'B34')<0,'negative_NPV':g(SHEETS[7],'B36')<0})
        for a in ['B9','C9','D9']:book[SHEETS[7]][a]=1
        book[SHEETS[1]]['B7']=None
        vals=calc_fixture('missing')
        record('missing investment input propagates',{'investment_unknown':g(SHEETS[7],'B13')==UNKNOWN,'ROI_unknown':g(SHEETS[7],'B34')==UNKNOWN,'NPV_unknown':g(SHEETS[7],'B36')==UNKNOWN,'dashboard_unknown':g(SHEETS[9],'E6')==UNKNOWN})
        book[SHEETS[1]]['B7']=10000
        for row,price in [(8,500),(23,100),(32,80)]:book[SHEETS[0]][f'H{row}']=price
        vals=calc_fixture('exposure')
        record('exposure is excluded from annual cash benefits',{'exposure_46520':near(g(SHEETS[0],'I34'),46520),'cash_benefits_unchanged':near(g(SHEETS[7],'B15'),22800),'equipment_credit_zero':near(g(SHEETS[5],'E32'),0)})
        for r in range(16,20):book[SHEETS[5]][f'G{r}']=.5
        vals=calc_fixture('payroll')
        record('payroll realization does not double-count productivity',{'cash_payroll_10400':near(g(SHEETS[5],'H23'),10400),'retained_capacity_10400':near(g(SHEETS[5],'I24'),10400),'combined_productivity_20800':near(g(SHEETS[5],'H23')+g(SHEETS[5],'I24'),20800),'cash_benefits_33200':near(g(SHEETS[7],'B15'),33200)})
        book[SHEETS[1]]['B7']=0
        vals=calc_fixture('zero')
        record('explicit zero investment is supported',{'investment_zero':near(g(SHEETS[7],'B13'),0),'ROI_defined':g(SHEETS[7],'B34')=='Not applicable: zero investment','payback_immediate':near(g(SHEETS[7],'B37'),0)})
    return results

def document_validation(docx_path,pdf_path):
    from docx import Document
    import pymupdf
    doc=Document(docx_path)
    text='\n'.join(pp.text for pp in doc.paragraphs)+'\n'+'\n'.join(cc.text for t in doc.tables for row in t.rows for cc in row.cells)
    pdf=pymupdf.open(pdf_path)
    for prior in VAL.glob('report-page-*.png'):
        match=re.fullmatch(r'report-page-(\d+)\.png',prior.name)
        if match and int(match[1])>len(pdf):prior.unlink()
    pdftext='\n'.join(pg.get_text() for pg in pdf)
    checks={'docx_A4':abs(doc.sections[0].page_width.mm-210)<.1 and abs(doc.sections[0].page_height.mm-297)<.1,
      'fourteen_numbered_sections':len([p for p in doc.paragraphs if p.style.name=='Heading 1' and re.match(r'^\d+\.',p.text)])==14,
      'eleven_numbered_tables':len(doc.tables)==11,
      'all_inventory_descriptions':all(row[0] in text for row in INV),
      'baseline_figures_in_both':all(value in text and value in pdftext for value in ['758','463','369','75','19']),
      'financial_missing_in_both':UNKNOWN in text and UNKNOWN in pdftext,
      'no_blank_PDF_pages':all(len(pg.get_text().strip())>100 for pg in pdf),
      'PDF_A4':all(abs(pg.rect.width-595.276)<1 and abs(pg.rect.height-841.89)<1 for pg in pdf)}
    bounds=[]
    for i,pg in enumerate(pdf):
        outside=[]
        for b in pg.get_text('dict')['blocks']:
            if 'lines' not in b:continue
            for line in b['lines']:
                for span in line['spans']:
                    x0,y0,x1,y1=span['bbox']
                    if x0<0 or y0<0 or x1>pg.rect.width+.5 or y1>pg.rect.height+.5:outside.append(span['text'])
        bounds.append({'page':i+1,'characters':len(pg.get_text()),'text_outside_page':outside})
        pg.get_pixmap(matrix=pymupdf.Matrix(1.1,1.1)).save(VAL/f'report-page-{i+1:02d}.png')
    checks['PDF_text_within_pages']=not any(p['text_outside_page'] for p in bounds)
    assert all(checks.values()),checks
    # A contact sheet makes every PDF page available for a single visual pass.
    from PIL import Image,ImageDraw,ImageFont
    thumbs=[]
    for i in range(len(pdf)):
        image=Image.open(VAL/f'report-page-{i+1:02d}.png').convert('RGB');image.thumbnail((292,420))
        tile=Image.new('RGB',(312,450),'#E8EDF0');tile.paste(image,((312-image.width)//2,12))
        ImageDraw.Draw(tile).text((12,430),f'Page {i+1}',font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',12),fill='#18364E');thumbs.append(tile)
    rows=math.ceil(len(thumbs)/4);contact=Image.new('RGB',(1248,450*rows),'white')
    for i,tile in enumerate(thumbs):contact.paste(tile,((i%4)*312,(i//4)*450))
    contact.save(VAL/'report-contact-sheet.png')
    return {'checks':checks,'PDF_pages':len(pdf),'page_geometry':bounds,'Word_native_render':'Unavailable: Office COM returned 80070520 in this Windows session. Word package structurally checked; PDF uses the same shared content through ReportLab. Pagination may differ.'}

def structural_validation(path,values):
    book=load_workbook(path,data_only=False);cached=load_workbook(path,data_only=True)
    expected=[(name,qty,req,gap) for name,qty,req,gap in INV]
    got=[tuple(book[SHEETS[0]].cell(r,c).value for c in [2,3,4,5]) for r in range(7,33)]
    refs=[];formulas_count=0
    for ws in book:
        for row in ws:
            for c in row:
                if c.data_type!='f':continue
                formulas_count+=1
                for target,addr in re.findall(r"'([^']+)'!([A-Z]+\d+(?::[A-Z]+\d+)?)",c.value):
                    assert target in book.sheetnames,(ws.title,c.coordinate,target)
                    refs.append([ws.title,c.coordinate,target,addr])
                assert '#REF!' not in c.value
                assert cached[ws.title][c.coordinate].value is not None or vget(values,ws.title,c.coordinate)=='',(ws.title,c.coordinate)
    checks={'exact_26_rows':got==expected,'recorded_total_758':cached[SHEETS[0]]['C34'].value==758,
      'reported_gap_total_463':cached[SHEETS[0]]['E34'].value==463,
      'all_three_gaps_match':all(cached[SHEETS[0]][f'G{r}'].value=='Match' for r in [8,23,32]),
      'unprovided_gaps_preserved_blank':sum(book[SHEETS[0]][f'E{r}'].value is None for r in range(7,33))==23,
      'ten_sheets':book.sheetnames==SHEETS,
      'prices_all_unknown':all(book[SHEETS[0]][f'H{r}'].value is None for r in range(7,33)),
      'exposure_unverified':cached[SHEETS[0]]['I34'].value=='Unverified',
      'investment_unknown':cached[SHEETS[7]]['B13'].value==UNKNOWN,
      'recurring_unknown':cached[SHEETS[7]]['B14'].value==UNKNOWN,
      'benefits_unknown':cached[SHEETS[7]]['B15'].value==UNKNOWN,
      'financial_outputs_unknown':all(cached[SHEETS[7]][f'B{r}'].value==UNKNOWN for r in [34,35,36,37,38,39,40,47]),
      'dashboard_inventory_correct':all(cached[SHEETS[9]][a].value==v for a,v in [('B6',758),('B7',26),('B8',3),('B9',463)]),
      'cached_formula_count_complete':formulas_count==sum(c.data_type=='f' for ws in book for row in ws for c in row),
      'no_external_workbook_links':len(book._external_links)==0,
      'A4_all_sheets':all(str(ws.page_setup.paperSize)==str(ws.PAPERSIZE_A4) for ws in book)}
    assert all(checks.values()),checks
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        for f in z.namelist():
            if f.endswith('.xml'):ET.fromstring(z.read(f))
    return {'checks':checks,'formula_count':formulas_count,'cross_sheet_references_checked':len(refs),'editable_inputs':len(INPUTS),'chart_count':sum(len(ws._charts) for ws in book)}

def write_readme(report):
    text=f'''# SiteTrace cost-benefit analysis

Prepared 24 October 2026 (Asia/Manila) for IT303 Systems Analysis and Design.

## Deliverables

- `SiteTrace_Cost_Benefit_Analysis.xlsx`: ten sheets, editable assumptions, {report['workbook']['formula_count']} evaluated/cached formulas, cross-sheet links, inventory gap chart and A4 print settings.
- `SiteTrace_Cost_Benefit_Report.docx`: academic report with 14 sections and 11 numbered tables.
- `SiteTrace_Cost_Benefit_Report.pdf`: {report['documents']['PDF_pages']}-page PDF edition from the same content model.

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
'''
    (OUT/'README.md').write_text(text,encoding='utf-8')
    (OUT/'source'/'requirements.txt').write_text('openpyxl==3.1.5\npython-docx==1.2.0\nreportlab==5.1.0\npillow==13.0.0\nformulas==1.3.4\npymupdf==2.0\n',encoding='utf-8')

def main():
    OUT.mkdir(parents=True,exist_ok=True);VAL.mkdir(exist_ok=True)
    evidence_register()
    path=make_workbook();print('Workbook built',flush=True)
    values=calculate(path);layout_workbook(path,values)
    cached=write_caches(path,values);print(f'{cached} formulas evaluated and cached',flush=True)
    structure=structural_validation(path,values)
    scenarios=run_financial_checks(path);print('Financial scenarios passed',flush=True)
    previews=workbook_previews(path,values)
    report_content();docx=build_docx();pdf=build_pdf();print('Word and PDF generated',flush=True)
    documents=document_validation(docx,pdf)
    report={'prepared_date':'2026-10-24','timezone':'Asia/Manila','inventory':{'categories':26,'recorded_units':TOTAL,'flagged_categories':3,'reported_gap_units':GAP,'gap_classification':'Unreconciled; not confirmed losses'},
      'workbook':structure,'financial_synthetic_checks':scenarios,'worksheet_layout':previews,'documents':documents,
      'scope':'Read-only application review. No app/schema/configuration changes or live database access.',
      'financial_baseline':'Insufficient Data; all financial inputs unverified except explicit modelling conventions/exclusions.'}
    write_readme(report)
    report['artifacts']=[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [path,docx,pdf]]
    (VAL/'validation-report.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
    print(json.dumps({'recorded_units':TOTAL,'reported_gap_units':GAP,'formulas':cached,'financial_cases':len(scenarios),'PDF_pages':documents['PDF_pages'],'files':[str(path),str(docx),str(pdf)]},indent=2),flush=True)

if __name__=='__main__':main()
