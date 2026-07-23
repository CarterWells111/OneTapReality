export type LocalProfile = {
  nickname: string;
  avatarUri: string | null;
  /** 一句个性签名；缺省时展示品牌语。 */
  bio?: string;
};

export const DEFAULT_BIO = "让每一次触碰，都回到故事最初的地方。";

export const DEFAULT_LOCAL_PROFILE: LocalProfile = {
  nickname: "一触如初用户",
  avatarUri: null,
  bio: DEFAULT_BIO,
};

export const maxBioLength = 40;

export function normalizeNickname(value: string): string {
  return value.trim() || DEFAULT_LOCAL_PROFILE.nickname;
}

export function normalizeBio(value: string): string {
  const trimmed = value.trim().slice(0, maxBioLength);
  return trimmed || DEFAULT_BIO;
}
