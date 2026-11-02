import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  findHeaderRow,
  gridToObjects,
  normaliseDate,
  normHeader,
  pdfLines,
  pdfLinesToGrid,
  type PdfText,
} from "./sheetRows";
import { toRow } from "./importParsers";

const KNOWN = new Set(["symbol", "trade date", "trade type", "quantity", "price"]);

// The shape of a Zerodha Console tradebook: account details first, an empty
// column A, and the real header on row 15.
const zerodhaGrid = () => [
  [],
  ["", "Client ID", "AB1234"],
  [],
  ["", "Tradebook for Equity from 2024-04-01 to 2025-03-31"],
  [], [], [], [], [], [], [], [], [], [],
  ["", "Symbol", "ISIN", "Trade Date", "Exchange", "Segment", "Series", "Trade Type",
    "Auction", "Quantity", "Price", "Trade ID", "Order ID", "Order Execution Time"],
  ["", "ITC", "INE154A01025", 45397, "NSE", "EQ", "EQ", "buy", false, 10, 410.5, "1", "2",
    "2024-04-15T10:01:02"],
  ["", "ITC", "INE154A01025", "2024-05-02", "NSE", "EQ", "EQ", "sell", false, 4, 438, "3", "4",
    "2024-05-02T11:00:00"],
];

describe("header row", () => {
  it("normalises column names", () => {
    expect(normHeader(" Avg. Price ")).toBe("avg price");
    expect(normHeader("trade_date")).toBe("trade date");
  });

  it("is found below a block of account details", () => {
    expect(findHeaderRow(zerodhaGrid(), KNOWN)).toBe(14);
  });

  it("reads the rows under it, keyed by its names", () => {
    const rows = gridToObjects(zerodhaGrid(), KNOWN);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Symbol: "ITC", "Trade Type": "buy", Quantity: 10 });
  });

  it("skips a header repeated further down (a page break)", () => {
    const g = zerodhaGrid();
    g.splice(16, 0, g[14]);
    expect(gridToObjects(g, KNOWN)).toHaveLength(2);
  });

  it("without known names, uses the first row with two filled cells", () => {
    expect(gridToObjects([["My export"], ["date", "amount"], ["2024-01-01", "5"]])).toEqual([
      { date: "2024-01-01", amount: "5" },
    ]);
  });

  it("finds nothing when no row names two known columns", () => {
    expect(gridToObjects([["Client ID", "AB1234"], ["a", "b"]], KNOWN)).toEqual([]);
  });
});

describe("normaliseDate", () => {
  it.each([
    [45397, "2024-04-15"], // Excel serial
    ["45397", "2024-04-15"],
    ["2024-04-15", "2024-04-15"],
    ["2024-04-15T10:01:02", "2024-04-15"],
    ["15-04-2024", "2024-04-15"],
    ["03/04/2024", "2024-04-03"], // day first: 3 April, not 4 March
    ["15.04.24", "2024-04-15"],
    ["15-Apr-2024", "2024-04-15"],
    ["15 April 2024", "2024-04-15"],
    ["Apr 15, 2024", "2024-04-15"],
  ])("%s → %s", (input, want) => {
    expect(normaliseDate(input)).toBe(want);
  });

  it("is empty for anything that is not a date", () => {
    expect(normaliseDate("")).toBe("");
    expect(normaliseDate("ITC")).toBe("");
    expect(normaliseDate(10)).toBe("");
    expect(normaliseDate("31-02-2024")).toBe("");
  });
});

describe("a Zerodha tradebook .xlsx", () => {
  it("is read with the worker's options into trades, sells kept as sells", () => {
    // Write a real workbook, then read it exactly as xlsxWorker.ts does.
    const ws = XLSX.utils.aoa_to_sheet(zerodhaGrid());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Equity");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const read = XLSX.read(buf, { type: "array" });
    const grid = XLSX.utils.sheet_to_json<unknown[]>(read.Sheets[read.SheetNames[0]], {
      header: 1,
      defval: "",
      raw: true,
      blankrows: false,
    });

    const rows = gridToObjects(grid, KNOWN).map((r) => toRow(r));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: "2024-04-15",
      asset: "ITC",
      action: "Inflow",
      quantity: 10,
      price: 410.5,
    });
    expect(rows[1]).toMatchObject({
      date: "2024-05-02",
      action: "Outflow",
      quantity: 4,
      price: 438,
    });
  });
});

describe("a PDF table", () => {
  // Text pieces as pdf.js reports them: x/y in points, y growing upwards.
  const t = (text: string, x: number, y: number, width = text.length * 5): PdfText => ({
    text,
    x,
    y,
    width,
  });

  it("is rebuilt from where the text sits, numbers placed under their column", () => {
    const items = [
      t("Zerodha Broking Ltd", 40, 800),
      t("Tradebook", 40, 780),
      t("Symbol", 40, 700),
      t("Trade", 120, 700, 25),
      t("Date", 148, 700, 20),
      t("Trade Type", 220, 700),
      t("Quantity", 300, 700),
      t("Price", 380, 700),
      t("ITC", 40, 680),
      t("15-04-2024", 120, 680),
      t("buy", 220, 680),
      t("10", 318, 680), // right-aligned under "Quantity"
      t("410.50", 375, 680),
      t("Page 1 of 1", 250, 40),
    ];
    const grid = pdfLinesToGrid(pdfLines(items), KNOWN);
    const rows = gridToObjects(grid, KNOWN)
      .map((r) => toRow(r))
      .filter(Boolean);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: "2024-04-15",
      asset: "ITC",
      action: "Inflow",
      quantity: 10,
      price: 410.5,
    });
  });
});
