import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { format, startOfMonth, endOfMonth, differenceInMinutes } from 'date-fns';
import { de } from 'date-fns/locale';

export interface ExportFilter {
  userId?: string;
  month?: number; // 1-12
  year?: number;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────
  // EXCEL EXPORT
  // ─────────────────────────────────────────────────────────────

  async exportExcel(filter: ExportFilter): Promise<Buffer> {
    const { entries, users } = await this.fetchData(filter);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Zeiterfassung App';
    workbook.created = new Date();

    // ── Sheet 1: Übersicht alle Mitarbeiter ──────────────────
    const overviewSheet = workbook.addWorksheet('Übersicht', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
    });

    this.styleOverviewSheet(overviewSheet, entries, users, filter);

    // ── Sheet 2: Pro Mitarbeiter ─────────────────────────────
    for (const user of users) {
      const userEntries = entries.filter((e) => e.userId === user.id);
      if (userEntries.length === 0) continue;

      const sheetName = `${user.firstName} ${user.lastName}`.substring(0, 31);
      const sheet = workbook.addWorksheet(sheetName, {
        pageSetup: { paperSize: 9, orientation: 'portrait' },
      });

      this.styleUserSheet(sheet, user, userEntries, filter);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private styleOverviewSheet(
    sheet: ExcelJS.Worksheet,
    entries: any[],
    users: any[],
    filter: ExportFilter,
  ) {
    const title = this.buildTitle(filter);

    // Titel
    sheet.mergeCells('A1:H1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Zeiterfassung – ${title}`;
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF1E3A5F' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 35;

    sheet.mergeCells('A2:H2');
    sheet.getCell('A2').value = `Exportiert am ${format(new Date(), 'dd.MM.yyyy HH:mm')} Uhr`;
    sheet.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    // Header
    const headers = [
      'Mitarbeiter',
      'Gesamtstunden',
      'Davon Pausen',
      'Netto-Stunden',
      'Anzahl Tage',
      'Ø Stunden/Tag',
      'Einträge',
      'Status',
    ];

    const headerRow = sheet.getRow(4);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF1E3A5F' } },
      };
    });
    headerRow.height = 22;

    // Daten
    let rowIndex = 5;
    for (const user of users) {
      const userEntries = entries.filter((e) => e.userId === user.id);
      if (userEntries.length === 0) continue;

      const totalMinutes = userEntries.reduce((sum, e) => {
        if (!e.startTime || !e.endTime) return sum;
        return sum + differenceInMinutes(new Date(e.endTime), new Date(e.startTime));
      }, 0);

      const breakMinutes = userEntries.reduce((sum, e) => sum + (e.breakMinutes || 0), 0);
      const netMinutes = totalMinutes - breakMinutes;

      const uniqueDays = new Set(
        userEntries
          .filter((e) => e.startTime)
          .map((e) => format(new Date(e.startTime), 'yyyy-MM-dd')),
      ).size;

      const avgMinutes = uniqueDays > 0 ? netMinutes / uniqueDays : 0;
      const approvedCount = userEntries.filter((e) => e.status === 'APPROVED').length;
      const pendingCount = userEntries.filter((e) => e.status === 'SUBMITTED').length;

      const row = sheet.getRow(rowIndex);
      row.getCell(1).value = `${user.firstName} ${user.lastName}`;
      row.getCell(2).value = this.minutesToTime(totalMinutes);
      row.getCell(3).value = this.minutesToTime(breakMinutes);
      row.getCell(4).value = this.minutesToTime(netMinutes);
      row.getCell(4).font = { bold: true };
      row.getCell(5).value = uniqueDays;
      row.getCell(6).value = this.minutesToTime(avgMinutes);
      row.getCell(7).value = userEntries.length;
      row.getCell(8).value =
        pendingCount > 0 ? `${pendingCount} offen` : `${approvedCount} genehmigt`;
      row.getCell(8).font = {
        color: { argb: pendingCount > 0 ? 'FFCC6600' : 'FF006600' },
      };

      if (rowIndex % 2 === 0) {
        for (let c = 1; c <= 8; c++) {
          row.getCell(c).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F7FA' },
          };
        }
      }

