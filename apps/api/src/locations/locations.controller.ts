import {
  Controller, Post, Get, Param, Body, Query, UsePipes,
} from '@nestjs/common';
import { LocationsService } from './locations.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole, LogLocationDto } from '@zeiterfassung/shared';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  /** Mitarbeiter sendet Position (alle auth. User) */
  @Post()
  @UsePipes(new ZodValidationPipe(LogLocationDto))
  log(@Body() body: LogLocationDto, @CurrentUser() user: JwtPayload) {
    return this.locationsService.log(body, user);
  }

  /** Admin/Dispo: alle Logs mit Filtern */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  findAll(
    @Query('userId') userId?: string,
    @Query('timeEntryId') timeEntryId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.locationsService.findAll(
      { userId, timeEntryId, from, to, limit: limit ? parseInt(limit) : 200 },
      user!,
    );
  }

  /** Letzter Standort aller aktiven Mitarbeiter (Live-Map) */
  @Get('latest')
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  getLatest(@CurrentUser() user: JwtPayload) {
    return this.locationsService.getLatestPerUser(user);
  }

  /** Route für einen Zeiteintrag */
  @Get('route/:timeEntryId')
  getRoute(
    @Param('timeEntryId') timeEntryId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.locationsService.getRoute(timeEntryId, user);
  }
}
