import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { StatusModule } from '../status/status.module.js';
import { SseController } from './sse.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, AlertsModule, StatusModule],
  controllers: [SseController],
})
export class DashboardModule {}
