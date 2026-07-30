import { state } from '../state.js';
import {
  num, fmt, totalHrs, formatHrsMins, mandays,
  formatDate, fileBase, getStatusText
} from '../utils.js';
import { showToast } from '../ui/toast.js';

const W  = 210;
const H  = 297;
const ML = 18;
const MR = 18;
const CW = W - ML - MR;
const BOTTOM = H - 18; // usable bottom (above footer)

// ─── Page context ────────────────────────────────────────────────────────────
let _doc = null;
let _pg  = 1;

function addPage() {
  _drawFooter();
  _doc.addPage();
  _pg++;
  return 16;
}

// ─── Entry ───────────────────────────────────────────────────────────────────

export async function exportPDF() {
  showToast('Generating PDF…');
  try {
    const { jsPDF } = window.jspdf;
    _doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    _pg  = 1;

    const data   = computeValues();
    const layout = computeLayout();

    let y = 16;
    y = await drawHeader(y);
    y = drawClientBlock(y, data);

    y = drawTableSection(y, '1', 'Planned Activities',
          buildPlanRows(), buildPlanFoot(data), layout.plan);

    y = drawTableSection(y, '2', 'Actual Work Log',
          buildActualRows(), buildActualFoot(data), layout.actual);

    y = drawSummaryBlock(y, data);

    _drawFooter();
    _doc.save(`${fileBase()}.pdf`);
    showToast('PDF downloaded');
  } catch (e) {
    console.error(e);
    showToast('PDF generation failed');
  }
}

// ─── Header ──────────────────────────────────────────────────────────────────

async function drawHeader(y) {
  let textX = ML;
  if (state.project.logo) {
    try {
      const f    = imgFmt(state.project.logo);
      const dims = await imgDims(state.project.logo);
      const maxW = 24, maxH = 12;
      let w = maxW, h = maxH;
      if (dims.w && dims.h) {
        const r = dims.w / dims.h;
        w = r > maxW / maxH ? maxW : maxH * r;
        h = r > maxW / maxH ? maxW / r : maxH;
      }
      _doc.addImage(state.project.logo, f, ML, y, w, h);
      textX = ML + w + 6;
    } catch (_) {}
  }

  const title = (state.project.docTitle || 'Manday Allocation Report').toUpperCase();
  _doc.setFont('helvetica', 'bold');
  _doc.setFontSize(16);
  _doc.setTextColor(0, 0, 0);
  _doc.text(title, textX, y + 8);

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  _doc.setFont('helvetica', 'normal');
  _doc.setFontSize(8);
  _doc.setTextColor(80, 80, 80);
  _doc.text(today, W - MR, y + 5, { align: 'right' });

  const sub = state.project.docSubtitle || '';
  if (sub) {
    _doc.setFont('helvetica', 'normal');
    _doc.setFontSize(9);
    _doc.setTextColor(80, 80, 80);
    _doc.text(sub, textX, y + 14);
  }

  y += 20;
  hRule(y, 0.8);
  y += 0.8;
  hRule(y, 0.2);
  return y + 6;
}

// ─── Client block ────────────────────────────────────────────────────────────

function drawClientBlock(y, data) {
  const fields = [
    ['Client / Project',  state.project.customer || '—'],
    ['Mandays Purchased', fmt(data.purchased) + ' mandays'],
    ['Hours per Manday',  fmt(data.hpm) + ' hours'],
  ];
  const rh = 6.5, lw = 52;
  fields.forEach((f, i) => {
    if (i % 2 === 0) { _doc.setFillColor(245, 245, 245); _doc.rect(ML, y + i * rh, CW, rh, 'F'); }
    _doc.setFont('helvetica', 'bold');   _doc.setFontSize(8.5); _doc.setTextColor(80, 80, 80);
    _doc.text(f[0], ML + 3, y + i * rh + rh - 2);
    _doc.setFont('helvetica', 'normal'); _doc.setTextColor(0, 0, 0);
    _doc.text(f[1], ML + lw, y + i * rh + rh - 2);
  });
  _doc.setDrawColor(0, 0, 0); _doc.setLineWidth(0.25);
  _doc.rect(ML, y, CW, fields.length * rh, 'S');
  _doc.setLineWidth(0.1); _doc.setDrawColor(200, 200, 200);
  for (let i = 1; i < fields.length; i++) _doc.line(ML, y + i * rh, ML + CW, y + i * rh);
  return y + fields.length * rh + 7;
}

