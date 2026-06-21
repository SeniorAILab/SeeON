import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 각 테스트 후 DOM 정리 + localStorage 초기화 (mock 세션/identity 격리).
afterEach(() => {
  cleanup();
  localStorage.clear();
});
