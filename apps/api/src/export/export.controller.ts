import { Controller, Get, Query, Res, ParseIntPipe, Optional } from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@zeiterfassung/shared';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('excel')
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  async downloadExcel(
    @Res() res: Response,
    @Query('month', new ParseIntPipe({ optional: true })) month?: number,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const filter = {
      month, year, userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };
    const buffer = await this.exportService.exportExcel(filter);
    const period = month && year
      ? format(new Date(year, month - 1, 1), 'yyyy-MM', { locale: de })
      : format(new Date(), 'yyyy-MM');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="zeiterfassung-${period}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('pdf')
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  async downloadPdf(
    @Res() res: Response,
    @Query('month', new ParseIntPipe({ optional: true })) month?: number,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const filter = {
      month, year, userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };
    const buffer = await this.exportService.exportPdf(filter);
    const period = month && year
      ? format(new Date(year, month - 1, 1), 'yyyy-MM', { locale: de })
      : format(new Date(), 'yyyy-MM');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="zeiterfassung-${period}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
