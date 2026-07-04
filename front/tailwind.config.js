/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--c-bg)",
        surface: "var(--c-surface)",
        surface2: "var(--c-surface-2)",
        border: "var(--c-border)",
        ink: {
          DEFAULT: "var(--c-ink)",
          soft: "var(--c-ink-soft)",
          faint: "var(--c-ink-faint)",
        },
        brand: {
          DEFAULT: "var(--c-brand)",
          soft: "var(--c-brand-soft)",
        },
        teal: "var(--c-teal)",
        status: {
          stable: "var(--c-stable)",
          stableBg: "var(--c-stable-bg)",
          caution: "var(--c-caution)",
          cautionBg: "var(--c-caution-bg)",
          danger: "var(--c-danger)",
          dangerBg: "var(--c-danger-bg)",
          check: "var(--c-check)",
          checkBg: "var(--c-check-bg)",
        },
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Apple SD Gothic Neo",
          "Noto Sans KR",
          "sans-serif",
        ],
      },
      fontSize: {
        // 직원용 대형 타이포 스케일 (현장 가독성 기준)
        "staff-name": ["1.75rem", { lineHeight: "2.1rem", fontWeight: "700" }], // 28px 공간명
        "staff-status": ["1.5rem", { lineHeight: "1.9rem", fontWeight: "700" }], // 24px 상태
        "staff-body": ["1.2rem", { lineHeight: "1.7rem" }], // ~19px 설명
        "staff-btn": ["1.3rem", { lineHeight: "1.4rem", fontWeight: "700" }], // ~21px 버튼
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        cardDark: "0 1px 2px rgba(0,0,0,0.3)",
        panel: "0 -8px 24px rgba(16,24,40,0.12)",
        modal:
          "0 24px 48px -12px rgba(16,24,40,0.28), 0 8px 24px rgba(16,24,40,0.16)",
      },
    },
  },
  plugins: [],
};
