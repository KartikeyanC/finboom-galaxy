import DashboardClassic from "@/components/dashboard/DashboardClassic";
import DashboardWealth from "@/components/dashboard/DashboardWealth";
import OnboardingChecklist from "@/components/onboarding/OnboardingChecklist";
import { PersonalizedWelcome } from "@/components/onboarding-wizard/PersonalizedWelcome";
import { useDashboardLayout } from "@/lib/dashboardLayout";

/**
 * Dashboard route — switches between the new "Wealth" layout (default) and the
 * classic layout based on the user's preference (Settings → Dashboard layout).
 * Both layouts ship; the classic one is preserved, never removed.
 *
 * The Stage 5.3 checklist sits here rather than inside either layout: it is a
 * property of the workspace, not of the layout, and putting it in one dashboard
 * would leave users of the other without any onboarding at all. Same reasoning
 * for `PersonalizedWelcome` (Stage 6.1) — a property of the ACCOUNT, not the
 * layout.
 */
const Index = () => {
  const layout = useDashboardLayout();
  return (
    <div className="space-y-6">
      <PersonalizedWelcome />
      <OnboardingChecklist />
      {layout === "classic" ? <DashboardClassic /> : <DashboardWealth />}
    </div>
  );
};

export default Index;
