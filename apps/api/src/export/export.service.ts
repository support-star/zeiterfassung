import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { format, startOfMonth, endOfMonth, differenceInMinutes } from 'date-fns';
import { de } from 'date-fns/locale';

export interface ExportFilter {
  userId?: string;
  month?: number;
  year?: number;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async exportExcel(filter: ExportFilter): Promise<Buffer> {
    const { entries, users } = await this.fetchData(filter);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Zeiterfassung';
    workbook.created = new Date();

    // Übersichts-Sheet
    const overview = workbook.addWorksheet('Übersicht', { pageSetup: { paperSize: 9, orientation: 'landscape' } });
    this.buildOverviewSheet(overview, entries, users, filter);

    // Pro-Mitarbeiter Sheets
    for (const user of users) {
      const userEntries = entries.filter((e) => e.userId === user.id);
      if (!userEntries.length) continue;
      const sheet = workbook.addWorksheet(`${user.firstName} ${user.lastName}`.substring(0, 31));
      this.buildUserSheet(sheet, user, userEntries, filter);
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async exportPdf(filter: ExportFilter): Promise<Buffer> {
    const { entries, users } = await this.fetchData(filter);
    const title = this.buildTitle(filter);

    const printer = new PdfPrinter({
      Roboto: {
        normal: 'node_modules/pdfmake/build/vfs_fonts.js',
        bold: 'node_modules/pdfmake/build/vfs_fonts.js',
        italics: 'node_modules/pdfmake/build/vfs_fonts.js',
        bolditalics: 'node_modules/pdfmake/build/vfs_fonts.js',
      },
    });

    const content: any[] = [
      { text: `Zeiterfassung – ${title}`, style: 'mainTitle', margin: [0, 0, 0, 4] },
      { text: `Export vom ${format(new Date(), 'dd.MM.yyyy HH:mm')} Uhr`, style: 'subtitle', margin: [0, 0, 0, 20] },
    ];

    for (const user of users) {
      const userEntries = entries.filter((e) => e.userId === user.id).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
      if (!userEntries.length) continue;

      content.push({ text: `${user.firstName} ${user.lastName}`, style: 'userTitle', margin: [0, 12, 0, 6] });

      const tableBody: any[][] = [[
        { text: 'Datum', style: 'tableHeader' }, { text: 'Tag', style: 'tableHeader' },
        { text: 'Von', style: 'tableHeader' }, { text: 'Bis', style: 'tableHeader' },
        { text: 'Pause', style: 'tableHeader' }, { text: 'Netto', style: 'tableHeader' },
        { text: 'Status', style: 'tableHeader' },
      ]];

      let netTotal = 0;
      for (const e of userEntries) {
        const breakMins = this.calcBreakMinutes(e);
        const netMins = this.calcNetMinutes(e);
        netTotal += netMins;
        tableBody.push([
          { text: format(e.startAt, 'dd.MM.yyyy'), style: 'tableCell' },
          { text: format(e.startAt, 'EEE', { locale: de }), style: 'tableCell' },
          { text: format(e.startAt, 'HH:mm'), style: 'tableCell' },
          { text: e.endAt ? format(e.endAt, 'HH:mm') : 'läuft...', style: 'tableCell' },
          { text: `${breakMins} Min`, style: 'tableCell' },
          { text: this.minsToTime(netMins), style: 'tableCellBold' },
          { text: this.statusLabel(e.status), style: 'tableCell' },
        ]);
      }
      tableBody.push([
        { text: `Gesamt: ${userEntries.length} Einträge`, colSpan: 5, style: 'tableSumLabel' },
        {}, {}, {}, {},
        { text: this.minsToTime(netTotal), style: 'tableSumValue' },
        { text: '', style: 'tableCell' },
      ]);

      content.push({
        table: { headerRows: 1, widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', '*'], body: tableBody },
        layout: {
          fillColor: (i: number) => i === 0 ? '#1E3A5F' : i === tableBody.length - 1 ? '#E8EDF5' : i % 2 === 0 ? '#F5F7FA' : null,
          hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => '#CCC',
          paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 6, paddingRight: () => 6,
        },
      });

      content.push({
        columns: [
          { text: 'Unterschrift Mitarbeiter: ________________________', style: 'signature' },
          { text: 'Unterschrift Vorgesetzter: ________________________', style: 'signature' },
        ],
        margin: [0, 14, 0, 10],
      });
    }

    const docDef: TDocumentDefinitions = {
      pageSize: 'A4', pageMargins: [40, 50, 40, 50], content,
      styles: {
        mainTitle: { fontSize: 18, bold: true, color: '#1E3A5F' },
        subtitle: { fontSize: 9, color: '#888' },
        userTitle: { fontSize: 13, bold: true, color: '#1E3A5F', decoration: 'underline' },
        tableHeader: { fontSize: 9, bold: true, color: '#FFFFFF', alignment: 'center' },
        tableCell: { fontSize: 8, alignment: 'center', color: '#333' },
        tableCellBold: { fontSize: 8, bold: true, alignment: 'center', color: '#1E3A5F' },
        tableSumLabel: { fontSize: 8, bold: true, color: '#333', alignment: 'left' },
        tableSumValue: { fontSize: 9, bold: true, color: '#1E3A5F', alignment: 'center' },
        signature: { fontSize: 8, color: '#555', margin: [0, 4, 0, 0] },
      },
      footer: (page: number, count: number) => ({
        columns: [
          { text: 'Zeiterfassung App', style: 'subtitle', margin: [40, 0] },
          { text: `Seite ${page} von ${count}`, alignment: 'right', style: 'subtitle', margin: [0, 0, 40, 0] },
        ],
      }),
    };

    return new Promise((resolve, reject) => {
      const doc = printer.createPdfKitDocument(docDef);
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }

  private buildOverviewSheet(sheet: ExcelJS.Worksheet, entries: any[], users: any[], filter: ExportFilter) {
    sheet.mergeCells('A1:H1');
    const t = sheet.getCell('A1');
    t.value = `Zeiterfassung – ${this.buildTitle(filter)}`;
    t.font = { size: 16, bold: true, color: { argb: 'FF1E3A5F' } };
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 35;

    sheet.mergeCells('A2:H2');
    sheet.getCell('A2').value = `Export vom ${format(new Date(), 'dd.MM.yyyy HH:mm')} Uhr`;
    sheet.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    const hdrs = ['Mitarbeiter', 'Brutto-Std.', 'Pausen', 'Netto-Std.', 'Tage', 'Ø Std./Tag', 'Einträge', 'Status'];
    const hr = sheet.getRow(4);
    hdrs.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    hr.height = 22;

    let row = 5;
    for (const user of users) {
      const ue = entries.filter((e) => e.userId === user.id);
      if (!ue.length) continue;
      const gross = ue.reduce((s, e) => e.endAt ? s + Math.max(0, differenceInMinutes(e.endAt, e.startAt)) : s, 0);
      const breakMins = ue.reduce((s, e) => s + this.calcBreakMinutes(e), 0);
      const net = gross - breakMins;
      const days = new Set(ue.map((e) => format(e.startAt, 'yyyy-MM-dd'))).size;
      const submitted = ue.filter((e) => e.status === 'SUBMITTED').length;

      const r = sheet.getRow(row);
      r.getCell(1).value = `${user.firstName} ${user.lastName}`;
      r.getCell(2).value = this.minsToTime(gross);
      r.getCell(3).value = this.minsToTime(breakMins);
      r.getCell(4).value = this.minsToTime(net); r.getCell(4).font = { bold: true };
      r.getCell(5).value = days;
      r.getCell(6).value = days > 0 ? this.minsToTime(Math.round(net / days)) : '0:00 h';
      r.getCell(7).value = ue.length;
      r.getCell(8).value = submitted > 0 ? `${submitted} offen` : 'ok';
      r.getCell(8).font = { color: { argb: submitted > 0 ? 'FFCC6600' : 'FF006600' } };

      if (row % 2 === 0) {
        for (let c = 1; c <= 8; c++) r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
      }
      for (let c = 1; c <= 8; c++) r.getCell(c).alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle' };
      r.height = 18; row++;
    }
    sheet.columns = [{ width: 28 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 10 }, { width: 14 }];
  }

  private buildUserSheet(sheet: ExcelJS.Worksheet, user: any, entries: any[], filter: ExportFilter) {
    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = `Arbeitszeitnachweis – ${user.firstName} ${user.lastName}`;
    sheet.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FF1E3A5F' } };
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells('A2:G2');
    sheet.getCell('A2').value = this.buildTitle(filter);
    sheet.getCell('A2').font = { size: 10, color: { argb: 'FF555555' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    const hdrs = ['Datum', 'Wochentag', 'Von', 'Bis', 'Pause (Min)', 'Netto', 'Status'];
    const hr = sheet.getRow(4);
    hdrs.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    hr.height = 22;

    const sorted = [...entries].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    let totalNet = 0; let totalBreak = 0;

    sorted.forEach((e, i) => {
      const breakMins = this.calcBreakMinutes(e);
      const netMins = this.calcNetMinutes(e);
      totalNet += netMins; totalBreak += breakMins;

      const r = sheet.getRow(5 + i);
      r.getCell(1).value = format(e.startAt, 'dd.MM.yyyy');
      r.getCell(2).value = format(e.startAt, 'EEEE', { locale: de });
      r.getCell(3).value = format(e.startAt, 'HH:mm');
      r.getCell(4).value = e.endAt ? format(e.endAt, 'HH:mm') : 'läuft...';
      r.getCell(5).value = breakMins;
      r.getCell(6).value = this.minsToTime(netMins); r.getCell(6).font = { bold: true };
      r.getCell(7).value = this.statusLabel(e.status);
      r.getCell(7).font = { color: { argb: this.statusColor(e.status) } };

      if (i % 2 === 0) {
        for (let c = 1; c <= 7; c++) r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
      }
      for (let c = 1; c <= 7; c++) r.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      r.height = 18;
    });

    const sumIdx = 5 + sorted.length + 1;
    sheet.mergeCells(`A${sumIdx}:E${sumIdx}`);
    sheet.getCell(`A${sumIdx}`).value = `Gesamt: ${sorted.length} Einträge | Pausen: ${this.minsToTime(totalBreak)}`;
    sheet.getCell(`A${sumIdx}`).font = { bold: true, color: { argb: 'FF555555' } };
    sheet.getCell(`F${sumIdx}`).value = this.minsToTime(totalNet);
    sheet.getCell(`F${sumIdx}`).font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } };

    const sigIdx = sumIdx + 3;
    sheet.getCell(`A${sigIdx}`).value = 'Unterschrift Mitarbeiter: ________________________';
    sheet.getCell(`D${sigIdx}`).value = 'Unterschrift Vorgesetzter: ________________________';

    sheet.columns = [{ width: 14 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 12 }, { width: 16 }];
  }

  private async fetchData(filter: ExportFilter) {
    const range = this.buildRange(filter);
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        ...(filter.userId && { userId: filter.userId }),
        ...(range && { startAt: { gte: range.from, lte: range.to } }),
      },
      include: { user: true, breaks: true },
      orderBy: { startAt: 'asc' },
    });
    const userIds = [...new Set(entries.map((e) => e.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return { entries, users };
  }

  private buildRange(f: ExportFilter) {
    if (f.from && f.to) return { from: f.from, to: f.to };
    if (f.month && f.year) {
      const d = new Date(f.year, f.month - 1, 1);
      return { from: startOfMonth(d), to: endOfMonth(d) };
    }
    if (f.year) return { from: new Date(f.year, 0, 1), to: new Date(f.year, 11, 31, 23, 59, 59) };
    return null;
  }

  private buildTitle(f: ExportFilter): string {
    if (f.month && f.year) return format(new Date(f.year, f.month - 1, 1), 'MMMM yyyy', { locale: de });
    if (f.year) return `Jahr ${f.year}`;
    if (f.from && f.to) return `${format(f.from, 'dd.MM.yyyy')} – ${format(f.to, 'dd.MM.yyyy')}`;
    return 'Alle Einträge';
  }

  private calcBreakMinutes(entry: any): number {
    if (!entry.breaks?.length) return 0;
    return entry.breaks.reduce((s: number, b: any) => {
      if (!b.endAt) return s;
      return s + Math.max(0, differenceInMinutes(b.endAt, b.startAt));
    }, 0);
  }

  private calcNetMinutes(entry: any): number {
    if (!entry.endAt) return 0;
    return Math.max(0, differenceInMinutes(entry.endAt, entry.startAt) - this.calcBreakMinutes(entry));
  }

  private minsToTime(m: number): string {
    const h = Math.floor(Math.abs(m) / 60);
    const min = Math.abs(m) % 60;
    return `${h}:${String(min).padStart(2, '0')} h`;
  }

  private statusLabel(s: string): string {
    return ({ DRAFT: 'Entwurf', SUBMITTED: 'Eingereicht', APPROVED: 'Genehmigt', LOCKED: 'Gesperrt' }[s] ?? s);
  }

  private statusColor(s: string): string {
    return ({ DRAFT: 'FF888888', SUBMITTED: 'FFCC6600', APPROVED: 'FF006600', LOCKED: 'FF0000CC' }[s] ?? 'FF333333');
  }
}