// ─── Table section (with page-break) ─────────────────────────────────────────

function drawTableSection(y, secNum, title, rows, foot, layout) {
  const { cols, rh, fs } = layout;
  const totalW = cols.reduce((s, c) => s + c.w, 0);

  // Need room for section label + col-header + at least 2 rows before starting
  if (y + 14 + (rh + 1) + rh * 2 > BOTTOM) y = addPage();

  // Section label
  _doc.setFont('helvetica', 'bold'); _doc.setFontSize(7.5); _doc.setTextColor(120, 120, 120);
  _doc.text('SECTION ' + secNum, ML, y + 4.5);
  _doc.setFontSize(11); _doc.setTextColor(0, 0, 0);
  _doc.text(title, ML + 21, y + 4.5);
  y += 6; hRule(y, 0.4); hRule(y + 1, 0.1); y += 5;

  // Draw col-header and return new y; also marks segment top
  const drawColHeader = (startY) => {
    _doc.setFillColor(245, 245, 245);
    _doc.rect(ML, startY, totalW, rh + 1, 'F');
    _doc.setFont('helvetica', 'bold'); _doc.setFontSize(fs - 0.5); _doc.setTextColor(0, 0, 0);
    let x = ML;
    cols.forEach(c => {
      const cx = x + (c.r ? c.w - 2 : c.c ? c.w / 2 : 2);
      _doc.text(c.h, cx, startY + rh - 0.5, { align: c.r ? 'right' : c.c ? 'center' : 'left' });
      x += c.w;
    });
    return startY + rh + 1;
  };

  // Draw outer border around a segment
  const drawSegBorder = (top, rowCount) => {
    const segH = (rh + 1) + rowCount * rh; // col-header + rows
    _doc.setDrawColor(0, 0, 0); _doc.setLineWidth(0.3);
    _doc.rect(ML, top, totalW, segH, 'S');
  };

  let segTop = y;
  y = drawColHeader(y);
  let segRowCount = 0;

  // Body rows
  _doc.setFont('helvetica', 'normal'); _doc.setFontSize(fs);
  rows.forEach((row, ri) => {
    // Page break before row
    if (y + rh > BOTTOM) {
      drawSegBorder(segTop, segRowCount);
      y = addPage();

      // "continued" label
      _doc.setFont('helvetica', 'italic'); _doc.setFontSize(8); _doc.setTextColor(150, 150, 150);
      _doc.text(title + ' (continued)', ML, y + 4);
      hRule(y + 5.5, 0.2); y += 9;

      segTop = y;
      y = drawColHeader(y);
      segRowCount = 0;
    }

    if (ri % 2 === 0) { _doc.setFillColor(252, 252, 252); _doc.rect(ML, y, totalW, rh, 'F'); }
    _doc.setTextColor(0, 0, 0);
    let xb = ML;
    cols.forEach(c => {
      const txt  = String(row[c._i ?? cols.indexOf(c)] ?? '');
      const maxCh = Math.floor(c.w / (fs * 0.165));
      const disp  = txt.length > maxCh ? txt.slice(0, maxCh - 1) + '…' : txt;
      const cx    = xb + (c.r ? c.w - 2 : c.c ? c.w / 2 : 2);
      _doc.text(disp, cx, y + rh - 1.2, { align: c.r ? 'right' : c.c ? 'center' : 'left' });
      xb += c.w;
    });
    _doc.setDrawColor(210, 210, 210); _doc.setLineWidth(0.08);
    _doc.line(ML, y + rh, ML + totalW, y + rh);
    y += rh; segRowCount++;
  });

  // Total row — ensure it stays on same page as last data row
  if (y + rh + 0.5 > BOTTOM) {
    drawSegBorder(segTop, segRowCount);
    y = addPage();
    segTop = y; y = drawColHeader(y); segRowCount = 0;
  }

  _doc.setFillColor(235, 235, 235); _doc.rect(ML, y, totalW, rh + 0.5, 'F');
  _doc.setFont('helvetica', 'bold'); _doc.setFontSize(fs); _doc.setTextColor(0, 0, 0);
  _doc.setDrawColor(0, 0, 0); _doc.setLineWidth(0.35);
  _doc.line(ML, y, ML + totalW, y);
  let xt = ML;
  cols.forEach((c, ci) => {
    const txt = String(foot[ci] ?? '');
    if (txt) {
      const cx = xt + (c.r ? c.w - 2 : c.c ? c.w / 2 : 2);
      _doc.text(txt, cx, y + rh - 0.3, { align: c.r ? 'right' : c.c ? 'center' : 'left' });
    }
    xt += c.w;
  });
  y += rh + 0.5; segRowCount++;

  drawSegBorder(segTop, segRowCount);
  return y + 7;
}

