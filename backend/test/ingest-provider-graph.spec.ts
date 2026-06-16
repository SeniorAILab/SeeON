import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { IngestModule } from '../src/ingest/ingest.module';
import { IngestController } from '../src/ingest/ingest.controller';
import { HmacIngestGuard } from '../src/ingest/hmac.guard';

/**
 * Provider-graph closure gate (Standing Build-Closure Rule). A successful
 * compile() proves IngestModule resolves AlertWriterService (exported by
 * AlertsModule), CamerasService, StatusService, PrismaService and the
 * HmacIngestGuard with no dangling tokens — no DB connection opened.
 */
describe('provider graph — ingest module', () => {
  it('resolves IngestController + HmacIngestGuard with cross-module deps closed', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), IngestModule],
    }).compile();

    expect(moduleRef.get(IngestController, { strict: false })).toBeInstanceOf(
      IngestController,
    );
    expect(moduleRef.get(HmacIngestGuard, { strict: false })).toBeInstanceOf(
      HmacIngestGuard,
    );

    await moduleRef.close();
  });
});
