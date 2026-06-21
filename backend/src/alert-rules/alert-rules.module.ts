import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AlertRulesController } from './controllers/alert-rules.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [AlertRulesController],
})
export class AlertRulesModule {}
