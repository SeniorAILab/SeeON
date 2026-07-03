import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { ResidentsModule } from '../src/residents/residents.module';
import { ResidentsController } from '../src/residents/residents.controller';
import { ResidentsService } from '../src/residents/residents.service';
import { GuardiansModule } from '../src/guardians/guardians.module';
import { GuardiansController } from '../src/guardians/guardians.controller';
import { GuardiansService } from '../src/guardians/guardians.service';

/**
 * Provider-graph closure gate (Standing Build-Closure Rule).
 *
 * Compiling the new modules WITHOUT init() opens no DB connection; a
 * successful compile() proves the Nest dependency graph resolves every
 * provider — including the AuthModule-exported guards/interceptor that
 * ResidentsController/GuardiansController depend on via UseGuards — with no
 * dangling or unresolved injection tokens. ConfigModule.forRoot provides the
 * global ConfigService that AuthModule's KakaoClient/JwtStrategy/JwtAuthGuard inject.
 */
describe('provider graph — residents + guardians', () => {
  it('resolves controllers + services with Auth/Prisma deps closed', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ResidentsModule,
        GuardiansModule,
      ],
    }).compile();

    expect(moduleRef.get(ResidentsService, { strict: false })).toBeInstanceOf(
      ResidentsService,
    );
    expect(
      moduleRef.get(ResidentsController, { strict: false }),
    ).toBeInstanceOf(ResidentsController);
    expect(moduleRef.get(GuardiansService, { strict: false })).toBeInstanceOf(
      GuardiansService,
    );
    expect(
      moduleRef.get(GuardiansController, { strict: false }),
    ).toBeInstanceOf(GuardiansController);

    await moduleRef.close();
  });
});
