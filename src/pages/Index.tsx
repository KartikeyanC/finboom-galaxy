import DashboardClassic from "@/components/dashboard/DashboardClassic";
import DashboardWealth from "@/components/dashboard/DashboardWealth";
import OnboardingChecklist from "@/components/onboarding/OnboardingChecklist";
import { useDashboardLayout } from "@/lib/dashboardLayout";

/**
 * Dashboard route — switches between the new "Wealth" layout (default) and the
 * classic layout based on the user's preference (Settings → Dashboard layout).
 * Both layouts ship; the classic one is preserved, never removed.
 *
 * The Stage 5.3 checklist sits here rather than inside either layout: it is a
 * property of the workspace, not of the layout, and putting it in one dashboard
 * would leave users of the other without any onboarding at all.
 */
const Index = () => {
  const layout = useDashboardLayout();
  return (
    <div className="space-y-6">
      <OnboardingChecklist />
      {layout === "classic" ? <DashboardClassic /> : <DashboardWealth />}
    </div>
  );
};

export default Index;
