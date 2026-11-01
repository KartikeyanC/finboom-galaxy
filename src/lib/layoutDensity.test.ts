import { beforeEach, describe, expect, it } from "vitest";
import { getLayoutDensity, parseDensity, setLayoutDensity } from "./layoutDensity";
import { visibleCategories } from "./categories";

describe("layout density", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.density;
  });

  it("defaults to comfortable and ignores junk", () => {
    expect(parseDensity(null)).toBe("comfortable");
    expect(parseDensity("tiny")).toBe("comfortable");
    expect(getLayoutDensity()).toBe("comfortable");
  });

  it("remembers compact and marks <html> so the CSS applies", () => {
    setLayoutDensity("compact");
    expect(getLayoutDensity()).toBe("compact");
    expect(document.documentElement.dataset.density).toBe("compact");
    setLayoutDensity("comfortable");
    expect(document.documentElement.dataset.density).toBe("comfortable");
  });
});

describe("visibleCategories", () => {
  it("drops hidden names but keeps the current pick", () => {
    const all = ["Salary", "Rental", "Interest"];
    expect(visibleCategories(all, [])).toEqual(all);
    expect(visibleCategories(all, ["Rental"])).toEqual(["Salary", "Interest"]);
    expect(visibleCategories(all, ["Rental"], "Rental")).toEqual(all);
  });
});
