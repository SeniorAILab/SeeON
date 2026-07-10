import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Vite react-ts default flat config. Type-checked linting is deliberately off
// (uses the cheap non-type-aware preset) — `tsc -b` already owns type errors.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', '*.tsbuildinfo'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // `_`-prefixed = intentionally unused (placeholder destructure, stubbed arg).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // P7 seam ratchet: UI layers (components/pages/hooks) must consume services/*
  // wrappers, not endpoint mappers directly. Tests may mock endpoints freely.
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/pages/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/services/api/*', '**/services/api/*'],
              message:
                'UI(components/pages/hooks)는 services/api/*를 직접 import하지 말고 services/* 래퍼를 사용하세요 (P7 seam ratchet).',
            },
          ],
        },
      ],
    },
  },
  // Legacy allowlist: pre-existing seam offenders (Follow-up Issue1 shrinks this).
  {
    files: [
      'src/components/layout/AppLayout.tsx',
      'src/components/layout/StaffLayout.tsx',
      'src/pages/SuperAdminDashboardPage.tsx',
      'src/pages/admin/AdminFacilityPage.tsx',
      'src/pages/admin/AdminMonitorSettingsPage.tsx',
      'src/pages/admin/AdminSpacesPage.tsx',
      'src/pages/admin/UsersPage.tsx',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
)
