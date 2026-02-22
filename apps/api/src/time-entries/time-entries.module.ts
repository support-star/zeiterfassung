import { Module } from '@nestjs/common';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';
import { AuditService } from '../common/audit.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService, AuditService],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
