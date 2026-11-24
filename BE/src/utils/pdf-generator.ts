/**
 * Lightweight Zero-Dependency PDF 1.4 Generator for Invoices, Receipts & Labels
 * Produces standards-compliant binary PDF documents directly via pure TypeScript.
 */

interface PdfTextOptions {
  font?: 'F1' | 'F2'; // F1: Helvetica, F2: Helvetica-Bold
  size?: number;
  color?: [number, number, number]; // 0.0 - 1.0 RGB
}

export class SimplePdfDocument {
  private width = 595.28; // A4 pt width
  private height = 841.89; // A4 pt height
  private contentStream: string[] = [];

  constructor(width = 595.28, height = 841.89) {
    this.width = width;
    this.height = height;
  }

  drawText(text: string, x: number, y: number, options: PdfTextOptions = {}): this {
    const font = options.font || 'F1';
    const size = options.size || 10;
    const color = options.color || [0.1, 0.1, 0.1];

    // Escape parentheses and backslashes in PDF text string
    const sanitized = String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

    this.contentStream.push('BT');
    this.contentStream.push(`/${font} ${size} Tf`);
    this.contentStream.push(`${color[0].toFixed(2)} ${color[1].toFixed(2)} ${color[2].toFixed(2)} rg`);
    this.contentStream.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
    this.contentStream.push(`(${sanitized}) Tj`);
    this.contentStream.push('ET');
    return this;
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, lineWidth = 0.5, strokeColor: [number, number, number] = [0.8, 0.8, 0.8]): this {
    this.contentStream.push(`${lineWidth.toFixed(2)} w`);
    this.contentStream.push(`${strokeColor[0].toFixed(2)} ${strokeColor[1].toFixed(2)} ${strokeColor[2].toFixed(2)} RG`);
    this.contentStream.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m`);
    this.contentStream.push(`${x2.toFixed(2)} ${y2.toFixed(2)} l`);
    this.contentStream.push('S');
    return this;
  }

  drawRect(x: number, y: number, w: number, h: number, fillColor?: [number, number, number], strokeColor?: [number, number, number]): this {
    if (fillColor) {
      this.contentStream.push(`${fillColor[0].toFixed(2)} ${fillColor[1].toFixed(2)} ${fillColor[2].toFixed(2)} rg`);
    }
    if (strokeColor) {
      this.contentStream.push(`${strokeColor[0].toFixed(2)} ${strokeColor[1].toFixed(2)} ${strokeColor[2].toFixed(2)} RG`);
      this.contentStream.push('0.5 w');
    }
    this.contentStream.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (fillColor && strokeColor) {
      this.contentStream.push('B');
    } else if (fillColor) {
      this.contentStream.push('f');
    } else if (strokeColor) {
      this.contentStream.push('S');
    }
    return this;
  }

  toBuffer(): Buffer {
    const streamData = this.contentStream.join('\n');
    const streamLength = Buffer.byteLength(streamData, 'utf8');

    const objects: string[] = [];
    const offsets: number[] = [];

    // Helper to add PDF object
    const addObject = (content: string) => {
      objects.push(content);
    };

    // 1: Catalog
    addObject('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
    // 2: Pages
    addObject('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
    // 3: Page
    addObject(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj`
    );
    // 4: Regular font (Helvetica)
    addObject('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj');
    // 5: Bold font (Helvetica-Bold)
    addObject('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj');
    // 6: Contents stream
    addObject(`6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamData}\nendstream\nendobj`);

    // Build the complete PDF file
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    let currentOffset = Buffer.byteLength(pdf, 'utf8');

    for (let i = 0; i < objects.length; i++) {
      offsets.push(currentOffset);
      const objStr = objects[i] + '\n';
      pdf += objStr;
      currentOffset += Buffer.byteLength(objStr, 'utf8');
    }

