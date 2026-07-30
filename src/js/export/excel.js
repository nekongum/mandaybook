/**
 * export/excel.js
 * Generate a styled .xlsx file using ExcelJS.
 * Layout matches the on-screen Plan/Actual/Summary sections.
 */

import { state } from '../state.js';
import { num, fmt, totalHrs, formatHrsMins, mandays, fileBase } from '../utils.js';
import { showToast } from '../ui/toast.js';

const FILL = (color) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: color } });

const COLORS = {
  HEADER:        FILL('FF1F4E78'),  // title bar
  PLAN_BANNER:   FILL('FF2E75B6'),
  ACTUAL_BANNER: FILL('FF548235'),
  SUMMARY_BANNER:FILL('FFC00000'),
  PLAN_HEAD:     FILL('FFDDEBF7'),
  ACTUAL_HEAD:   FILL('FFE2EFDA'),
  SUMMARY_ROW:   FILL('FFFFF2CC'),
  INPUT:         FILL('FFFFFFCC'),
  TOTAL:         FILL('FFD9D9D9')
};

const THIN_BORDER = {
  top:    { style: 'thin', color: { argb: 'FFBFBFBF' } },
  bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  left:   { style: 'thin', color: { argb: 'FFBFBFBF' } },
  right:  { style: 'thin', color: { argb: 'FFBFBFBF' } }
};

const MEDIUM_BORDER = {
  top:    { style: 'medium', color: { argb: 'FF404040' } },
  bottom: { style: 'medium', color: { argb: 'FF404040' } },
  left:   { style: 'medium', color: { argb: 'FF404040' } },
  right:  { style: 'medium', color: { argb: 'FF404040' } }
};

const SPLIT_THRESHOLD = 20; // total plan+actual rows before splitting into 2 sheets

/**
 * Main entry — build and download the workbook.
 * Single sheet when plan+actual ≤ SPLIT_THRESHOLD, 2 sheets otherwise.
 */
export async function exportXLSX() {
  showToast('Generating Excel…');
  try {
    const computed = computeValues();
    const wb = new ExcelJS.Workbook();
    const useMultiSheet = (state.plan.length + state.actual.length) > SPLIT_THRESHOLD;

    if (useMultiSheet) {
      // Sheet 1: Data — Plan + Actual side by side vertically, no project info header clutter
      const ws1 = wb.addWorksheet('Plan & Actual', { views: [{ showGridLines: false }] });
      setColumnWidths(ws1);
      drawSheetHeader(ws1, 'MANDAY TRACKER — Plan & Actual', state.project.name, state.project.customer);
      let r1 = 4;
      r1 = drawPlanSection(ws1, r1);
      r1 += 1;
      drawActualSection(ws1, r1, computed);
      ws1.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, showGridLines: false }];

      // Sheet 2: Summary — project info + full summary
      const ws2 = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
      setColumnWidths(ws2);
      drawTitle(ws2);
      drawProjectInfo(ws2, computed);
      drawSummarySection(ws2, 8, computed);
      ws2.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: false }];
    } else {
      const ws = wb.addWorksheet('Manday Tracker', { views: [{ showGridLines: false }] });
      setColumnWidths(ws);
      drawTitle(ws);
      drawProjectInfo(ws, computed);

      let row = 8;
      row = drawPlanSection(ws, row);
      row += 1;
      row = drawActualSection(ws, row, computed);
      row += 1;
      drawSummarySection(ws, row, computed);
      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: false }];
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    saveAs(blob, `${fileBase()}.xlsx`);
    showToast(useMultiSheet ? 'Excel downloaded (2 sheets)' : 'Excel file downloaded');
  } catch (err) {
    console.error(err);
    showToast('Excel generation failed');
  }
}

// ============================================================================
// Helpers
// ============================================================================

function computeValues() {
  const purchased = num(state.project.mandayPurchased);
  const hpm = num(state.project.hoursPerManday, 8);
  const planHours = state.plan.reduce((s, r) => s + totalHrs(r), 0);
  const planMd = mandays(planHours);
  const actualHours = state.actual.reduce((s, r) => s + totalHrs(r), 0);
  const actualMd = mandays(actualHours);
  const totalMinutes = state.actual.reduce((s, r) => s + num(r.minutes), 0);
  const totalHoursOnly = state.actual.reduce((s, r) => s + num(r.hours), 0);
  const remainingMd = purchased - actualMd;
  const remainingHrs = remainingMd * hpm;
  const pct = purchased > 0 ? actualMd / purchased : 0;

  return {
    purchased, hpm,
    planHours, planMd,
    actualHours, actualMd, totalMinutes, totalHoursOnly,
    remainingMd, remainingHrs, pct
  };
}