// ─── Summary block ───────────────────────────────────────────────────────────

function drawSummaryBlock(y, data) {
  const rh = 6.5, lw = 70;
  const over = data.remainingMd < 0;
  const pct  = (Math.round(data.pct * 1000) / 10) + '%';
  const rows = [
    ['Mandays Purchased',     fmt(data.purchased) + ' md'],
    ['Mandays Used (Actual)', fmt(data.actualMd)  + ' md'],
    ['Mandays Remaining',     fmt(data.remainingMd) + ' md'],
    ['Hours Used',            fmt(data.actualHours) + ' hrs'],
    ['Hours Remaining',       fmt(data.remainingHrs) + ' hrs'],
    ['Utilization Rate',      pct + '   ' + getStatusText(data.pct)],
  ];

  const needed = 14 + rows.length * rh;
  if (y + needed > BOTTOM) y = addPage();

  _doc.setFont('helvetica', 'bold'); _doc.setFontSize(7.5); _doc.setTextColor(120, 120, 120);
  _doc.text('SECTION 3', ML, y + 4.5);
  _doc.setFontSize(11); _doc.setTextColor(0, 0, 0);
  _doc.text('Summary', ML + 21, y + 4.5);
  y += 6; hRule(y, 0.4); hRule(y + 1, 0.1); y += 5;

  rows.forEach((r, i) => {
    if (i % 2 === 0) { _doc.setFillColor(245, 245, 245); _doc.rect(ML, y + i * rh, CW, rh, 'F'); }
    const alert = over && (r[0].includes('Remaining') || r[0].includes('Utilization'));
    _doc.setFont('helvetica', 'normal'); _doc.setFontSize(9); _doc.setTextColor(80, 80, 80);
    _doc.text(r[0], ML + 3, y + i * rh + rh - 2);
    _doc.setFont('helvetica', 'bold'); _doc.setTextColor(...(alert ? [140, 0, 0] : [0, 0, 0]));
    _doc.text(r[1], ML + lw, y + i * rh + rh - 2);
  });

  _doc.setDrawColor(0, 0, 0); _doc.setLineWidth(0.25);
  _doc.rect(ML, y, CW, rows.length * rh, 'S');
  _doc.setLineWidth(0.08); _doc.setDrawColor(200, 200, 200);
  rows.forEach((_, i) => { if (i > 0) _doc.line(ML, y + i * rh, ML + CW, y + i * rh); });
  return y + rows.length * rh + 7;
}

// ─── Footer (called per page) ────────────────────────────────────────────────

