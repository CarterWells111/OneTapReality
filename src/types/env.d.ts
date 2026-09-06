declare namespace NodeJS {
  interface ProcessEnv {
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
    ALPHA_ALLOWED_EMAILS?: string;
    GIFT_SHARING_ENABLED?: string;
    GIFT_URL_ORIGIN?: string;
    RELEASE_AUDIENCE?: string;
    APPLE_REVIEW_ACCESS_ENABLED?: string;
    APPLE_REVIEW_EMAIL?: string;
    APPLE_REVIEW_CODE?: string;
    APPLE_REVIEW_FIXTURE_SECRET?: string;
    APPLE_REVIEW_CLAIM_TOKEN?: string;
    PORT?: string;
  }
}
