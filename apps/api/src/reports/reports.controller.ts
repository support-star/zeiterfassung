import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { UserRole } from '@zeiterfassung/shared';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('team')
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  getTeamReport(
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.reportsService.getTeamMonthlyReport(month, year);
  }

  @Get('pending')
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  getPending() {
    return this.reportsService.getPendingEntries();
  }

  @Get('me/monthly')
  getMyMonthly(
    @CurrentUser() user: JwtPayload,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.reportsService.getUserMonthlyReport(user.sub, month, year);
  }

  @Get('user/:userId/monthly')
  @Roles(UserRole.ADMIN, UserRole.DISPO, UserRole.WORKER)
  getUserMonthly(
    @Param('userId') userId: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    const targetId = currentUser.role === UserRole.WORKER ? currentUser.sub : userId;
    return this.reportsService.getUserMonthlyReport(targetId, month, year);
  }

  @Get('user/:userId/yearly')
  @Roles(UserRole.ADMIN, UserRole.DISPO, UserRole.WORKER)
  getUserYearly(
    @Param('userId') userId: string,
    @Query('year', ParseIntPipe) year: number,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    const targetId = currentUser.role === UserRole.WORKER ? currentUser.sub : userId;
    return this.reportsService.getUserYearlyReport(targetId, year);
  }
}