function setColumnWidths(ws) {
  ws.columns = [
    { width: 5 }, { width: 5 }, { width: 32 }, { width: 22 },
    { width: 10 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 24 }
  ];
}

function drawTitle(ws) {
  ws.mergeCells('A1:I1');
  const cell = ws.getCell('A1');
  cell.value = 'MANDAY TRACKER — Plan vs Actual';
  cell.fill = COLORS.HEADER;
  cell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;
}

// Compact header for multi-sheet data sheet (rows 1-3)
function drawSheetHeader(ws, title, projectName, customer) {
  ws.mergeCells('A1:I1');
  const t = ws.getCell('A1');
  t.value = title;
  t.fill = COLORS.HEADER;
  t.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 26;

  // Row 2: project name | customer
  ws.mergeCells('A2:D2');
  const p = ws.getCell('A2');
  p.value = projectName ? `Project: ${projectName}` : '';
  p.fill = COLORS.TOTAL;
  p.font = { name: 'Arial', size: 10, bold: true };
  p.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  ws.mergeCells('E2:I2');
  const cu = ws.getCell('E2');
  cu.value = customer ? `Customer: ${customer}` : '';
  cu.fill = COLORS.TOTAL;
  cu.font = { name: 'Arial', size: 10, bold: true };
  cu.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 20;

  // Row 3: spacer
  ws.getRow(3).height = 6;
}

function drawProjectInfo(ws, c) {
  const items = [
    ['Project Name',     state.project.name || ''],
    ['Customer',         state.project.customer || ''],
    ['Manday Purchased', `${fmt(c.purchased)} mandays`],
    ['Hours per Manday', `${fmt(c.hpm)} hrs`]
  ];
  items.forEach(([label, value], i) => {
    const r = 3 + i;
    const labelCell = ws.getCell(`B${r}`);
    labelCell.value = label;
    labelCell.fill = COLORS.TOTAL;
    labelCell.font = { name: 'Arial', size: 10, bold: true };
    labelCell.border = THIN_BORDER;
    labelCell.alignment = { horizontal: 'left', vertical: 'middle' };

    ws.mergeCells(`C${r}:D${r}`);
    const valCell = ws.getCell(`C${r}`);
    valCell.value = value;
    valCell.fill = COLORS.INPUT;
    valCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0000FF' } };
    valCell.border = THIN_BORDER;
    valCell.alignment = { horizontal: 'left', vertical: 'middle' };
  });
}

