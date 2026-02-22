import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  UserRole,
  StartTimeEntryDto,
  UpdateRapportDto,
  StartBreakDto,
  EndBreakDto,
  EndTimeEntryDto,
  UpdateTimeEntryDto,
  TimeEntryQueryDto,
} from '@zeiterfassung/shared';
import { z } from 'zod';

const BulkIdsDto = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

const LockMonthDto = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

@Controller('time-entries')
export class TimeEntriesController {
  constructor(private timeEntriesService: TimeEntriesService) {}

  // ── Abfrage ───────────────────────────────────────

  @Get()
  findAll(
    @Query(new ZodValidationPipe(TimeEntryQueryDto)) query: TimeEntryQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeEntriesService.findAll(query, user);
  }

  @Get('running')
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  findRunning() {
    return this.timeEntriesService.findRunning();
  }

  @Get('submitted')
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  findSubmitted() {
    return this.timeEntriesService.findSubmitted();
  }

  // ── Start / Ende ──────────────────────────────────

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(StartTimeEntryDto))
  start(@Body() body: StartTimeEntryDto, @CurrentUser() user: JwtPayload) {
    return this.timeEntriesService.start(body, user);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  end(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(EndTimeEntryDto)) body: EndTimeEntryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeEntriesService.end(id, body, user);
  }

  // ── Rapport ───────────────────────────────────────

  @Post(':id/rapport')
  @HttpCode(HttpStatus.OK)
  updateRapport(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRapportDto)) body: UpdateRapportDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeEntriesService.updateRapport(id, body, user);
  }

  // ── Pausen ────────────────────────────────────────

  @Post(':id/break/start')
  @HttpCode(HttpStatus.CREATED)
  startBreak(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(StartBreakDto)) body: StartBreakDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeEntriesService.startBreak(id, body, user);
  }

  @Post(':id/break/end')
  @HttpCode(HttpStatus.OK)
  endBreak(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(EndBreakDto)) body: EndBreakDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeEntriesService.endBreak(id, body, user);
  }

  // ── Status-Workflow ───────────────────────────────

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.timeEntriesService.submit(id, user);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.timeEntriesService.approve(id, user);
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  reopen(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.timeEntriesService.reopen(id, user);
  }

  // ── Manuelles Bearbeiten ──────────────────────────

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTimeEntryDto)) body: UpdateTimeEntryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeEntriesService.update(id, body, user);
  }

  // ── Bulk Actions ──────────────────────────────────

  @Post('bulk/submit')
  @HttpCode(HttpStatus.OK)
  bulkSubmit(
    @Body(new ZodValidationPipe(BulkIdsDto)) body: { ids: string[] },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeEntriesService.bulkSubmit(body.ids, user);
  }

  @Post('bulk/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  bulkApprove(
    @Body(new ZodValidationPipe(BulkIdsDto)) body: { ids: string[] },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeEntriesService.bulkApprove(body.ids, user);
  }

  @Post('bulk/reopen')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.DISPO)
  bulkReopen(
    @Body(new ZodValidationPipe(BulkIdsDto)) body: { ids: string[] },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeEntriesService.bulkReopen(body.ids, user);
  }

  @Post('bulk/lock-month')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  lockMonth(
    @Body(new ZodValidationPipe(LockMonthDto)) body: { year: number; month: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.timeEntriesService.lockMonth(body.year, body.month, user);
  }
}