      for (let c = 1; c <= 8; c++) {
        row.getCell(c).alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle' };
      }

      row.height = 18;
      rowIndex++;
    }

    // Spaltenbreiten
    sheet.columns = [
      { width: 28 }, { width: 15 }, { width: 14 }, { width: 15 },
      { width: 13 }, { width: 14 }, { width: 10 }, { width: 16 },
    ];
  }

  private styleUserSheet(
    sheet: ExcelJS.Worksheet,
    user: any,
    entries: any[],
    filter: ExportFilter,
  ) {
    const title = this.buildTitle(filter);
    const fullName = `${user.firstName} ${user.lastName}`;

    // Titel
    sheet.mergeCells('A1:G1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Arbeitszeitnachweis – ${fullName}`;
    titleCell.font = { size: 14, bold: true, color: { argb: 'FF1E3A5F' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells('A2:G2');
    sheet.getCell('A2').value = title;
    sheet.getCell('A2').font = { size: 10, color: { argb: 'FF555555' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    // Header
    const headers = ['Datum', 'Wochentag', 'Von', 'Bis', 'Pause (Min)', 'Netto', 'Status'];
    const headerRow = sheet.getRow(4);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 22;

    // Einträge sortiert nach Datum
    const sorted = [...entries].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    let totalNetMinutes = 0;
    let totalBreakMinutes = 0;

    sorted.forEach((entry, idx) => {
      const startDate = entry.startTime ? new Date(entry.startTime) : null;
      const endDate = entry.endTime ? new Date(entry.endTime) : null;
      const breakMins = entry.breakMinutes || 0;
      const durationMins =
        startDate && endDate
          ? Math.max(0, differenceInMinutes(endDate, startDate) - breakMins)
          : 0;

      totalNetMinutes += durationMins;
      totalBreakMinutes += breakMins;

      const row = sheet.getRow(5 + idx);
      row.getCell(1).value = startDate ? format(startDate, 'dd.MM.yyyy') : '-';
      row.getCell(2).value = startDate
        ? format(startDate, 'EEEE', { locale: de })
        : '-';
      row.getCell(3).value = startDate ? format(startDate, 'HH:mm') : '-';
      row.getCell(4).value = endDate ? format(endDate, 'HH:mm') : 'läuft...';
      row.getCell(5).value = breakMins;
      row.getCell(6).value = this.minutesToTime(durationMins);
      row.getCell(6).font = { bold: true };
      row.getCell(7).value = this.statusLabel(entry.status);
      row.getCell(7).font = { color: { argb: this.statusColor(entry.status) } };

      if (idx % 2 === 0) {
        for (let c = 1; c <= 7; c++) {
          row.getCell(c).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F7FA' },
          };
        }
      }

      for (let c = 1; c <= 7; c++) {
        row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      }
      row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      row.height = 18;
    });

    // Summenzeile
    const sumRow = sheet.getRow(5 + sorted.length + 1);
    sheet.mergeCells(`A${5 + sorted.length + 1}:E${5 + sorted.length + 1}`);
    sumRow.getCell(1).value = `Gesamt: ${sorted.length} Einträge | Pausen: ${this.minutesToTime(totalBreakMinutes)}`;
    sumRow.getCell(1).font = { bold: true, color: { argb: 'FF555555' } };
    sumRow.getCell(6).value = this.minutesToTime(totalNetMinutes);
    sumRow.getCell(6).font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } };
    sumRow.height = 22;

    // Unterschriftszeile
    const sigRow = 5 + sorted.length + 4;
    sheet.getCell(`A${sigRow}`).value = 'Unterschrift Mitarbeiter: ________________________';
    sheet.getCell(`D${sigRow}`).value = 'Unterschrift Vorgesetzter: ________________________';

    sheet.columns = [
      { width: 14 }, { width: 14 }, { width: 10 }, { width: 10 },
      { width: 14 }, { width: 12 }, { width: 16 },
    ];
  }

  // ─────────────────────────────────────────────────────────────
  // PDF EXPORT
  // ─────────────────────────────────────────────────────────────

  async exportPdf(filter: ExportFilter): Promise<Buffer> {
    const { entries, users } = await this.fetchData(filter);
    const title = this.buildTitle(filter);

    const fonts = {
      Roboto: {
        normal: 'node_modules/pdfmake/build/vfs_fonts.js',
        bold: 'node_modules/pdfmake/build/vfs_fonts.js',
        italics: 'node_modules/pdfmake/build/vfs_fonts.js',
        bolditalics: 'node_modules/pdfmake/build/vfs_fonts.js',
      },
    };

    const printer = new PdfPrinter(fonts);

    const content: any[] = [
      {
        text: `Zeiterfassung – ${title}`,
        style: 'mainTitle',
        margin: [0, 0, 0, 4],
      },
      {
        text: `Exportiert am ${format(new Date(), 'dd.MM.yyyy HH:mm')} Uhr`,
        style: 'subtitle',
        margin: [0, 0, 0, 20],
      },
    ];

    for (const user of users) {
      const userEntries = entries
        .filter((e) => e.userId === user.id)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      if (userEntries.length === 0) continue;

      const totalMinutes = userEntries.reduce((sum, e) => {
        if (!e.startTime || !e.endTime) return sum;
        return (
          sum +
          Math.max(
            0,
            differenceInMinutes(new Date(e.endTime), new Date(e.startTime)) -
              (e.breakMinutes || 0),
          )
        );
      }, 0);

      content.push({
        text: `${user.firstName} ${user.lastName}`,
        style: 'userTitle',
        margin: [0, 12, 0, 6],
      });

      // Tabelle
      const tableBody: any[][] = [
        [
          { text: 'Datum', style: 'tableHeader' },
          { text: 'Tag', style: 'tableHeader' },
          { text: 'Von', style: 'tableHeader' },
          { text: 'Bis', style: 'tableHeader' },
          { text: 'Pause', style: 'tableHeader' },
          { text: 'Netto', style: 'tableHeader' },
          { text: 'Status', style: 'tableHeader' },
        ],
      ];

      let netTotal = 0;
      for (const entry of userEntries) {
        const startDate = entry.startTime ? new Date(entry.startTime) : null;
        const endDate = entry.endTime ? new Date(entry.endTime) : null;
        const breakMins = entry.breakMinutes || 0;
        const durationMins =
          startDate && endDate
            ? Math.max(0, differenceInMinutes(endDate, startDate) - breakMins)
            : 0;
        netTotal += durationMins;

        tableBody.push([
          { text: startDate ? format(startDate, 'dd.MM.yyyy') : '-', style: 'tableCell' },
          { text: startDate ? format(startDate, 'EEE', { locale: de }) : '-', style: 'tableCell' },
          { text: startDate ? format(startDate, 'HH:mm') : '-', style: 'tableCell' },
          { text: endDate ? format(endDate, 'HH:mm') : 'läuft...', style: 'tableCell' },
          { text: `${breakMins} Min`, style: 'tableCell' },
          { text: this.minutesToTime(durationMins), style: 'tableCellBold' },
          { text: this.statusLabel(entry.status), style: 'tableCell' },
        ]);
      }

      // Summenzeile
      tableBody.push([
        { text: `Gesamt: ${userEntries.length} Einträge`, colSpan: 5, style: 'tableSumLabel' },
        {},
        {},
        {},
        {},
        { text: this.minutesToTime(netTotal), style: 'tableSumValue' },
        { text: '', style: 'tableCell' },
      ]);

      content.push({
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', '*'],
          body: tableBody,
        },
        layout: {
          fillColor: (rowIndex: number) => {
            if (rowIndex === 0) return '#1E3A5F';
            if (rowIndex === tableBody.length - 1) return '#E8EDF5';
            return rowIndex % 2 === 0 ? '#F5F7FA' : null;
          },
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => '#CCCCCC',
          paddingTop: () => 5,
          paddingBottom: () => 5,
          paddingLeft: () => 6,
          paddingRight: () => 6,
        },
      });

      // Unterschrift
      content.push({
        columns: [
          { text: 'Unterschrift Mitarbeiter: ________________________', style: 'signature' },
          { text: 'Unterschrift Vorgesetzter: ________________________', style: 'signature' },
        ],
        margin: [0, 14, 0, 0],
      });

      content.push({ text: '', margin: [0, 0, 0, 10] });
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 50, 40, 50],
      content,
      styles: {
        mainTitle: { fontSize: 18, bold: true, color: '#1E3A5F' },
        subtitle: { fontSize: 9, color: '#888888' },
        userTitle: { fontSize: 13, bold: true, color: '#1E3A5F', decoration: 'underline' },
        tableHeader: { fontSize: 9, bold: true, color: '#FFFFFF', alignment: 'center' },
        tableCell: { fontSize: 8, alignment: 'center', color: '#333333' },
        tableCellBold: { fontSize: 8, bold: true, alignment: 'center', color: '#1E3A5F' },
        tableSumLabel: { fontSize: 8, bold: true, color: '#333333', alignment: 'left' },
        tableSumValue: { fontSize: 9, bold: true, color: '#1E3A5F', alignment: 'center' },
        signature: { fontSize: 8, color: '#555555', margin: [0, 4, 0, 0] },
      },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: 'Zeiterfassung App', style: 'subtitle', margin: [40, 0] },
          {
            text: `Seite ${currentPage} von ${pageCount}`,
            alignment: 'right',
            style: 'subtitle',
            margin: [0, 0, 40, 0],
          },
        ],
      }),
    };

    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // HILFSMETHODEN
  // ─────────────────────────────────────────────────────────────

  private async fetchData(filter: ExportFilter) {
    const dateRange = this.buildDateRange(filter);

    const whereClause: any = {};
    if (filter.userId) whereClause.userId = filter.userId;
    if (dateRange) {
      whereClause.startTime = { gte: dateRange.from, lte: dateRange.to };
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: whereClause,
      include: { user: true },
      orderBy: { startTime: 'asc' },
    });

    const userIds = [...new Set(entries.map((e) => e.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return { entries, users };
  }

  private buildDateRange(filter: ExportFilter): { from: Date; to: Date } | null {
    if (filter.from && filter.to) return { from: filter.from, to: filter.to };
    if (filter.month && filter.year) {
      const date = new Date(filter.year, filter.month - 1, 1);
      return { from: startOfMonth(date), to: endOfMonth(date) };
    }
    if (filter.year) {
      return {
        from: new Date(filter.year, 0, 1),
        to: new Date(filter.year, 11, 31, 23, 59, 59),
      };
    }
    return null;
  }

  private buildTitle(filter: ExportFilter): string {
    if (filter.month && filter.year) {
      const date = new Date(filter.year, filter.month - 1, 1);
      return format(date, 'MMMM yyyy', { locale: de });
    }
    if (filter.year) return `Jahr ${filter.year}`;
    if (filter.from && filter.to) {
      return `${format(filter.from, 'dd.MM.yyyy')} – ${format(filter.to, 'dd.MM.yyyy')}`;
    }
    return 'Alle Einträge';
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(Math.abs(minutes) / 60);
    const m = Math.abs(minutes) % 60;
    return `${h}:${m.toString().padStart(2, '0')} h`;
  }

  private statusLabel(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'Entwurf',
      SUBMITTED: 'Eingereicht',
      APPROVED: 'Genehmigt',
      LOCKED: 'Gesperrt',
    };
    return map[status] ?? status;
  }

  private statusColor(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'FF888888',
      SUBMITTED: 'FFCC6600',
      APPROVED: 'FF006600',
      LOCKED: 'FF0000CC',
    };
    return map[status] ?? 'FF333333';
  }
}
