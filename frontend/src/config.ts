// Centralized runtime config. Pulled from Vite env; falls back to the
// production Railway URL and the hardcoded Firebase/Stripe values from the
// legacy project so a bare clone still boots.

const env = import.meta.env;

export const API_BASE_URL: string =
    env.VITE_API_BASE_URL || 'https://web-production-2e2e.up.railway.app';

export const FIREBASE_CONFIG = {
    apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyCB_8dEiQH0AxqUq7qXneOWOdXeJw-GFOQ',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'stock-watcher-bbb20.firebaseapp.com',
    projectId: env.VITE_FIREBASE_PROJECT_ID || 'stock-watcher-bbb20',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'stock-watcher-bbb20.firebasestorage.app',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '745996753351',
    appId: env.VITE_FIREBASE_APP_ID || '1:745996753351:web:c4506624bb8dc058ffe1e2',
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-MSV396NJ1V',
};

export const STRIPE_PRICES = {
    PRO_MONTHLY: env.VITE_STRIPE_PRO_MONTHLY || 'price_1T9FCtDDgxuIufn0XuEgkYV5',
    PRO_YEARLY: env.VITE_STRIPE_PRO_YEARLY || 'price_1T9FHjDDgxuIufn0fgS9CrpC',
    ELITE_MONTHLY: env.VITE_STRIPE_ELITE_MONTHLY || 'price_1T9FEQDDgxuIufn0mt4Ytley',
    ELITE_YEARLY: env.VITE_STRIPE_ELITE_YEARLY || 'price_1T9FI9DDgxuIufn0aF0cDIVy',
};

export const APP_NAME = 'AI Stock Sage';
export const APP_VERSION = '2.0.0';
