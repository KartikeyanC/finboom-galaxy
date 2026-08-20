import { migrateStorageKeys } from "@/lib/appLock";
migrateStorageKeys(); // rename finroots.* → finroot.* once, before anything renders

import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AccessProvider } from "@/contexts/AccessContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { MenuGuard } from "@/components/MenuGuard";
import { ThemeProvider } from "@/contexts/ThemeContext";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { supabase } from "@/integrations/supabase/client";
import { isSessionExpiredError, notifyError } from "@/lib/errorMessages";

/**
 * Stage 4.1 / BUG-046 — every route is code-split.
 *
 * All 34 pages were statically imported here, so the main chunk carried
 * the entire application: the PO console, the importer's xlsx parser, Bill Scan's
 * pdfjs and every chart, downloaded before the landing page could paint.
 *
 * `lazy()` moves each page into its own chunk, fetched when its route is first
 * visited. Nothing else about routing changes — the <Suspense> boundary below
 * covers them all.
 */
const Index = lazy(() => import("./pages/Index.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy.tsx"));
const TermsOfService = lazy(() => import("./pages/legal/TermsOfService.tsx"));
const Support = lazy(() => import("./pages/public/Support.tsx"));
const StatusPage = lazy(() => import("./pages/public/Status.tsx"));
const Income = lazy(() => import("./pages/Income.tsx"));
const Expenses = lazy(() => import("./pages/Expenses.tsx"));
const Investments = lazy(() => import("./pages/Investments.tsx"));
const Budget = lazy(() => import("./pages/Budget.tsx"));
const Goals = lazy(() => import("./pages/Goals.tsx"));
const CalculatorPage = lazy(() => import("./pages/Calculator.tsx"));
const RemindersPage = lazy(() => import("./pages/Reminders.tsx"));
const SettingsPage = lazy(() => import("./pages/Settings.tsx"));
const ProfilePage = lazy(() => import("./pages/Profile.tsx"));
const NotificationsPage = lazy(() => import("./pages/Notifications.tsx"));
const ImportPage = lazy(() => import("./pages/Import.tsx"));
const AccountsPage = lazy(() => import("./pages/Accounts.tsx"));
const BillingPage = lazy(() => import("./pages/Billing.tsx"));
const BillScanPage = lazy(() => import("./pages/BillScan.tsx"));
const InsurancePage = lazy(() => import("./pages/Insurance.tsx"));
const NetWorthPage = lazy(() => import("./pages/NetWorth.tsx"));
const TripsPage = lazy(() => import("./pages/Trips.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite.tsx"));
const Landing = lazy(() => import("./pages/Landing.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const WorkspaceManage = lazy(() => import("./pages/WorkspaceManage.tsx"));
const ExportPage = lazy(() => import("./pages/Export.tsx"));
const PoLogin = lazy(() => import("./pages/po/PoLogin.tsx"));
const PoDashboard = lazy(() => import("./pages/po/PoDashboard.tsx"));
const PoTenants = lazy(() => import("./pages/po/PoTenants.tsx"));
const PoAnalytics = lazy(() => import("./pages/po/PoAnalytics.tsx"));
const PoPlans = lazy(() => import("./pages/po/PoPlans.tsx"));
const PoPricing = lazy(() => import("./pages/po/PoPricing.tsx"));
const PoBranding = lazy(() => import("./pages/po/PoBranding.tsx"));
const PoCoupons = lazy(() => import("./pages/po/PoCoupons.tsx"));
const PoAudit = lazy(() => import("./pages/po/PoAudit.tsx"));
const PoStatus = lazy(() => import("./pages/po/PoStatus.tsx"));
const PoSecurity = lazy(() => import("./pages/po/PoSecurity.tsx"));

import { PoShell } from "./components/po/PoShell";
import { BrandDocumentTitle } from "./components/brand/BrandDocumentTitle";

/**
 * Shown while a route's chunk is in flight. Deliberately a plain centred
 * spinner with no branding or layout: it appears for a few hundred
 * milliseconds, and anything heavier would itself have to be in the main
 * chunk — which is the thing this whole change is shrinking.
 */
const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div
      role="status"
      aria-label="Loading"
      className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin"
    />
  </div>
);

// BUG-100 — a revoked/expired session used to fail every query into
// whichever empty state the page shows a genuinely-new account, with no
// toast and no redirect. This is the one place that can see it regardless
// of which hook made the call, since it sits above all of them.
let handlingExpiredSession = false;
function handleExpiredSession(error: unknown) {
  if (!isSessionExpiredError(error) || handlingExpiredSession) return;
  if (window.location.pathname.startsWith("/auth")) return;
  handlingExpiredSession = true;
  notifyError(error, { fallback: "Your session has expired. Please sign in again." });
  // A full reload, not a soft navigate: this runs outside the Router, and a
  // dead session should clear every in-memory context (auth, tenant, query
  // cache), not just change the URL over top of stale state.
  supabase.auth.signOut().finally(() => {
    window.location.href = "/auth";
  });
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleExpiredSession }),
  mutationCache: new MutationCache({ onError: handleExpiredSession }),
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 min — avoid refetching on every navigation
      gcTime: 5 * 60_000, // keep unused data cached for 5 min
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrandDocumentTitle />
        <PwaInstallPrompt />
        <ErrorBoundary>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <TenantProvider>
              <AccessProvider>
                {/* One boundary for every lazy route. Inside the providers so a
                    chunk still loading never unmounts auth or tenant state, and
                    inside ErrorBoundary so a failed chunk fetch (a stale tab
                    after a deploy) surfaces as an error rather than a blank
                    page that hangs on the fallback forever. */}
                <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/auth" element={<Auth />} />
                  {/* Stage 5.1 — public and unauthenticated by design: someone
                      deciding whether to sign up must be able to read both. */}
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  {/* Stage 5.7 — public on purpose: somebody who cannot sign in is
                      exactly the person who needs the support address and the
                      status page. */}
                  <Route path="/support" element={<Support />} />
                  <Route path="/status" element={<StatusPage />} />
                  {/* Stage 3.8. Outside ProtectedRoute on purpose: the page
                      handles the signed-out case itself by stashing the token
                      and sending the visitor to sign in. */}
                  <Route path="/invite/:token" element={<AcceptInvite />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/po/login" element={<PoLogin />} />
                  <Route
                    path="/po/*"
                    element={
                      <PoShell>
                        <Routes>
                          <Route path="/" element={<PoDashboard />} />
                          <Route path="/tenants" element={<PoTenants />} />
                          <Route path="/analytics" element={<PoAnalytics />} />
                          <Route path="/plans" element={<PoPlans />} />
                          <Route path="/pricing" element={<PoPricing />} />
                          <Route path="/branding" element={<PoBranding />} />
                          <Route path="/coupons" element={<PoCoupons />} />
                          <Route path="/status" element={<PoStatus />} />
                          <Route path="/audit" element={<PoAudit />} />
                          <Route path="/security" element={<PoSecurity />} />
                          <Route path="*" element={<Navigate to="/po" replace />} />
                        </Routes>
                      </PoShell>
                    }
                  />
                  <Route
                    path="/app/*"
                    element={
                      <ProtectedRoute>
                        <DashboardLayout>
                          <Routes>
                            <Route path="/" element={<MenuGuard menuId="dashboard"><Index /></MenuGuard>} />
                            <Route path="/income" element={<MenuGuard menuId="income"><Income /></MenuGuard>} />
                            <Route path="/expenses" element={<MenuGuard menuId="expenses"><Expenses /></MenuGuard>} />
                            <Route path="/investments" element={<MenuGuard menuId="investments"><Investments /></MenuGuard>} />
                            <Route path="/budget" element={<MenuGuard menuId="budget"><Budget /></MenuGuard>} />
                            <Route path="/goals" element={<MenuGuard menuId="goals"><Goals /></MenuGuard>} />
                            <Route path="/calculator" element={<MenuGuard menuId="calculator"><CalculatorPage /></MenuGuard>} />
                            <Route path="/calculators" element={<Navigate to="/app/calculator" replace />} />
                            <Route path="/reminders" element={<MenuGuard menuId="reminders"><RemindersPage /></MenuGuard>} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/profile" element={<ProfilePage />} />
                            <Route path="/notifications" element={<NotificationsPage />} />
                            <Route path="/import" element={<MenuGuard menuId="import"><ImportPage /></MenuGuard>} />
                            {/* BUG-022 fixed and deployed 2026-08-17 — the "export"
                                menu id now exists in all_feature_menus(), so this
                                gates on its own id instead of piggybacking on
                                "import". AppSidebar's nav entry matches. */}
                            <Route path="/export" element={<MenuGuard menuId="export"><ExportPage /></MenuGuard>} />
                            <Route path="/workspace" element={<WorkspaceManage />} />
                            <Route path="/accounts" element={<AccountsPage />} />
                            <Route path="/billing" element={<MenuGuard menuId="billing"><BillingPage /></MenuGuard>} />
                            <Route path="/bill-scan" element={<MenuGuard menuId="bill-scan"><BillScanPage /></MenuGuard>} />
                            <Route path="/insurance" element={<MenuGuard menuId="insurance"><InsurancePage /></MenuGuard>} />
                            <Route path="/budget-allocator" element={<Navigate to="/app/budget" replace />} />
                            <Route path="/net-worth" element={<MenuGuard menuId="net-worth"><NetWorthPage /></MenuGuard>} />
                            <Route path="/subscriptions" element={<Navigate to="/app/expenses" replace />} />
                            <Route path="/trips" element={<MenuGuard menuId="trips"><TripsPage /></MenuGuard>} />
                            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                            <Route path="*" element={<Navigate to="/app" replace />} />
                          </Routes>
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
              </AccessProvider>
            </TenantProvider>
          </AuthProvider>
        </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
