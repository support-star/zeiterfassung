import { Module } from '@nestjs/common';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';
import { AuditService } from '../common/audit.service';

@Module({
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService, AuditService],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
