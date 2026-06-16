// Ensure BigInt fields (alertSeq) serialize correctly in JSON responses.
// NestJS uses JSON.stringify which cannot handle BigInt without this shim.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ResidentsModule } from './residents/residents.module';
import { GuardiansModule } from './guardians/guardians.module';
import { CamerasModule } from './cameras/cameras.module';
import { AlertsModule } from './alerts/alerts.module';
import { IngestModule } from './ingest/ingest.module';
import { StatusModule } from './status/status.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV ?? 'development'}`,
    }),
    AuthModule,
    PrismaModule,
    ResidentsModule,
    GuardiansModule,
    CamerasModule,
    AlertsModule,
    IngestModule,
    StatusModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
