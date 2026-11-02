import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { InsurancePolicy } from "@/lib/insuranceStore";

// The list never talks to Supabase itself, but the store module imports the client.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import PolicyList from "./PolicyList";

const policy = (id: string, policyName: string, category: InsurancePolicy["category"]): InsurancePolicy =>
  ({
    id,
    category,
    policyName,
    provider: "Acme",
    policyNumber: `P-${id}`,
    sumInsured: 500000,
    premium: 12000,
    payStructure: "Regular-Pay",
    paymentFrequency: "Annual",
    dueDate: "2027-01-01",
    documentName: "",
    notes: "",
    createdAt: "2026-01-01T00:00:00Z",
  }) as InsurancePolicy;

const items = [policy("1", "Family Health", "health"), policy("2", "Car Cover", "vehicle")];
const props = {
  categoryOrder: ["health", "life", "vehicle", "gadget", "other"] as InsurancePolicy["category"][],
  uploadingId: null,
  onPreview: () => {},
  onUpload: () => {},
  onEdit: () => {},
  onDelete: () => {},
};

describe("PolicyList bulk delete", () => {
  it("ticks policies across categories and deletes them after one confirm", async () => {
    const onDeleteMany = vi.fn(async () => {});
    render(<PolicyList items={items} onDeleteMany={onDeleteMany} {...props} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(await screen.findByText("Delete 2 policies?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onDeleteMany).toHaveBeenCalledWith(["1", "2"]));
  });

  it("keeps the single delete on each card", () => {
    const onDelete = vi.fn();
    render(<PolicyList items={items} onDeleteMany={vi.fn()} {...props} onDelete={onDelete} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete policy" })[1]);
    expect(onDelete).toHaveBeenCalledWith("2");
  });
});
