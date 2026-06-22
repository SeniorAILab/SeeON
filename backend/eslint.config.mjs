// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ─── 백엔드 계층/DTO 경계 강제 (ADR-046 강제 레이어) ──────────────────────────
// 이 설정은 ADR-046(컨트롤러=transport, 서비스=orchestration, 레포지토리=persistence,
// DTO=HTTP shape)의 계층 규약을 "기계적으로" 강제한다. 핵심 원칙(ADR-008/016):
//   - 신규 의존성 0: 내장 no-restricted-imports / no-restricted-syntax 만 사용.
//   - warn-first: 새로 추가하는 아키텍처/DTO/typed 규칙은 전부 'warn'으로 시작한다.
//     (예외 없이 전 파일에 적용 — per-file ignores 없음. 기존 위반도 숨기지 않고 노출.)
//   - 기존 안정성 deny-list(error)는 절대 강등하지 않는다.
//   - tenant 격리는 여기서 lint로 검사하지 않는다. Postgres RLS(ENABLE+FORCE,
//     NOBYPASSRLS) + PrismaService 런타임 가드(withFacilityContext/$allOperations)가
//     구조적 SoT다. 스키마↔마이그레이션 결합 같은 ESLint 불가 검사만
//     scripts/backend-guard/ 로 분리한다.
export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Stability deny-list (docs/rules/code-stability.md, ADR-014): errors must
    // surface, never be swallowed or coerced into defaults.
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    // ─── warn-first 신규 typed 규칙 ──────────────────────────────────────────
    // 현재 OFF인 규칙만 'warn'으로 추가한다. no-explicit-any / no-misused-promises /
    // require-await 는 recommendedTypeChecked에서 이미 'error'이므로 절대 건드리지
    // 않는다(강등 금지). 가시성은 에디터 + CI lint:check로 확보한다.
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unnecessary-condition': 'warn',
    },
  },
  {
    // ─── 컨트롤러 경계 ───────────────────────────────────────────────────────
    // 컨트롤러는 transport 어댑터다: DTO를 파싱해 Service를 호출하고 presenter를
    // 반환한다. Repository/Prisma/구체 어댑터를 직접 import하면 안 된다.
    // NodeNext '.js' 확장자 import를 잡기 위해 basename + globstar 패턴을 함께 쓴다.
    files: ['src/**/*.controller.ts', 'src/**/controllers/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['*.repository.js', '**/*.repository.js', '**/repositories/**'],
              message:
                '컨트롤러는 Repository를 직접 import하지 않습니다. Service를 통해 접근하세요.',
            },
            {
              group: ['*.prisma.service.js', '**/prisma.service.js', '@prisma/client'],
              message:
                '컨트롤러는 Prisma(서비스/모델 타입)에 직접 의존하지 않습니다. Service를 통해 접근하세요.',
            },
            {
              group: ['**/adapters/**'],
              message: '컨트롤러는 구체 어댑터를 import하지 않습니다.',
            },
          ],
        },
      ],
    },
  },
  {
    // ─── 레포지토리 경계 ─────────────────────────────────────────────────────
    // 레포지토리는 persistence(쿼리/Prisma 매핑)만 담당한다. HTTP 예외를 던지거나
    // Service/Controller/외부 어댑터를 import하면 안 된다. 단 PrismaService 의존은
    // 정상이므로 '!**/prisma.service.js' 로 제외한다(전 레포지토리 오탐 방지).
    files: ['src/**/*.repository.ts', 'src/**/repositories/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@nestjs/common',
              importNames: [
                'HttpException',
                'BadRequestException',
                'UnauthorizedException',
                'ForbiddenException',
                'NotFoundException',
                'ConflictException',
                'GoneException',
                'PayloadTooLargeException',
                'UnsupportedMediaTypeException',
                'UnprocessableEntityException',
                'InternalServerErrorException',
              ],
              message:
                '레포지토리는 HTTP 예외를 던지지 않습니다. null/도메인 결과를 반환하고 Service에서 매핑하세요.',
            },
          ],
          patterns: [
            {
              group: [
                '*.service.js',
                '**/*.service.js',
                '**/services/**',
                '!*.prisma.service.js',
                '!**/prisma.service.js',
                '!**/prisma/**',
              ],
              message: '레포지토리는 Service를 import하지 않습니다(PrismaService는 예외).',
            },
            {
              group: ['*.controller.js', '**/*.controller.js', '**/controllers/**'],
              message: '레포지토리는 Controller를 import하지 않습니다.',
            },
            {
              group: ['**/adapters/**'],
              message: '레포지토리는 외부 어댑터를 import하지 않습니다.',
            },
          ],
        },
      ],
    },
  },
  {
    // ─── 서비스 경계 ─────────────────────────────────────────────────────────
    // 서비스는 use-case orchestration/정책을 담당하며 Port/토큰에 의존한다.
    // 구체 어댑터(예: alerts/adapters/*)를 직접 import하면 안 된다 —
    // 어댑터 바인딩은 Module에서 { provide: PORT, useClass: Adapter } 로 한다.
    files: ['src/**/*.service.ts', 'src/**/services/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['**/adapters/**'],
              message:
                '서비스는 구체 어댑터가 아닌 Port/토큰에 의존합니다. 어댑터는 Module에서 바인딩하세요.',
            },
          ],
        },
      ],
    },
  },
  {
    // ─── DTO 배치 경계 ───────────────────────────────────────────────────────
    // 요청/응답 DTO는 도메인 dto/*.dto.ts 에만 둔다. controller/service 안에서
    // export하는 *Dto interface/type 선언은 경고한다. dto/ 폴더는 제외.
    files: [
      'src/**/*.controller.ts',
      'src/**/controllers/**/*.ts',
      'src/**/*.service.ts',
      'src/**/services/**/*.ts',
    ],
    ignores: ['src/**/dto/**/*.dto.ts'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'ExportNamedDeclaration > TSInterfaceDeclaration[id.name=/Dto$/]',
          message:
            'DTO interface는 도메인 dto/*.dto.ts 에 정의하세요 (controller/service 인라인 선언 금지).',
        },
        {
          selector: 'ExportNamedDeclaration > TSTypeAliasDeclaration[id.name=/Dto$/]',
          message:
            'DTO type은 도메인 dto/*.dto.ts 에 정의하세요 (controller/service 인라인 선언 금지).',
        },
      ],
    },
  },
);
