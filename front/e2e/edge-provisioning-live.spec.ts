import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { SECRET_SOCKET_ENV } from "./secret-fd-bridge";

const evidenceDirectory = process.env.EDGE_PROVISIONING_EVIDENCE_DIR
  ?? fileURLToPath(new URL("../../../../.omo/evidence/edge-driven-facility-provisioning/task-13/", import.meta.url));

test("super admin issues one-time enrollment and leaves only a redacted screenshot", async ({ context, page }) => {
  const email = requiredEnvironment("EDGE_PROVISIONING_ADMIN_EMAIL");
  const facilityId = requiredEnvironment("EDGE_PROVISIONING_FACILITY_ID");
  const password = await readSecretFromSocket();

  await page.goto("/login");
  await context.grantPermissions(
    ["clipboard-read", "clipboard-write"],
    { origin: new URL(page.url()).origin },
  );
  const clipboardReady = await page.evaluate(async () => {
    await navigator.clipboard.writeText("capability-probe");
    const value = await navigator.clipboard.readText();
    await navigator.clipboard.writeText("");
    return value === "capability-probe";
  });
  expect(clipboardReady).toBe(true);
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  const loginResponse = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST"
      && new URL(response.url()).pathname === "/api/v1/auth/login";
  });
  await page.getByRole("button", { name: "이메일로 로그인" }).click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await page.goto(`/facilities/${encodeURIComponent(facilityId)}/admin/edge-enrollment`);
  await expect(page.getByRole("heading", { name: "엣지 등록 관리" })).toBeVisible();

  await page.getByRole("button", { name: "새 등록 자격 발급" }).click();
  const credentialDialog = page.getByRole("dialog", { name: "일회용 자격 증명" });
  await expect(credentialDialog).toBeVisible();
  await credentialDialog.getByRole("button", { name: "자격 증명 복사" }).click();
  await expect(credentialDialog).toBeHidden();

  const clipboardWasCredentialAndIsCleared = await page.evaluate(async () => {
    const value = await navigator.clipboard.readText();
    const valid = /^eft_v1\.[0-9A-HJKMNP-TV-Z]{12}\.[A-Za-z0-9_-]{43}$/.test(value);
    await navigator.clipboard.writeText("");
    return valid;
  });
  expect(clipboardWasCredentialAndIsCleared).toBe(true);

  const secretAbsentFromBrowserState = await page.evaluate(() => {
    const tokenShape = /eft_v1\.[0-9A-HJKMNP-TV-Z]{12}\.[A-Za-z0-9_-]{43}/;
    const persistedValues = Object.values(localStorage).join(" ");
    return !tokenShape.test(document.body.textContent ?? "")
      && !tokenShape.test(window.location.href)
      && !tokenShape.test(persistedValues);
  });
  expect(secretAbsentFromBrowserState).toBe(true);

  const viewports = [
    { name: "375", width: 375, height: 844 },
    { name: "768", width: 768, height: 1024 },
    { name: "1280", width: 1280, height: 900 },
  ] as const;
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    if (viewport.width < 1024) {
      await expect.poll(async () => {
        const sidebarBox = await page.locator("aside").boundingBox();
        return sidebarBox?.x ?? 0;
      }).toBeLessThanOrEqual(-255);
    }
    await expect(page.getByRole("heading", { name: "엣지 등록 관리" })).toBeVisible();
    await page.screenshot({
      path: `${evidenceDirectory}/edge-enrollment-redacted-${viewport.name}.png`,
      fullPage: true,
      mask: [page.locator("[data-evidence-redact]")],
      maskColor: "#F0F0F0",
    });
  }
});

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the isolated live flow.`);
  }
  return value;
}

function readSecretFromSocket(): Promise<string> {
  const socketPath = process.env[SECRET_SOCKET_ENV];
  delete process.env[SECRET_SOCKET_ENV];
  if (!socketPath) throw new Error("Secret bridge socket is unavailable.");

  return new Promise((resolveSecret, rejectSecret) => {
    const socket = createConnection(socketPath);
    let secret = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      secret += chunk;
    });
    socket.once("error", rejectSecret);
    socket.once("end", () => {
      const trimmedSecret = secret.trim();
      secret = "";
      if (trimmedSecret.length === 0) {
        rejectSecret(new Error("Secret bridge returned an empty value."));
      } else {
        resolveSecret(trimmedSecret);
      }
    });
  });
}
