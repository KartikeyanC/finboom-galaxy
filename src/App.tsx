import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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
                      <Route path="/" element={<Index />} />
                      <Route path="/income" element={<Income />} />
                      <Route path="/expenses" element={<Expenses />} />
                      <Route path="/investments" element={<Investments />} />
                      <Route path="/budget" element={<Budget />} />
                      <Route path="/goals" element={<Goals />} />
                      <Route path="/calculator" element={<CalculatorPage />} />
                      <Route path="/calculators" element={<Navigate to="/app/calculator" replace />} />
                      <Route path="/reminders" element={<RemindersPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/notifications" element={<NotificationsPage />} />
                      <Route path="/import" element={<ImportPage />} />
                      <Route path="/accounts" element={<AccountsPage />} />
                      <Route path="/billing" element={<BillingPage />} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<Navigate to="/app" replace />} />
                    </Routes>
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
