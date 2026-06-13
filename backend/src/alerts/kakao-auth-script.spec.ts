import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('Kakao auth script', () => {
  it('does not print the REST API key or client_id when authorizing', async () => {
    const restApiKey = 'sentinel-rest-api-key-123';

    const result = await execFileAsync(
      process.execPath,
      ['-r', 'ts-node/register', 'scripts/kakao-auth.ts', 'authorize'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          KAKAO_REDIRECT_URI: 'http://localhost:3000/auth/kakao/callback',
          KAKAO_REST_API_KEY: restApiKey,
        },
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(output).not.toContain(restApiKey);
    expect(output).not.toContain('client_id=');
    expect(output).toContain('Kakao authorization URL prepared.');
    expect(output).toContain('authorize --open');
  });
});