function _drawFooter() {
  const fy = H - 12;
  hRule(fy, 0.2); hRule(fy + 1.5, 0.7);
  _doc.setFont('helvetica', 'normal'); _doc.setFontSize(7.5); _doc.setTextColor(120, 120, 120);
  const left = state.project.customer
    ? 'Prepared for: ' + state.project.customer
    : 'mandaybook — Manday Allocation Report';
  _doc.text(left, ML, fy + 6);
  _doc.text('Page ' + _pg + '  ·  mandaybook.vercel.app', W - MR, fy + 6, { align: 'right' });
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function computeLayout() {
  const totalRows = state.plan.length + state.actual.length;
  let rh = 5.5, fs = 8;
  if (totalRows > 28) { rh = 4.8; fs = 7.5; }
  if (totalRows > 36) { rh = 4.2; fs = 7;   }
  if (totalRows > 44) { rh = 3.8; fs = 6.5; }

  return {
    plan: {
      rh, fs,
      cols: [
        { h: 'No.',         w: 9,  c: true },
        { h: 'Activity',    w: 50 },
        { h: 'Description', w: 85 },
        { h: 'Total',       w: 16, r: true },
        { h: 'MD',          w: 14, r: true },
      ],
    },
    actual: {
      rh, fs,
      cols: [
        { h: 'No.',             w: 9,  c: true },
        { h: 'Task / Activity', w: 52 },
        { h: 'Date',            w: 22 },
        { h: 'Total',           w: 20, r: true },
        { h: 'MD',              w: 14, r: true },
        { h: 'Stakeholder',     w: 57 },
      ],
    },
  };
}

// ─── Row builders ─────────────────────────────────────────────────────────────

function buildPlanRows() {
  return state.plan.map((r, i) => [
    String(i + 1), r.activity || '', r.desc || '',
    formatHrsMins(r.hours, r.minutes), fmt(mandays(totalHrs(r))),
  ]);
}
function buildPlanFoot(data) {
  const sm = state.plan.reduce((s, r) => s + num(r.minutes), 0);
  const sh = state.plan.reduce((s, r) => s + num(r.hours), 0) + Math.floor(sm / 60);
  return ['', 'Total Planned', '', formatHrsMins(sh, sm % 60), fmt(data.planMd)];
}
function buildActualRows() {
  return state.actual.map((r, i) => [
    String(i + 1), r.task || '', formatDate(r.date),
    formatHrsMins(r.hours, r.minutes), fmt(mandays(totalHrs(r)), 2), r.stakeholder || '',
  ]);
}
function buildActualFoot(data) {
  const sm = state.actual.reduce((s, r) => s + num(r.minutes), 0);
  const sh = state.actual.reduce((s, r) => s + num(r.hours), 0) + Math.floor(sm / 60);
  return ['', 'Total Actual', '', formatHrsMins(sh, sm % 60), fmt(data.actualMd), ''];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

function computeValues() {
  const purchased   = num(state.project.mandayPurchased);
  const hpm         = num(state.project.hoursPerManday, 8);
  const planHours   = state.plan.reduce((s, r) => s + totalHrs(r), 0);
  const planMd      = mandays(planHours);
  const actualHours = state.actual.reduce((s, r) => s + totalHrs(r), 0);
  const actualMd    = mandays(actualHours);
  return {
    purchased, hpm, planHours, planMd, actualHours, actualMd,
    remainingMd:  purchased - actualMd,
    remainingHrs: (purchased - actualMd) * hpm,
    pct: purchased > 0 ? actualMd / purchased : 0,
  };
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function hRule(y, lw) {
  _doc.setDrawColor(0, 0, 0); _doc.setLineWidth(lw);
  _doc.line(ML, y, ML + CW, y);
}
function imgFmt(dataUrl) {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/svg')) return 'SVG';
  return 'JPEG';
}
function imgDims(dataUrl) {
  return new Promise(res => {
    const img = new Image();
    img.onload  = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res({ w: 0, h: 0 });
    img.src = dataUrl;
  });
}
