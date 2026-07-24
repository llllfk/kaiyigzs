import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [inputPath, outputPath, artifactPath] = process.argv.slice(2);
const { Workbook, SpreadsheetFile } = await import(pathToFileURL(artifactPath).href);
const data = JSON.parse(await fs.readFile(inputPath, "utf8"));
const wb = Workbook.create();
const navy = "#17324D", pale = "#EAF3F3", border = "#D8E0E6";
const header = (range) => { range.format.fill = navy; range.format.font = { bold: true, color: "#FFFFFF" }; range.format.rowHeight = 26; range.format.wrapText = false; range.format.horizontalAlignment = "center"; range.format.verticalAlignment = "center"; };
const title = (sheet, text, cols) => { sheet.showGridLines = false; sheet.getRange(`A1:${cols}1`).merge(); sheet.getRange("A1").values = [[text]]; sheet.getRange(`A1:${cols}1`).format = { fill: navy, font: { bold: true, color: "#FFFFFF", size: 18 }, rowHeight: 34, verticalAlignment: "center" }; };
const table = (sheet, startRow, headers, rows, formats = {}) => {
  const endCol = col(headers.length); const endRow = startRow + Math.max(rows.length, 1);
  sheet.getRange(`A${startRow}:${endCol}${startRow}`).values = [headers]; header(sheet.getRange(`A${startRow}:${endCol}${startRow}`));
  if (rows.length) sheet.getRange(`A${startRow + 1}:${endCol}${endRow}`).values = rows;
  sheet.getRange(`A${startRow}:${endCol}${endRow}`).format.borders = { preset: "all", style: "thin", color: border };
  if (rows.length) sheet.getRange(`A${startRow + 1}:${endCol}${endRow}`).format.wrapText = true;
  for (const [letter, fmt] of Object.entries(formats)) sheet.getRange(`${letter}${startRow + 1}:${letter}${endRow}`).setNumberFormat(fmt);
  sheet.freezePanes.freezeRows(startRow); sheet.getRange(`A${startRow}:${endCol}${endRow}`).format.autofitColumns();
  for (let i=0;i<headers.length;i++) sheet.getRangeByIndexes(0,i,endRow,1).format.columnWidth = Math.min(sheet.getRangeByIndexes(0,i,endRow,1).format.columnWidth || 12, 28);
};
function col(n) { let s=""; while(n){ n--; s=String.fromCharCode(65+n%26)+s; n=Math.floor(n/26); } return s; }
const date = v => v ? new Date(v) : null;
const num = v => Number(v || 0);
const label = (map, value) => map[value] || value || "-";
const customerStatus = { active:"跟进中", paused:"暂停", invalid:"无效" };
const opportunityStage = { lead:"新线索", contact:"沟通中", proposal:"报价中", won:"成交", lost:"流失" };
const quoteStatus = { draft:"草稿", pending_approval:"待审批", approved:"已通过", confirmed:"客户已确认", rejected:"已驳回", void:"已作废" };
const followType = { call:"电话", wechat:"微信", visit:"拜访", email:"邮件" };
const roleLabel = { sales:"销售", sales_manager:"销售经理", company_admin:"公司管理员" };
const periodEnd = new Date(`${data.to}T00:00:00`); periodEnd.setDate(periodEnd.getDate()-1);
const periodEndText = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth()+1).padStart(2,"0")}-${String(periodEnd.getDate()).padStart(2,"0")}`;
const salesRows = Array.isArray(data.sales) ? data.sales : [];
const periodRangeCells = data.contiguous === false
  ? [["统计范围",data.scopeLabel,"统计周期",data.periodLabel,"生成时间",new Date().toLocaleString("zh-CN"),"",""]]
  : [["统计范围",data.scopeLabel,"统计开始",data.from,"统计结束",periodEndText,"生成时间",new Date().toLocaleString("zh-CN")]];

const overview = wb.worksheets.add("经营概览"); title(overview, `${data.companyName} ${data.periodLabel}经营报表`, "H");
overview.getRange("A3:H3").values = periodRangeCells;
overview.getRange("A3:H3").format.fill = pale; overview.getRange("A3:H6").format.columnWidth=16; overview.getRange("B3:B6").format.columnWidth=14; overview.getRange("D3:D6").format.columnWidth=15; overview.getRange("F3:F6").format.columnWidth=15; overview.getRange("H3:H6").format.columnWidth=20;
const metrics = [["新增客户",num(data.summary.new_customers),"跟进次数",num(data.summary.follow_ups),"新增商机",num(data.summary.new_opportunities),"商机金额",num(data.summary.opportunity_amount)],["成交单数",num(data.summary.won_count),"成交金额",num(data.summary.won_amount),"报价数",num(data.summary.quotes),"报价金额",num(data.summary.quote_amount)]];
overview.getRange("A5:H6").values=metrics; overview.getRange("A5:H6").format={fill:"#F7F9FA",font:{bold:true},borders:{preset:"all",style:"thin",color:border},rowHeight:30}; for(const c of ["B","D","F","H"]) overview.getRange(`${c}5:${c}6`).setNumberFormat("#,##0.00");
table(overview,9,["漏斗阶段","商机数","金额"],data.stages.map(x=>[label(opportunityStage,x.stage),num(x.count),num(x.amount)]),{C:"¥#,##0.00"});
overview.getRange("C:C").format.columnWidth=20;
if(data.stages.length){ const chart=overview.charts.add("column",overview.getRange(`A9:B${9+data.stages.length}`)); chart.titleText="期末商机数量"; chart.setPosition("E9","L25"); }

const stock = wb.worksheets.add("当前存量");
title(stock, `${data.companyName} 成员当前存量`, "E");
stock.getRange("A3:F3").values = [["统计范围", data.scopeLabel || "-", "说明", "实时存量（非周期内）", "生成时间", new Date().toLocaleString("zh-CN")]];
stock.getRange("A3:F3").format.fill = pale;
table(
  stock,
  5,
  ["销售人员", "角色", "私海客户", "推进中商机", "待办"],
  salesRows.map((x) => [
    x.name,
    label(roleLabel, x.role),
    num(x.customers),
    num(x.open_opps),
    num(x.open_tasks),
  ])
);

const sales = wb.worksheets.add("销售人员");
title(sales, `${data.periodLabel}销售人员表现`, "H");
table(
  sales,
  3,
  ["销售人员", "新增客户", "跟进次数", "新增商机", "商机金额", "成交单数", "成交额"],
  salesRows.map((x) => [
    x.name,
    num(x.new_customers),
    num(x.follow_ups),
    num(x.opportunities),
    num(x.opportunity_amount),
    num(x.won_count),
    num(x.won_amount),
  ]),
  { E: "¥#,##0.00", G: "¥#,##0.00" }
);
sales.getRange("E:E").format.columnWidth = 20;
sales.getRange("G:G").format.columnWidth = 20;

const customers=wb.worksheets.add("客户分析"); title(customers,`${data.periodLabel}新增客户`,"G"); table(customers,3,["客户公司","联系人","行业","来源","状态","负责人","创建时间"],data.customers.map(x=>[x.company_name,x.name,x.industry,x.source,label(customerStatus,x.status),x.owner_name,date(x.created_at)]),{G:"yyyy-mm-dd hh:mm"}); customers.getRange("G:G").format.columnWidth=22;
const opp=wb.worksheets.add("销售漏斗"); title(opp,`${data.periodLabel}新增商机`,"H"); table(opp,3,["商机","客户","负责人","阶段","金额","预计成交","创建时间","更新时间"],data.opportunities.map(x=>[x.title,x.customer_name,x.owner_name,label(opportunityStage,x.stage),num(x.amount),date(x.expected_close_date),date(x.created_at),date(x.updated_at)]),{E:"¥#,##0.00",F:"yyyy-mm-dd",G:"yyyy-mm-dd hh:mm",H:"yyyy-mm-dd hh:mm"}); opp.getRange("E:E").format.columnWidth=18; opp.getRange("F:F").format.columnWidth=18; opp.getRange("G:H").format.columnWidth=22;
const quote=wb.worksheets.add("报价分析"); title(quote,`${data.periodLabel}报价`,"F"); table(quote,3,["报价标题","客户","负责人","状态","金额","创建时间"],data.quotes.map(x=>[x.title,x.customer_name,x.owner_name,label(quoteStatus,x.status),num(x.total),date(x.created_at)]),{E:"¥#,##0.00",F:"yyyy-mm-dd hh:mm"}); quote.getRange("E:E").format.columnWidth=18; quote.getRange("F:F").format.columnWidth=22;
const insight=wb.worksheets.add("痛点与竞品"); title(insight,`${data.periodLabel}痛点与竞品`,"F"); table(insight,3,["痛点标准类目","出现次数"],data.painPoints.map(x=>[x.category||"其他",num(x.count)])); insight.getRange("D3:E3").values=[["竞品","提及次数"]]; header(insight.getRange("D3:E3")); if(data.competitors.length) insight.getRange(`D4:E${3+data.competitors.length}`).values=data.competitors.map(x=>[x.name,num(x.count)]);
const detail=wb.worksheets.add("跟进明细"); title(detail,`${data.periodLabel}跟进明细`,"E"); table(detail,3,["客户","负责人","方式","内容","跟进时间"],data.followUps.map(x=>[x.customer_name,x.owner_name,label(followType,x.type),x.content,date(x.followed_at)]),{E:"yyyy-mm-dd hh:mm"}); detail.getRange("E:E").format.columnWidth=22;
await fs.mkdir(new URL(".",pathToFileURL(outputPath)),{recursive:true}).catch(()=>{});
const out=await SpreadsheetFile.exportXlsx(wb); await out.save(outputPath);