function drawPlanSection(ws, startRow) {
  drawBanner(ws, startRow, '📋 SECTION 1 — PLANNED ACTIVITIES (Mandays Breakdown)', COLORS.PLAN_BANNER);
  let r = startRow + 1;

  // Headers
  const headers = ['#', 'Activity', 'Description / Date', 'Hours', 'Minutes', 'Total Hrs', 'Mandays', 'Notes'];
  const cols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  headers.forEach((value, i) => {
    const cell = ws.getCell(`${cols[i]}${r}`);
    cell.value = value;
    cell.fill = COLORS.PLAN_HEAD;
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  r++;

  // Body rows
  state.plan.forEach((row, i) => {
    const tH = totalHrs(row);
    ws.getCell(`B${r}`).value = i + 1;
    ws.getCell(`C${r}`).value = row.activity || '';
    ws.getCell(`D${r}`).value = row.desc || '';
    ws.getCell(`E${r}`).value = num(row.hours);
    ws.getCell(`F${r}`).value = num(row.minutes);
    ws.getCell(`G${r}`).value = tH;
    ws.getCell(`G${r}`).numFmt = '0.00';
    ws.getCell(`H${r}`).value = mandays(tH);
    ws.getCell(`H${r}`).numFmt = '0.00';
    ws.getCell(`I${r}`).value = '';

    cols.forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.border = THIN_BORDER;
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = ['B', 'E', 'F', 'G', 'H'].includes(col)
        ? { horizontal: 'center', vertical: 'middle' }
        : { horizontal: 'left', vertical: 'middle' };
    });
    ['C', 'D', 'E', 'F', 'I'].forEach((col) => {
      ws.getCell(`${col}${r}`).fill = COLORS.INPUT;
    });
    r++;
  });

  // Total row
  ws.mergeCells(`B${r}:D${r}`);
  const planHours = state.plan.reduce((s, x) => s + totalHrs(x), 0);
  ws.getCell(`B${r}`).value = 'TOTAL PLANNED';
  ws.getCell(`E${r}`).value = state.plan.reduce((s, x) => s + num(x.hours), 0);
  ws.getCell(`E${r}`).numFmt = '0';
  ws.getCell(`F${r}`).value = state.plan.reduce((s, x) => s + num(x.minutes), 0);
  ws.getCell(`F${r}`).numFmt = '0';
  const sumPlanMins = state.plan.reduce((s, x) => s + num(x.minutes), 0);
  const sumPlanHrs = state.plan.reduce((s, x) => s + num(x.hours), 0) + Math.floor(sumPlanMins / 60);
  const planMinsOnly = sumPlanMins % 60;
  ws.getCell(`G${r}`).value = formatHrsMins(sumPlanHrs, planMinsOnly);
  ws.getCell(`H${r}`).value = mandays(planHours);
  ws.getCell(`H${r}`).numFmt = '0.00" md"';
  ws.getCell(`I${r}`).value = '';

  ['B', 'E', 'F', 'G', 'H', 'I'].forEach((col) => {
    const cell = ws.getCell(`${col}${r}`);
    cell.fill = COLORS.TOTAL;
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.border = THIN_BORDER;
    cell.alignment = col === 'B'
      ? { horizontal: 'right', vertical: 'middle' }
      : { horizontal: 'center', vertical: 'middle' };
  });
  return r + 1;
}

function drawActualSection(ws, startRow, c) {
  drawBanner(ws, startRow, '✅ SECTION 2 — ACTUAL WORK LOG (record each task as it happens)', COLORS.ACTUAL_BANNER);
  let r = startRow + 1;

  const headers = ['#', 'Task / Activity', 'Date', 'Hours', 'Minutes', 'Total Hrs', 'Mandays', 'Stakeholder'];
  const cols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  headers.forEach((value, i) => {
    const cell = ws.getCell(`${cols[i]}${r}`);
    cell.value = value;
    cell.fill = COLORS.ACTUAL_HEAD;
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  r++;

  // Body
  state.actual.forEach((row, i) => {
    const tH = totalHrs(row);
    ws.getCell(`B${r}`).value = i + 1;
    ws.getCell(`C${r}`).value = row.task || '';
    ws.getCell(`D${r}`).value = row.date || '';
    ws.getCell(`E${r}`).value = num(row.hours);
    ws.getCell(`F${r}`).value = num(row.minutes);
    ws.getCell(`G${r}`).value = formatHrsMins(row.hours, row.minutes);
    ws.getCell(`H${r}`).value = mandays(tH);
    ws.getCell(`H${r}`).numFmt = '0.000';
    ws.getCell(`I${r}`).value = row.stakeholder || '';

    cols.forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.border = THIN_BORDER;
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = ['B', 'D', 'E', 'F', 'G', 'H'].includes(col)
        ? { horizontal: 'center', vertical: 'middle' }
        : { horizontal: 'left', vertical: 'middle' };
    });
    ['C', 'D', 'E', 'F', 'I'].forEach((col) => {
      ws.getCell(`${col}${r}`).fill = COLORS.INPUT;
    });
    r++;
  });

  // Total row
  ws.mergeCells(`B${r}:D${r}`);
  ws.getCell(`B${r}`).value = 'TOTAL ACTUAL';
  ws.getCell(`E${r}`).value = c.totalHoursOnly;
  ws.getCell(`E${r}`).numFmt = '0" ชม."';
  ws.getCell(`F${r}`).value = c.totalMinutes;
  ws.getCell(`F${r}`).numFmt = '0" น."';
  const sumActualMins = state.actual.reduce((s, x) => s + num(x.minutes), 0);
  const sumActualHrs = state.actual.reduce((s, x) => s + num(x.hours), 0) + Math.floor(sumActualMins / 60);
  const actualMinsOnly = sumActualMins % 60;
  ws.getCell(`G${r}`).value = formatHrsMins(sumActualHrs, actualMinsOnly);
  ws.getCell(`H${r}`).value = c.actualMd;
  ws.getCell(`H${r}`).numFmt = '0.00" md"';
  ws.getCell(`I${r}`).value = '';

  ['B', 'E', 'F', 'G', 'H', 'I'].forEach((col) => {
    const cell = ws.getCell(`${col}${r}`);
    cell.fill = COLORS.TOTAL;
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.border = THIN_BORDER;
    cell.alignment = col === 'B'
      ? { horizontal: 'right', vertical: 'middle' }
      : { horizontal: 'center', vertical: 'middle' };
  });
  return r + 1;
}

