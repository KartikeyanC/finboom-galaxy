import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AccessProvider } from "@/contexts/AccessContext";
import { MenuGuard } from "@/components/MenuGuard";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Income from "./pages/Income.tsx";
import Expenses from "./pages/Expenses.tsx";
import Investments from "./pages/Investments.tsx";
import Budget from "./pages/Budget.tsx";
import Goals from "./pages/Goals.tsx";
import CalculatorPage from "./pages/Calculator.tsx";
import RemindersPage from "./pages/Reminders.tsx";
import SettingsPage from "./pages/Settings.tsx";
import ProfilePage from "./pages/Profile.tsx";
import NotificationsPage from "./pages/Notifications.tsx";
import ImportPage from "./pages/Import.tsx";
import AccountsPage from "./pages/Accounts.tsx";
import BillingPage from "./pages/Billing.tsx";
import BillScanPage from "./pages/BillScan.tsx";
import Auth from "./pages/Auth.tsx";
import Landing from "./pages/Landing.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AccessProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
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
                      <Route path="/accounts" element={<AccountsPage />} />
                      <Route path="/billing" element={<BillingPage />} />
                      <Route path="/bill-scan" element={<MenuGuard menuId="bill-scan"><BillScanPage /></MenuGuard>} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<Navigate to="/app" replace />} />
                    </Routes>
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AccessProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
