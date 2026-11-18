import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

const ORANGE = '#E8742A';
const NAVY = '#1C2333';
const MUTED = '#6B7280';

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const pdfToBuffer = (build) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Athma report', Author: 'Athma Mind Care Hospital' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      build(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });

const header = (doc, title, periodLabel) => {
  doc.fillColor(ORANGE).fontSize(11).font('Helvetica-Bold').text('Athma Mind Care Hospital');
  doc.moveDown(0.3).fillColor(NAVY).fontSize(18).text(title);
  doc.fillColor(MUTED).fontSize(10).font('Helvetica').text(`Reporting period: ${periodLabel}   ·   Generated ${fmtDate(new Date())}`);
  doc.fillColor(MUTED).fontSize(8).text('CONFIDENTIAL — contains patient health information. Authorised staff only.');
  doc.moveDown(1);
};

const table = (doc, columns, rows) => {
  const startX = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWeight = columns.reduce((s, c) => s + (c.weight || 1), 0);
  const widths = columns.map((c) => ((c.weight || 1) / totalWeight) * width);

  const drawRow = (cells, bold) => {
    if (doc.y > doc.page.height - 80) doc.addPage();
    const y = doc.y;
    const heights = cells.map((cell, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).heightOfString(String(cell ?? ''), { width: widths[i] - 6 }));
    const h = Math.max(...heights) + 8;
    let x = startX;
    cells.forEach((cell, i) => {
      doc.fillColor(bold ? NAVY : '#374151').text(String(cell ?? ''), x + 3, y + 4, { width: widths[i] - 6 });
      x += widths[i];
    });
    doc.moveTo(startX, y + h).lineTo(startX + width, y + h).strokeColor('#ECE4D8').lineWidth(0.5).stroke();
    doc.x = startX;
    doc.y = y + h;
  };
  drawRow(columns.map((c) => c.label), true);
  rows.forEach((r) => drawRow(columns.map((c) => r[c.key])));
  doc.x = startX;
};

export const buildMonthlySummaryPdf = (data, periodLabel) =>
  pdfToBuffer((doc) => {
    header(doc, 'Monthly assessment summary', periodLabel);
    const stats = [
      ['Assessments completed', data.completed],
      ['Assessments assigned', data.assigned],
      ['New patients registered', data.newPatients],
      ['Results flagged for review (open)', data.flagged],
      ['Results reviewed', data.reviewed],
    ];
    stats.forEach(([label, value]) => {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(label, { continued: true }).fillColor(NAVY).font('Helvetica-Bold').text(`  ${value}`);
    });
    doc.moveDown(1).font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Completed assessments by instrument');
    doc.moveDown(0.4);
    if (!data.rows.length) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No assessments were completed in this period.');
    } else {
      table(
        doc,
        [
          { key: 'code', label: 'Code', weight: 1.2 },
          { key: 'completed', label: 'Completed' },
          { key: 'low', label: 'Low' },
          { key: 'moderate', label: 'Moderate' },
          { key: 'high', label: 'High' },
          { key: 'other', label: 'No band / not configured', weight: 1.6 },
        ],
        data.rows,
      );
    }
    doc.moveDown(1).font('Helvetica').fontSize(8).fillColor(MUTED).text('Risk levels come from each assessment’s configured score bands and are assessment outputs, not diagnoses.');
  });

export const buildHighRiskPdf = (rows, periodLabel) =>
  pdfToBuffer((doc) => {
    header(doc, 'High-risk patient follow-ups', periodLabel);
    if (!rows.length) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No high-risk or flagged results in this period.');
      return;
    }
    table(
      doc,
      [
        { key: 'dateLabel', label: 'Date' },
        { key: 'patientCode', label: 'Patient ID' },
        { key: 'patientName', label: 'Patient', weight: 1.5 },
        { key: 'assessment', label: 'Assessment' },
        { key: 'score', label: 'Score', weight: 0.6 },
        { key: 'band', label: 'Band / indication', weight: 2 },
        { key: 'reviewLabel', label: 'Review', weight: 1.2 },
      ],
      rows.map((r) => ({ ...r, dateLabel: fmtDate(r.date), reviewLabel: r.reviewStatus === 'reviewed' ? `Reviewed${r.reviewedBy ? ` (${r.reviewedBy})` : ''}` : 'Open' })),
    );
  });

const styleHeader = (row) => {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8742A' } };
};

const workbookToBuffer = async (wb) => Buffer.from(await wb.xlsx.writeBuffer());

export const buildResponseAnalysisXlsx = async (sheets, periodLabel) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Athma Mind Care Hospital';
  const summary = wb.addWorksheet('Summary');
  summary.addRow(['Question response analysis']).font = { bold: true, size: 14 };
  summary.addRow([`Reporting period: ${periodLabel}`]);
  summary.addRow(['Aggregated answer counts only — no patient identifiers.']);
  summary.addRow([]);
  styleHeader(summary.addRow(['Assessment', 'Version', 'Submissions']));
  if (!sheets.length) summary.addRow(['No submissions in this period']);
  sheets.forEach((s) => summary.addRow([s.title, s.name, s.submissions]));
  summary.columns = [{ width: 60 }, { width: 18 }, { width: 14 }];

  sheets.forEach((s) => {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    const maxOptions = Math.max(...s.rows.map((r) => r.options.length), 0);
    styleHeader(ws.addRow(['#', 'Question', 'Answered', ...Array.from({ length: maxOptions }, (_, i) => `Option ${i + 1}`)]));
    s.rows.forEach((r) => {
      ws.addRow([r.number, r.text, r.answered, ...r.options.map((o) => `${o.label}: ${o.count} (${Math.round(o.pct * 100)}%)`)]);
    });
    ws.columns = [{ width: 5 }, { width: 70 }, { width: 10 }, ...Array.from({ length: maxOptions }, () => ({ width: 32 }))];
    ws.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  });
  return workbookToBuffer(wb);
};

export const buildWorkloadXlsx = async (rows, periodLabel) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Athma Mind Care Hospital';
  const ws = wb.addWorksheet('Workload');
  ws.addRow(['Clinician / counsellor workload']).font = { bold: true, size: 14 };
  ws.addRow([`Reporting period: ${periodLabel}`]);
  ws.addRow([]);
  styleHeader(ws.addRow(['Name', 'Email', 'Role', 'Patients registered', 'Assessments assigned', 'Notes added', 'Reviews completed', 'Question edits', 'Total actions']));
  rows.forEach((r) => ws.addRow([r.name, r.email, r.role, r.patientsRegistered, r.assessmentsAssigned, r.notesAdded, r.reviewsCompleted, r.contentEdits, r.total]));
  ws.columns = [{ width: 24 }, { width: 30 }, { width: 12 }, { width: 18 }, { width: 20 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 14 }];
  return workbookToBuffer(wb);
};
