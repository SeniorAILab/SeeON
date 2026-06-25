export const SIGNUP_PASSWORD_MIN_LENGTH = 8;
export const SIGNUP_PASSWORD_MAX_LENGTH = 128;

export function getSignupPasswordError(password: string): string | null {
  if (!password) return null;
  const length = Array.from(password).length;
  if (length < SIGNUP_PASSWORD_MIN_LENGTH) {
    return "비밀번호는 8자 이상이어야 합니다.";
  }
  if (length > SIGNUP_PASSWORD_MAX_LENGTH) {
    return "비밀번호는 128자 이하여야 합니다.";
  }
  return null;
}

export function getSignupPasswordConfirmError(
  password: string,
  passwordConfirm: string
): string | null {
  if (!passwordConfirm) return null;
  if (password !== passwordConfirm) {
    return "비밀번호가 일치하지 않습니다.";
  }
  return null;
}
