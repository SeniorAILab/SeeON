import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  AlertEventsController,
  LegacyAlertEventsController,
} from './alert-events.controller';
import { AlertsController } from './alerts.controller';
import { AlertChannelService } from './services/alert-channel.service';
import { AlertEventsService } from './services/alert-events.service';
import {
  AlertPolicyClock,
  AlertPolicyService,
  SystemAlertPolicyClock,
} from './services/alert-policy.service';
import { KakaoOAuthService } from './services/kakao-oauth.service';
import { KakaoSenderService } from './services/kakao-sender.service';

@Module({
  imports: [ConfigModule],
  controllers: [
    AlertEventsController,
    LegacyAlertEventsController,
    AlertsController,
  ],
  providers: [
    AlertEventsService,
    AlertChannelService,
    AlertPolicyService,
    { provide: AlertPolicyClock, useClass: SystemAlertPolicyClock },
    KakaoOAuthService,
    KakaoSenderService,
  ],
  exports: [KakaoOAuthService, KakaoSenderService],
})
export class AlertsModule {}
