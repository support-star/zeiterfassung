import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  ParseIntPipe,
  Optional,
} from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../common/guards/roles.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

@Controller('export')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /**
   * GET /export/excel
   * Query-Params:
   *   - month: 1-12
   *   - year: z.B. 2025
   *   - userId: (optional) nur ein Mitarbeiter
   *   - from: ISO-Datum (optional)
   *   - to:   ISO-Datum (optional)
   *
   * Nur Admin + Dispo dürfen exportieren.
   */
  @Get('excel')
  @Roles('ADMIN', 'DISPO')
  async downloadExcel(
    @Res() res: Response,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const filter = this.buildFilter({ month, year, userId, from, to });
    const buffer = await this.exportService.exportExcel(filter);

    const filename = this.buildFilename('Zeiterfassung', filter, 'xlsx');

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  /**
   * GET /export/pdf
   * Query-Params identisch zu /export/excel
   */
  @Get('pdf')
  @Roles('ADMIN', 'DISPO')
  async downloadPdf(
    @Res() res: Response,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const filter = this.buildFilter({ month, year, userId, from, to });
    const buffer = await this.exportService.exportPdf(filter);

    const filename = this.buildFilename('Zeiterfassung', filter, 'pdf');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  // ─────────────────────────────────────────────────────────────

  private buildFilter(params: {
    month?: string;
    year?: string;
    userId?: string;
    from?: string;
    to?: string;
  }) {
    return {
      month: params.month ? parseInt(params.month, 10) : undefined,
      year: params.year ? parseInt(params.year, 10) : undefined,
      userId: params.userId || undefined,
      from: params.from ? new Date(params.from) : undefined,
      to: params.to ? new Date(params.to) : undefined,
    };
  }

  private buildFilename(
    prefix: string,
    filter: { month?: number; year?: number; from?: Date; to?: Date },
    ext: string,
  ): string {
    let suffix = 'gesamt';
    if (filter.month && filter.year) {
      const date = new Date(filter.year, filter.month - 1, 1);
      suffix = format(date, 'yyyy-MM', { locale: de });
    } else if (filter.year) {
      suffix = String(filter.year);
    } else if (filter.from && filter.to) {
      suffix = `${format(filter.from, 'yyyy-MM-dd')}_${format(filter.to, 'yyyy-MM-dd')}`;
    }
    return `${prefix}_${suffix}.${ext}`;
  }
}
