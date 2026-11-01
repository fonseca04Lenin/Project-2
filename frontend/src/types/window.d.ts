// Minimal window augmentations. Prefer importing from src/lib/* over adding
// anything here. Only entries whose consumers are outside our control
// (third-party scripts, HTML inline JSON-LD, etc.) belong here.

export {};

declare global {
    interface Window {
        // Vercel Analytics / Speed Insights injected scripts (if ever added).
        va?: unknown;
        si?: unknown;
    }

    interface ImportMetaEnv {
        readonly VITE_API_BASE_URL: string;
        readonly VITE_FIREBASE_API_KEY: string;
        readonly VITE_FIREBASE_AUTH_DOMAIN: string;
        readonly VITE_FIREBASE_PROJECT_ID: string;
        readonly VITE_FIREBASE_STORAGE_BUCKET: string;
        readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
        readonly VITE_FIREBASE_APP_ID: string;
        readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
        readonly VITE_STRIPE_PRO_MONTHLY: string;
        readonly VITE_STRIPE_PRO_YEARLY: string;
        readonly VITE_STRIPE_ELITE_MONTHLY: string;
        readonly VITE_STRIPE_ELITE_YEARLY: string;
    }

    interface ImportMeta {
        readonly env: ImportMetaEnv;
    }
}
