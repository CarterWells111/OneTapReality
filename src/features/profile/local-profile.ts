export type LocalProfile = {
  nickname: string;
  avatarUri: string | null;
};

export const DEFAULT_LOCAL_PROFILE: LocalProfile = {
  nickname: "一触如初用户",
  avatarUri: null,
};

export function normalizeNickname(value: string): string {
  return value.trim() || DEFAULT_LOCAL_PROFILE.nickname;
}
