import { Controller, Get, Patch, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** GET /notifications – eigene Benachrichtigungen */
  @Get()
  getMyNotifications(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.getNotifications(
      user.id,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** GET /notifications/unread-count */
  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: any) {
    const count = await this.notificationsService.getUnreadCount(user.id);
    return { count };
  }

  /** PATCH /notifications/read-all */
  @Patch('read-all')
  markAllRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllRead(user.id);
  }

  /** PATCH /notifications/:id/read */
  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.markRead(id, user.id);
  }
}