    const startXref = currentOffset;
    pdf += 'xref\n';
    pdf += `0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 0; i < offsets.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += 'trailer\n';
    pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += 'startxref\n';
    pdf += `${startXref}\n`;
    pdf += '%%EOF\n';

    return Buffer.from(pdf, 'utf8');
  }
}

export interface InvoicePdfData {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  customerPhone?: string;
  customerCnicMasked?: string;
  paymentStatus: string;
  items: Array<{
    productName: string;
    identifier?: string;
    quantity: number;
    actualPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  shopkeeperName: string;
  notes?: string;
}

export function generateInvoicePdf(data: InvoicePdfData): Buffer {
  const doc = new SimplePdfDocument(595.28, 841.89);
  const left = 45;
  const right = 550;
  let y = 800;

  // Header Bar
  doc.drawRect(left, y - 5, right - left, 40, [0.95, 0.97, 1.0], [0.85, 0.9, 0.98]);
  doc.drawText(data.shopName.toUpperCase(), left + 15, y + 18, { font: 'F2', size: 16, color: [0.08, 0.2, 0.45] });
  doc.drawText('ORIGINAL TAX INVOICE', right - 165, y + 18, { font: 'F2', size: 12, color: [0.15, 0.35, 0.7] });
  y -= 45;

  // Shop info
  if (data.shopAddress) {
    doc.drawText(data.shopAddress, left, y, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });
    y -= 14;
  }
  if (data.shopPhone) {
    doc.drawText(`Phone: ${data.shopPhone}`, left, y, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });
    y -= 18;
  }

  // Invoice Details Box & Customer Info Box
  doc.drawLine(left, y, right, y, 1, [0.8, 0.85, 0.9]);
  y -= 18;

  // Left column: Customer
  doc.drawText('INVOICE TO:', left, y, { font: 'F2', size: 10, color: [0.2, 0.2, 0.2] });
  // Right column: Invoice details
  doc.drawText(`Invoice No: ${data.invoiceNo}`, 380, y, { font: 'F2', size: 11, color: [0.1, 0.1, 0.1] });
  y -= 15;

  doc.drawText(data.customerName, left, y, { font: 'F1', size: 10 });
  doc.drawText(`Date: ${data.date}`, 380, y, { font: 'F1', size: 9, color: [0.3, 0.3, 0.3] });
  y -= 14;

  if (data.customerPhone) {
    doc.drawText(`Phone: ${data.customerPhone}`, left, y, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });
  }
  doc.drawText(`Payment Status: ${data.paymentStatus}`, 380, y, {
    font: 'F2',
    size: 9,
    color: data.paymentStatus === 'PAID' ? [0.1, 0.6, 0.2] : [0.8, 0.2, 0.1],
  });
  y -= 14;

  if (data.customerCnicMasked) {
    doc.drawText(`CNIC: ${data.customerCnicMasked}`, left, y, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });
    y -= 14;
  }
  doc.drawText(`Salesperson: ${data.shopkeeperName}`, 380, y + 14, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });

  y -= 15;
  // Items Table Header
  doc.drawRect(left, y - 6, right - left, 22, [0.93, 0.94, 0.96]);
  doc.drawText('DESCRIPTION / SERIAL / IMEI', left + 8, y, { font: 'F2', size: 9, color: [0.2, 0.2, 0.2] });
  doc.drawText('QTY', 340, y, { font: 'F2', size: 9, color: [0.2, 0.2, 0.2] });
  doc.drawText('UNIT PRICE', 400, y, { font: 'F2', size: 9, color: [0.2, 0.2, 0.2] });
  doc.drawText('TOTAL', 485, y, { font: 'F2', size: 9, color: [0.2, 0.2, 0.2] });
  y -= 22;

  // Items List
  for (const item of data.items) {
    let nameLine = item.productName;
    if (item.identifier) {
      nameLine += ` (ID: ${item.identifier})`;
    }
    // Truncate if too long
    if (nameLine.length > 46) nameLine = nameLine.slice(0, 44) + '...';

    doc.drawText(nameLine, left + 8, y, { font: 'F1', size: 9 });
    doc.drawText(String(item.quantity), 345, y, { font: 'F1', size: 9 });
    doc.drawText(`$${item.actualPrice.toFixed(2)}`, 405, y, { font: 'F1', size: 9 });
    doc.drawText(`$${item.subtotal.toFixed(2)}`, 485, y, { font: 'F2', size: 9 });

    y -= 8;
    doc.drawLine(left, y, right, y, 0.4, [0.9, 0.9, 0.9]);
    y -= 12;
  }

  y -= 10;
  // Summary Block (Right Aligned)
  const sumLeft = 360;
  doc.drawText('Subtotal:', sumLeft, y, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });
  doc.drawText(`$${data.subtotal.toFixed(2)}`, 485, y, { font: 'F1', size: 9 });
  y -= 15;

  if (data.discountAmount > 0) {
    doc.drawText('Discount:', sumLeft, y, { font: 'F1', size: 9, color: [0.8, 0.2, 0.2] });
    doc.drawText(`-$${data.discountAmount.toFixed(2)}`, 485, y, { font: 'F1', size: 9, color: [0.8, 0.2, 0.2] });
    y -= 15;
  }

  if (data.taxAmount > 0) {
    doc.drawText(`Tax (${data.taxRate}%):`, sumLeft, y, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });
    doc.drawText(`+$${data.taxAmount.toFixed(2)}`, 485, y, { font: 'F1', size: 9 });
    y -= 15;
  }

  doc.drawLine(sumLeft, y + 4, right, y + 4, 0.8, [0.7, 0.7, 0.7]);
  doc.drawText('Total Amount:', sumLeft, y - 5, { font: 'F2', size: 11, color: [0.1, 0.1, 0.1] });
  doc.drawText(`$${data.totalAmount.toFixed(2)}`, 485, y - 5, { font: 'F2', size: 12, color: [0.1, 0.3, 0.7] });
  y -= 25;

  doc.drawText('Amount Paid:', sumLeft, y, { font: 'F1', size: 9, color: [0.2, 0.6, 0.2] });
  doc.drawText(`$${data.amountPaid.toFixed(2)}`, 485, y, { font: 'F2', size: 9, color: [0.2, 0.6, 0.2] });
  y -= 15;

  if (data.balanceDue > 0) {
    doc.drawText('Balance Due:', sumLeft, y, { font: 'F2', size: 10, color: [0.8, 0.2, 0.1] });
    doc.drawText(`$${data.balanceDue.toFixed(2)}`, 485, y, { font: 'F2', size: 10, color: [0.8, 0.2, 0.1] });
    y -= 20;
  }

  // Footer notes & warranty policy
  y = 80;
  doc.drawLine(left, y, right, y, 0.5, [0.8, 0.8, 0.8]);
  y -= 15;
  doc.drawText('Terms & Conditions: Physical damage, liquid contact, and unauthorized disassembly void warranty.', left, y, {
    font: 'F1',
    size: 7.5,
    color: [0.5, 0.5, 0.5],
  });
  y -= 11;
  doc.drawText('Phones carry manufacturer or shop warranty as stated on product documentation. Thank you for your business!', left, y, {
    font: 'F1',
    size: 7.5,
    color: [0.5, 0.5, 0.5],
  });

  return doc.toBuffer();
}

export interface ReceiptPdfData {
  shopName: string;
  receiptNo: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  paymentMethod: string;
  amountReceived: number;
  previousBalance: number;
  remainingBalance: number;
  receivedByName: string;
  notes?: string;
}

export function generateReceiptPdf(data: ReceiptPdfData): Buffer {
  // A5 Receipt format
  const doc = new SimplePdfDocument(420, 595);
  const left = 35;
  const right = 385;
  let y = 550;

  doc.drawRect(left, y - 5, right - left, 35, [0.93, 0.98, 0.94], [0.75, 0.9, 0.8]);
  doc.drawText(data.shopName.toUpperCase(), left + 12, y + 14, { font: 'F2', size: 13, color: [0.1, 0.45, 0.2] });
  doc.drawText('PAYMENT RECEIPT', right - 130, y + 14, { font: 'F2', size: 10, color: [0.1, 0.45, 0.2] });
  y -= 45;

  doc.drawText(`Receipt No: ${data.receiptNo}`, left, y, { font: 'F2', size: 11 });
  doc.drawText(`Date: ${data.date}`, right - 120, y, { font: 'F1', size: 9, color: [0.3, 0.3, 0.3] });
  y -= 18;
  doc.drawText(`Original Invoice: ${data.invoiceNo}`, left, y, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });
  y -= 20;

  doc.drawLine(left, y, right, y, 0.8, [0.8, 0.85, 0.8]);
  y -= 20;

  doc.drawText('Received From:', left, y, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });
  doc.drawText(data.customerName, left + 110, y, { font: 'F2', size: 10 });
  y -= 18;

  doc.drawText('Payment Method:', left, y, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });
  doc.drawText(data.paymentMethod, left + 110, y, { font: 'F1', size: 10 });
  y -= 25;

  // Receipt Amount Box
  doc.drawRect(left, y - 10, right - left, 40, [0.96, 0.98, 0.96], [0.8, 0.9, 0.8]);
  doc.drawText('AMOUNT RECEIVED:', left + 15, y + 12, { font: 'F2', size: 11, color: [0.1, 0.4, 0.15] });
  doc.drawText(`$${data.amountReceived.toFixed(2)}`, right - 110, y + 10, { font: 'F2', size: 16, color: [0.1, 0.5, 0.2] });
  y -= 35;

  doc.drawText('Previous Outstanding Balance:', left, y, { font: 'F1', size: 9, color: [0.4, 0.4, 0.4] });
  doc.drawText(`$${data.previousBalance.toFixed(2)}`, right - 90, y, { font: 'F1', size: 9 });
  y -= 16;

  doc.drawText('Remaining Balance Due:', left, y, { font: 'F2', size: 10, color: data.remainingBalance > 0 ? [0.8, 0.2, 0.1] : [0.1, 0.6, 0.2] });
  doc.drawText(`$${data.remainingBalance.toFixed(2)}`, right - 90, y, { font: 'F2', size: 10, color: data.remainingBalance > 0 ? [0.8, 0.2, 0.1] : [0.1, 0.6, 0.2] });
  y -= 25;

  if (data.notes) {
    doc.drawText(`Notes: ${data.notes}`, left, y, { font: 'F1', size: 8.5, color: [0.4, 0.4, 0.4] });
    y -= 18;
  }

  y = 60;
  doc.drawLine(left, y, right, y, 0.5, [0.8, 0.8, 0.8]);
  y -= 15;
  doc.drawText(`Cashier / Received By: ${data.receivedByName}`, left, y, { font: 'F1', size: 8, color: [0.4, 0.4, 0.4] });
  doc.drawText('System Generated Financial Document', right - 160, y, { font: 'F1', size: 8, color: [0.5, 0.5, 0.5] });

  return doc.toBuffer();
}

export interface LabelPdfData {
  productName: string;
  identifier: string; // IMEI or SKU/Barcode
  sellingPrice: number;
  specs?: string;
  shopName: string;
}

export function generateProductLabelPdf(data: LabelPdfData): Buffer {
  // 50mm x 30mm label in points (1mm ~ 2.83465 pt): 142 x 85 pt
  const doc = new SimplePdfDocument(142, 85);
  doc.drawRect(2, 2, 138, 81, [1, 1, 1], [0.8, 0.8, 0.8]);

  doc.drawText(data.shopName.slice(0, 20), 6, 72, { font: 'F2', size: 7, color: [0.3, 0.3, 0.3] });
  doc.drawText(data.productName.slice(0, 22), 6, 58, { font: 'F2', size: 8, color: [0.1, 0.1, 0.1] });

  if (data.specs) {
    doc.drawText(data.specs.slice(0, 26), 6, 46, { font: 'F1', size: 6.5, color: [0.4, 0.4, 0.4] });
  }

  // Draw simulated barcode lines
  let bx = 6;
  const barcodeY = 22;
  const chars = data.identifier.split('');
  for (let i = 0; i < Math.min(chars.length, 20); i++) {
    const code = chars[i].charCodeAt(0);
    const w = (code % 2 === 0) ? 1.2 : 0.6;
    doc.drawLine(bx, barcodeY, bx, barcodeY + 14, w, [0, 0, 0]);
    bx += (code % 3 === 0) ? 3.0 : 2.2;
    if (bx > 130) break;
  }

  doc.drawText(data.identifier, 6, 12, { font: 'F1', size: 6.5, color: [0.2, 0.2, 0.2] });
  doc.drawText(`$${data.sellingPrice.toFixed(2)}`, 88, 12, { font: 'F2', size: 9, color: [0.1, 0.4, 0.1] });

  return doc.toBuffer();
}

export interface ReportPdfData {
  reportTitle: string;
  shopName: string;
  dateRange: string;
  summaryCards?: Array<{ label: string; value: string }>;
  headers: string[];
  rows: string[][];
}

export function generateReportPdf(data: ReportPdfData): Buffer {
  // A4 Landscape format for data tables: 841.89 x 595.28 pt
  const doc = new SimplePdfDocument(841.89, 595.28);
  const left = 35;
  const right = 805;
  let y = 560;

  // Header Banner
  doc.drawRect(left, y - 5, right - left, 35, [0.08, 0.2, 0.45]);
  doc.drawText(data.shopName.toUpperCase(), left + 15, y + 12, { font: 'F2', size: 14, color: [1, 1, 1] });
  doc.drawText(data.reportTitle.toUpperCase(), right - 220, y + 12, { font: 'F2', size: 12, color: [0.9, 0.95, 1.0] });
  y -= 38;

  // Subtitle / Date range
  doc.drawText(`Generated on: ${new Date().toISOString().slice(0, 10)} | Period: ${data.dateRange}`, left, y, {
    font: 'F1',
    size: 8.5,
    color: [0.4, 0.4, 0.4],
  });
  y -= 18;

  // Summary Cards Bar (if provided)
  if (data.summaryCards && data.summaryCards.length > 0) {
    const cardWidth = Math.min(180, (right - left) / data.summaryCards.length - 8);
    let cx = left;
    for (const card of data.summaryCards) {
      doc.drawRect(cx, y - 25, cardWidth, 32, [0.96, 0.97, 0.99], [0.85, 0.9, 0.95]);
      doc.drawText(card.label.toUpperCase(), cx + 8, y - 2, { font: 'F1', size: 7.5, color: [0.5, 0.5, 0.5] });
      doc.drawText(card.value, cx + 8, y - 18, { font: 'F2', size: 12, color: [0.1, 0.25, 0.5] });
      cx += cardWidth + 8;
    }
    y -= 38;
  }

  // Table Column Headers
  const colCount = data.headers.length;
  const colWidth = (right - left) / colCount;

  doc.drawRect(left, y - 6, right - left, 20, [0.92, 0.94, 0.96], [0.8, 0.85, 0.9]);
  for (let i = 0; i < colCount; i++) {
    doc.drawText(data.headers[i].toUpperCase(), left + i * colWidth + 5, y, { font: 'F2', size: 8, color: [0.2, 0.2, 0.2] });
  }
  y -= 18;

  // Data Rows (up to 24 rows per page)
  const maxRows = Math.min(data.rows.length, 24);
  for (let r = 0; r < maxRows; r++) {
    const row = data.rows[r];
    const isEven = r % 2 === 0;
    if (isEven) {
      doc.drawRect(left, y - 5, right - left, 16, [0.98, 0.99, 1.0]);
    }

    for (let c = 0; c < colCount; c++) {
      const cellVal = String(row[c] || '');
      const truncated = cellVal.length > 25 ? cellVal.slice(0, 23) + '..' : cellVal;
      doc.drawText(truncated, left + c * colWidth + 5, y, { font: 'F1', size: 7.5, color: [0.15, 0.15, 0.15] });
    }

    y -= 6;
    doc.drawLine(left, y, right, y, 0.3, [0.9, 0.9, 0.9]);
    y -= 10;
  }

  // Footer
  y = 25;
  doc.drawLine(left, y + 10, right, y + 10, 0.5, [0.8, 0.8, 0.8]);
  doc.drawText(`Page 1 of 1 | Mobile Shop SaaS Management System`, left, y, { font: 'F1', size: 7.5, color: [0.5, 0.5, 0.5] });
  doc.drawText(`Confidential Business Report`, right - 130, y, { font: 'F1', size: 7.5, color: [0.5, 0.5, 0.5] });

  return doc.toBuffer();
}

