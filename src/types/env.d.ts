declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_ORIGIN?: string;
    DATABASE_URL?: string;
    DEVICE_TOKEN_PEPPER?: string;
    PORT?: string;
  }
}
