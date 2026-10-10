/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL?: string;
  readonly VITE_SITE_URL?: string;
}

interface Window {
  __sonificationAccountShared?: boolean;
}
