import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ZonesController } from './controllers/zones.controller.js';
import { ZonesService } from './services/zones.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ZonesController],
  providers: [ZonesService],
})
export class ZonesModule {}
