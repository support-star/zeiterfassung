import { Controller, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /reports/team?month=1&year=2025
   * Team-Monatsauswertung (nur Admin/Dispo)
   */
  @Get('team')
  @Roles('ADMIN', 'DISPO')
  getTeamMonthlyReport(
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.reportsService.getTeamMonthlyReport(month, year);
  }

  /**
   * GET /reports/pending
   * Alle noch nicht genehmigten Einträge (nur Admin/Dispo)
   */
  @Get('pending')
  @Roles('ADMIN', 'DISPO')
  getPendingEntries() {
    return this.reportsService.getPendingEntries();
  }

  /**
   * GET /reports/user/:userId/monthly?month=1&year=2025
   * Monatsbericht eines einzelnen Mitarbeiters
   * Admin/Dispo dürfen jeden sehen, Worker nur sich selbst
   */
  @Get('user/:userId/monthly')
  @Roles('ADMIN', 'DISPO', 'WORKER')
  async getUserMonthlyReport(
    @Param('userId') userId: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
    @CurrentUser() currentUser: any,
  ) {
    // Worker darf nur eigene Daten sehen
    if (currentUser.role === 'WORKER' && currentUser.id !== userId) {
      userId = currentUser.id;
    }
    return this.reportsService.getUserMonthlyReport(userId, month, year);
  }

  /**
   * GET /reports/user/:userId/yearly?year=2025
   * Jahresauswertung eines Mitarbeiters
   */
  @Get('user/:userId/yearly')
  @Roles('ADMIN', 'DISPO', 'WORKER')
  async getUserYearlyReport(
    @Param('userId') userId: string,
    @Query('year', ParseIntPipe) year: number,
    @CurrentUser() currentUser: any,
  ) {
    if (currentUser.role === 'WORKER' && currentUser.id !== userId) {
      userId = currentUser.id;
    }
    return this.reportsService.getUserYearlyReport(userId, year);
  }

  /**
   * GET /reports/me/monthly?month=1&year=2025
   * Eigener Monatsbericht (für Worker-Kurzroute)
   */
  @Get('me/monthly')
  @Roles('ADMIN', 'DISPO', 'WORKER')
  getMyMonthlyReport(
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
    @CurrentUser() currentUser: any,
  ) {
    return this.reportsService.getUserMonthlyReport(currentUser.id, month, year);
  }
}
