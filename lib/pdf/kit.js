// A tiny page-layout helper on top of pdf-lib (pure JavaScript, runs on Vercel, no fonts to ship).
// Uses the built-in Helvetica, so amounts are written as "NGN 1,234.00" and accents are simplified
// (the built-in font cannot draw characters outside Western European encoding).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const COLORS = {
  ink: rgb(0.08, 0.09, 0.17), muted: rgb(0.38, 0.4, 0.5), indigo: rgb(0.137, 0.188, 0.478),
  rule: rgb(0.83, 0.85, 0.92), band: rgb(0.93, 0.94, 0.98), white: rgb(1, 1, 1), green: rgb(0.1, 0.42, 0.23),
};
const PAGE = [595.28, 841.89];
const MARGIN = 40;
const BOTTOM = 56;

export const ngn = (n) => {
  const v = Number(n || 0);
  const s = Math.abs(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-' : '') + 'NGN ' + s;
};

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }) : '';

export async function createPdf({ title, author = 'CoopLedger' }) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor(author);
  doc.setCreator('CoopLedger');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const charset = new Set(regular.getCharacterSet());

  /** Strips accents and replaces anything the built-in font cannot draw. */
  const clean = (s) =>
    String(s ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .split('')
      .map((ch) => (charset.has(ch.codePointAt(0)) ? ch : '?'))
      .join('');

  let page = null;
  let y = 0;
  const W = PAGE[0] - MARGIN * 2;

  const fit = (str, f, size, maxWidth) => {
    let s = clean(str);
    if (!maxWidth || f.widthOfTextAtSize(s, size) <= maxWidth) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + '...', size) > maxWidth) s = s.slice(0, -1);
    return s + '...';
  };

  const api = {
    W, MARGIN, clean,
    get y() { return y; },
    set y(v) { y = v; },
    addPage() { page = doc.addPage(PAGE); y = PAGE[1] - MARGIN; return page; },
    ensure(h, onNewPage) {
      if (!page) this.addPage();
      if (y - h < BOTTOM) { this.addPage(); if (onNewPage) onNewPage(); }
    },
    text(str, x, yy, { size = 10, isBold = false, color = COLORS.ink, align = 'left', maxWidth } = {}) {
      const f = isBold ? bold : regular;
      const s = fit(str, f, size, maxWidth);
      const w = f.widthOfTextAtSize(s, size);
      const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      page.drawText(s, { x: px, y: yy, size, font: f, color });
    },
    rect(x, yy, w, h, color) { page.drawRectangle({ x, y: yy, width: w, height: h, color }); },
    hline(yy, color = COLORS.rule, x1 = MARGIN, x2 = MARGIN + W) { page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color }); },
    width(str, size, isBold = false) { return (isBold ? bold : regular).widthOfTextAtSize(clean(str), size); },

    /** Big title block at the top of the first page. */
    header(heading, subtitle) {
      if (!page) this.addPage();
      this.rect(0, PAGE[1] - 70, PAGE[0], 70, COLORS.indigo);
      this.text(heading, MARGIN, PAGE[1] - 36, { size: 17, isBold: true, color: COLORS.white, maxWidth: W });
      this.text(subtitle, MARGIN, PAGE[1] - 55, { size: 10, color: rgb(0.85, 0.88, 1), maxWidth: W });
      y = PAGE[1] - 70 - 26;
    },

    /** Label / value pairs in a row of boxes. items: [{ label, value }] */
    summaryBoxes(items, perRow = 3) {
      const gap = 8;
      const bw = (W - gap * (perRow - 1)) / perRow;
      for (let i = 0; i < items.length; i += perRow) {
        this.ensure(48);
        const row = items.slice(i, i + perRow);
        row.forEach((it, k) => {
          const x = MARGIN + k * (bw + gap);
          this.rect(x, y - 38, bw, 38, COLORS.band);
          this.text(it.label, x + 8, y - 14, { size: 8, color: COLORS.muted, maxWidth: bw - 16 });
          this.text(it.value, x + 8, y - 30, { size: 11.5, isBold: true, color: it.color || COLORS.ink, maxWidth: bw - 16 });
        });
        y -= 38 + gap;
      }
      y -= 4;
    },

    sectionTitle(str) {
      this.ensure(40);
      this.text(str, MARGIN, y - 12, { size: 12, isBold: true, color: COLORS.indigo });
      y -= 20;
    },

    /** columns: [{ key, label, width (relative), align }], rows: array of objects. Header repeats on every page. */
    table({ columns, rows, size = 8.5, rowHeight = 15, emptyText = 'Nothing to show for this period.' }) {
      const total = columns.reduce((a, c) => a + c.width, 0);
      const cols = columns.map((c) => ({ ...c, w: (c.width / total) * W }));
      const drawHeader = () => {
        this.rect(MARGIN, y - rowHeight, W, rowHeight, COLORS.band);
        let x = MARGIN;
        for (const c of cols) {
          const pad = 4;
          const tx = c.align === 'right' ? x + c.w - pad : x + pad;
          this.text(c.label, tx, y - rowHeight + 4.5, { size, isBold: true, color: COLORS.indigo, align: c.align === 'right' ? 'right' : 'left', maxWidth: c.w - pad * 2 });
          x += c.w;
        }
        y -= rowHeight;
      };
      this.ensure(rowHeight * 3);
      drawHeader();
      if (!rows.length) {
        this.text(emptyText, MARGIN + 4, y - rowHeight + 4.5, { size, color: COLORS.muted });
        y -= rowHeight;
        return;
      }
      for (const r of rows) {
        this.ensure(rowHeight, drawHeader);
        let x = MARGIN;
        for (const c of cols) {
          const pad = 4;
          const tx = c.align === 'right' ? x + c.w - pad : x + pad;
          this.text(r[c.key], tx, y - rowHeight + 4.5, { size, isBold: !!r._bold, align: c.align === 'right' ? 'right' : 'left', maxWidth: c.w - pad * 2, color: r._color || COLORS.ink });
          x += c.w;
        }
        this.hline(y - rowHeight, COLORS.rule);
        y -= rowHeight;
      }
      y -= 8;
    },

    paragraph(str, { size = 8.5, color = COLORS.muted, gap = 11 } = {}) {
      // simple word wrap
      const words = clean(str).split(' ');
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (regular.widthOfTextAtSize(test, size) > W && line) {
          this.ensure(gap); this.text(line, MARGIN, y - gap + 3, { size, color }); y -= gap; line = w;
        } else line = test;
      }
      if (line) { this.ensure(gap); this.text(line, MARGIN, y - gap + 3, { size, color }); y -= gap; }
      y -= 4;
    },

    async finish(footerLeft) {
      const pages = doc.getPages();
      pages.forEach((p, i) => {
        p.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: MARGIN + W, y: 40 }, thickness: 0.5, color: COLORS.rule });
        p.drawText(clean(footerLeft), { x: MARGIN, y: 28, size: 7.5, font: regular, color: COLORS.muted });
        const label = `Page ${i + 1} of ${pages.length}`;
        p.drawText(label, { x: MARGIN + W - regular.widthOfTextAtSize(label, 7.5), y: 28, size: 7.5, font: regular, color: COLORS.muted });
      });
      return doc.save();
    },
  };
  return api;
}
