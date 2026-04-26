import { Controller, Get, Logger } from '@nestjs/common';

@Controller()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  @Get('health')
  health() {
    return { status: 'ok', service: 'notification-service' };
  }
}
