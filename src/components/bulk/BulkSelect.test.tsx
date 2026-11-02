import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BulkDeleteBar, SelectAllBox, SelectBox } from "./BulkSelect";
import { deleteEach, useBulkSelection } from "./useBulkSelection";

function List({
  rows,
  onDelete,
}: {
  rows: { id: string; name: string }[];
  onDelete: (ids: string[]) => Promise<number | void> | number | void;
}) {
  const [filter, setFilter] = useState("");
  const visible = rows.filter((r) => r.name.includes(filter));
  const sel = useBulkSelection(visible.map((r) => r.id));
  return (
    <div>
      <button onClick={() => setFilter("a")}>only a</button>
      <SelectAllBox sel={sel} />
      <BulkDeleteBar sel={sel} noun={["goal", "goals"]} onDelete={onDelete} />
      {visible.map((r) => (
        <SelectBox key={r.id} sel={sel} id={r.id} name={r.name} />
      ))}
    </div>
  );
}

const rows = [
  { id: "1", name: "a car" },
  { id: "2", name: "house" },
  { id: "3", name: "a trip" },
];

describe("bulk delete kit", () => {
  it("shows no bar until something is ticked", () => {
    render(<List rows={rows} onDelete={() => {}} />);
    expect(screen.queryByText(/selected/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select house" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("select all, one confirm, then deletes exactly the ticked ids", async () => {
    const onDelete = vi.fn();
    render(<List rows={rows} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    expect(await screen.findByText("Delete 3 goals?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(["1", "2", "3"]));
    await waitFor(() => expect(screen.queryByText(/selected/)).toBeNull());
  });

  it("never deletes a row the filter hides", async () => {
    const onDelete = vi.fn();
    render(<List rows={rows} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select house" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select a car" }));
    fireEvent.click(screen.getByText("only a")); // hides "house"
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Delete selected/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(["1"]));
  });

  it("deleteEach counts failures instead of stopping", async () => {
    const del = vi.fn(async (id: string) => {
      if (id === "2") throw new Error("nope");
    });
    expect(await deleteEach(["1", "2", "3"], del)).toBe(1);
    expect(del).toHaveBeenCalledTimes(3);
  });
});
