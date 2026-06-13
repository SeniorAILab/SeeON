import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import type {
  KakaoOAuthClientDto,
  KakaoTokenFileDto,
} from '../src/alerts/dto/kakao-oauth.dto';
import { KakaoOAuthService } from '../src/alerts/services/kakao-oauth.service';

const DEFAULT_REDIRECT_URI = 'http://localhost:3000/auth/kakao/callback';
const TOKEN_PATH = resolve(__dirname, '..', 'var', 'kakao-token.json');
const ENV_PATH = resolve(__dirname, '..', '.env.development');

type Command =
  | { readonly kind: 'authorize'; readonly open: boolean }
  | { readonly kind: 'exchange'; readonly code: string };

class CliInputError extends Error {}

class UnhandledCliCommandError extends Error {
  constructor(value: never) {
    super(`Unhandled command: ${String(value)}`);
  }
}

async function main(): Promise<void> {
  const envFile = await readEnvFile(ENV_PATH);
  const config = loadConfig(envFile);
  const command = parseCommand(process.argv.slice(2));
  const kakaoOAuthService = new KakaoOAuthService();

  switch (command.kind) {
    case 'authorize': {
      const state = randomUUID();
      const authorizeUrl = kakaoOAuthService.buildAuthorizeUrl({
        oauth: config,
        state,
      });
      if (command.open) {
        await openInBrowser(authorizeUrl);
        console.log('Kakao authorization URL opened in your browser.');
      } else {
        console.log('Kakao authorization URL prepared.');
        console.log('Run: pnpm --filter backend kakao:auth authorize --open');
      }
      console.log('Client ID: [redacted]');
      console.log(`Redirect URI: ${config.redirectUri}`);
      console.log(
        'After login, copy the code query parameter from the redirected URL.',
      );
      console.log(
        'Then run: pnpm --filter backend kakao:auth exchange --code <code>',
      );
      return;
    }
    case 'exchange': {
      const token = await kakaoOAuthService.exchangeAuthorizationCode({
        oauth: config,
        code: command.code,
      });
      await writeTokenFile(TOKEN_PATH, token);
      console.log(
        JSON.stringify(kakaoOAuthService.redactedTokenSummary(token), null, 2),
      );
      return;
    }
    default: {
      assertNever(command);
    }
  }
}

async function readEnvFile(path: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(path, 'utf8');
    const envFile: Record<string, string> = {};
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) {
        continue;
      }
      const eqIndex = line.indexOf('=');
      if (eqIndex < 1) {
        continue;
      }
      const key = line.slice(0, eqIndex).trim();
      if (key.length === 0) {
        continue;
      }
      const rawValue = line.slice(eqIndex + 1).trim();
      envFile[key] = stripEnvQuotes(rawValue);
    }
    return envFile;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function loadConfig(envFile: Record<string, string>): KakaoOAuthClientDto {
  const restApiKey =
    process.env.KAKAO_REST_API_KEY ?? envFile.KAKAO_REST_API_KEY;
  const redirectUri =
    process.env.KAKAO_REDIRECT_URI ??
    envFile.KAKAO_REDIRECT_URI ??
    DEFAULT_REDIRECT_URI;

  if (restApiKey === undefined || restApiKey.length === 0) {
    throw new CliInputError(
      'Missing KAKAO_REST_API_KEY. Add it to backend/.env.development or export it.',
    );
  }

  return { restApiKey, redirectUri };
}

function parseCommand(args: readonly string[]): Command {
  const [command, ...rest] = args;
  if (command === 'authorize') {
    return { kind: 'authorize', open: rest.includes('--open') };
  }
  if (command === 'exchange') {
    const code = readFlag(rest, '--code');
    if (code.length === 0) {
      throw new CliInputError('Missing --code for exchange command.');
    }
    return { kind: 'exchange', code };
  }
  throw new CliInputError(
    'Usage: kakao-auth.ts authorize [--open] | exchange --code <code>',
  );
}

function readFlag(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index < 0) {
    return '';
  }
  const value = args[index + 1];
  return value ?? '';
}

function stripEnvQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function writeTokenFile(
  path: string,
  token: KakaoTokenFileDto,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(token, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(tmpPath, path);
}

async function openInBrowser(url: string): Promise<void> {
  const command = browserOpenCommand(url);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command.executable, command.args, {
      stdio: 'ignore',
      detached: false,
    });
    child.on('error', () => {
      rejectPromise(
        new CliInputError(
          'Failed to open Kakao authorization URL in the browser.',
        ),
      );
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new CliInputError(
          'Failed to open Kakao authorization URL in the browser.',
        ),
      );
    });
  });
}

function browserOpenCommand(url: string): {
  readonly executable: string;
  readonly args: readonly string[];
} {
  if (process.platform === 'darwin') {
    return { executable: 'open', args: [url] };
  }
  if (process.platform === 'win32') {
    return { executable: 'cmd', args: ['/c', 'start', '', url] };
  }
  return { executable: 'xdg-open', args: [url] };
}

function assertNever(value: never): never {
  throw new UnhandledCliCommandError(value);
}

main().catch((error: unknown) => {
  if (error instanceof CliInputError) {
    console.error(error.message);
    process.exit(2);
  }
  if (error instanceof Error) {
    console.error(error.message);
    process.exit(1);
  }
  console.error('Unknown failure');
  process.exit(1);
});
