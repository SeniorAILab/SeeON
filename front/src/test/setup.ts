import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 각 테스트 후 DOM 정리 + 브라우저 저장소 초기화 (mock 세션/identity/facility 격리).
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