function drawSummarySection(ws, startRow, c) {
  drawBanner(ws, startRow, '📊 SECTION 3 — SUMMARY & PROGRESS', COLORS.SUMMARY_BANNER);
  let r = startRow + 1;

  const summaryRows = [
    ['Manday Purchased',                          c.purchased,            '0.00" md"'],
    ['Total Hours Available',                     c.purchased * c.hpm,    '0.00" ชม."'],
    ['Total Planned (Section 1)',                 c.planMd,               '0.00" md"'],
    ['Total Actual Used (Section 2)',             c.actualMd,             '0.00" md"'],
    ['Remaining Mandays (Purchased − Actual)',    c.remainingMd,          '0.00" md"'],
    ['Remaining Hours',                           c.remainingHrs,         '0.00" ชม."'],
    ['% Used',                                    c.pct,                  '0.0%'],
    ['Plan vs Purchased (over/under)',            c.planMd - c.purchased, '+0.00" md";-0.00" md";"0 md"']
  ];

  summaryRows.forEach(([label, value, numFmt]) => {
    ws.mergeCells(`B${r}:E${r}`);
    const lblCell = ws.getCell(`B${r}`);
    lblCell.value = label;
    lblCell.fill = COLORS.SUMMARY_ROW;
    lblCell.font = { name: 'Arial', size: 10, bold: true };
    lblCell.border = THIN_BORDER;
    lblCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    ws.mergeCells(`F${r}:I${r}`);
    const valCell = ws.getCell(`F${r}`);
    valCell.value = value;
    valCell.numFmt = numFmt;
    valCell.fill = COLORS.SUMMARY_ROW;
    valCell.font = { name: 'Arial', size: 10, bold: true };
    valCell.border = THIN_BORDER;
    valCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    r++;
  });
  r++;

  // Progress bar label
  ws.mergeCells(`B${r}:I${r}`);
  const lbl = ws.getCell(`B${r}`);
  lbl.value = 'PROGRESS BAR — visual usage of mandays';
  lbl.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F4E78' } };
  lbl.alignment = { horizontal: 'left', vertical: 'middle' };
  r++;

  // Progress bar cell
  ws.getRow(r).height = 26;
  ws.mergeCells(`B${r}:G${r}`);
  const bar = ws.getCell(`B${r}`);
  bar.value = c.pct;
  bar.numFmt = '0.0%';
  bar.fill = FILL(progressColor(c.pct));
  bar.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  bar.alignment = { horizontal: 'center', vertical: 'middle' };
  bar.border = MEDIUM_BORDER;

  ws.mergeCells(`H${r}:I${r}`);
  const status = ws.getCell(`H${r}`);
  const s = statusInfo(c.pct);
  status.value = s.text;
  status.font = { name: 'Arial', size: 11, bold: true, color: { argb: s.color } };
  status.alignment = { horizontal: 'center', vertical: 'middle' };
  status.border = MEDIUM_BORDER;
  return r + 1;
}

function drawBanner(ws, row, text, fill) {
  ws.mergeCells(`A${row}:I${row}`);
  const cell = ws.getCell(`A${row}`);
  cell.value = text;
  cell.fill = fill;
  cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 22;
}

function progressColor(pct) {
  if (pct >= 1)   return 'FFC00000';
  if (pct >= 0.9) return 'FFED7D31';
  if (pct >= 0.7) return 'FFFFC000';
  return 'FF70AD47';
}

function statusInfo(pct) {
  if (pct >= 1)   return { text: '⛔ OVER BUDGET', color: 'FFC00000' };
  if (pct >= 0.9) return { text: '⚠️ NEAR LIMIT',  color: 'FFED7D31' };
  if (pct >= 0.7) return { text: '🟡 ON TRACK',    color: 'FFE0A800' };
  return { text: '🟢 HEALTHY', color: 'FF548235' };
}
