import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { NotificationHost } from './lib/notifications';
import { StockDetailsModal } from './components/modals/StockDetailsModal';
import { UpgradeModal } from './components/modals/UpgradeModal';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const StockDetailsPage = lazy(() => import('./pages/StockDetailsPage'));
const CompanyNetworkPage = lazy(() => import('./pages/CompanyNetworkPage'));
const Dashboard = lazy(() => import('./components/Dashboard'));

function Fallback() {
    return (
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, border: '3px solid rgba(0, 217, 36, 0.2)', borderTopColor: '#00D924', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
                <div style={{ fontSize: '0.9rem' }}>Loading…</div>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Suspense fallback={<Fallback />}>
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/pricing" element={<PricingPage />} />
                        <Route path="/stock/:symbol" element={<StockDetailsPage />} />
                        <Route path="/stock/:symbol/network" element={<CompanyNetworkPage />} />
                        <Route path="/app" element={<Navigate to="/app/overview" replace />} />
                        <Route path="/app/:view" element={<Dashboard />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Suspense>
                <StockDetailsModal />
                <UpgradeModal />
                <NotificationHost />
            </AuthProvider>
        </BrowserRouter>
    );
}
