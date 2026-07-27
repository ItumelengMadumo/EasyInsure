/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_APP_ENV?: string;
    readonly DEV: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

declare module '../amplify_outputs.json' {
  const value: Record<string, unknown>;
  export default value;
}
