import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { KakaoSendToMeChannelAdapter } from './adapters/kakao-send-to-me-channel.adapter';
import { MlServingPredictionAdapter } from './adapters/ml-serving-prediction.adapter';
import { AlertEventsController } from './controllers/alert-events.controller';
import { ALERT_CHANNEL_PORT } from './ports/channel.port';
import { ALERT_PREDICTION_PORT } from './ports/prediction.port';
import { AlertEventsRepository } from './repositories/alert-events.repository';
import { AlertEventsService } from './services/alert-events.service';
import {
  AlertPolicyClock,
  AlertPolicyService,
  SystemAlertPolicyClock,
} from './services/alert-policy.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AlertEventsController],
  providers: [
    AlertEventsRepository,
    AlertEventsService,
    AlertPolicyService,
    { provide: AlertPolicyClock, useClass: SystemAlertPolicyClock },
    { provide: ALERT_CHANNEL_PORT, useClass: KakaoSendToMeChannelAdapter },
    { provide: ALERT_PREDICTION_PORT, useClass: MlServingPredictionAdapter },
  ],
})
export class AlertsModule {}
