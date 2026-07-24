declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_ORIGIN?: string;
    DATABASE_URL?: string;
    DEVICE_TOKEN_PEPPER?: string;
    GIFT_TOKEN_PEPPER?: string;
    GIFT_AUTH_PEPPER?: string;
    RESEND_API_KEY?: string;
    GIFT_EMAIL_FROM?: string;
    R2_ACCOUNT_ID?: string;
    R2_BUCKET?: string;
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
    GIFT_ADMIN_EMAILS?: string;
    GIFT_CARD_CLEANUP_SECRET?: string;
    PORT?: string;
  }
}
