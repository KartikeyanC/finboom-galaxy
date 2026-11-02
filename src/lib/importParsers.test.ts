import { describe, it, expect } from "vitest";
import {
  parseExpenses,
  parseIncomeRows,
  parseGoals,
  parseBudgets,
  SUPPORTED_EXT,
  STRUCTURED_EXT,
  parseCSV,
} from "./importParsers";

const csvFile = (body: string, name = "test.csv") =>
  new File([body], name, { type: "text/csv" });

describe("parseExpenses", () => {
  it("parses rows and maps columns case-insensitively", async () => {
    const file = csvFile(
      "Date,Category,Description,Amount,Currency\n2024-01-15,Food,Lunch,250,INR\n",
    );
    const { rows, skipped } = await parseExpenses(file);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(0);
    expect(rows[0]).toMatchObject({
      date: "2024-01-15",
      category: "Food",
      description: "Lunch",
      amount: 250,
      currency: "INR",
    });
    expect(rows[0].id).toBeTruthy();
  });

  it("strips currency symbols and thousands separators from amount", async () => {
    const file = csvFile("date,category,amount\n2024-01-01,Rent,\"₹12,500\"\n");
    const { rows } = await parseExpenses(file);
    expect(rows[0].amount).toBe(12500);
  });

  it("defaults category and currency when missing", async () => {
    const file = csvFile("date,amount\n2024-01-01,100\n");
    const { rows } = await parseExpenses(file);
    expect(rows[0].category).toBe("Uncategorized");
    expect(rows[0].currency).toBe("INR");
  });

  it("skips fully empty rows and reports how many", async () => {
    const file = csvFile("date,amount\n,\n2024-01-01,100\n");
    const { rows, skipped } = await parseExpenses(file);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});

describe("parseIncomeRows", () => {
  it("normalizes type and frequency", async () => {
    const file = csvFile(
      "name,type,amount,currency,frequency,notes\nDividends,Passive,5000,INR,Weekly,Stocks\n",
    );
    const rows = await parseIncomeRows(file);
    expect(rows[0]).toMatchObject({
      name: "Dividends",
      type: "passive",
      amount: 5000,
      frequency: "weekly",
      notes: "Stocks",
    });
  });

  it("defaults to active/monthly and drops nameless rows", async () => {
    const file = csvFile("name,amount\n,999\nSalary,80000\n");
    const rows = await parseIncomeRows(file);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Salary", type: "active", frequency: "monthly" });
  });
});

describe("parseGoals", () => {
  it("maps target/current amounts and falls back to active status", async () => {
    const file = csvFile(
      "title,category,target_amount,current_amount,currency,target_date,status\n" +
        "Emergency Fund,Savings,300000,50000,INR,2025-12-31,active\n",
    );
    const rows = await parseGoals(file);
    expect(rows[0]).toMatchObject({
      title: "Emergency Fund",
      target_amount: 300000,
      current_amount: 50000,
      target_date: "2025-12-31",
      status: "active",
    });
  });

  it("accepts the 'name'/'target' header aliases", async () => {
    const file = csvFile("name,target\nNew Car,800000\n");
    const rows = await parseGoals(file);
    expect(rows[0]).toMatchObject({ title: "New Car", target_amount: 800000, status: "active" });
  });
});

describe("parseBudgets", () => {
  it("parses allocations and defaults the period", async () => {
    const file = csvFile("bucket,allocated,spent\nFood,15000,2000\n");
    const rows = await parseBudgets(file);
    expect(rows[0]).toMatchObject({
      bucket: "Food",
      allocated: 15000,
      spent: 2000,
      period: "monthly",
    });
  });

  it("accepts the 'category' header alias and drops bucketless rows", async () => {
    const file = csvFile("category,allocated\n,500\nTransport,5000\n");
    const rows = await parseBudgets(file);
    expect(rows).toHaveLength(1);
    expect(rows[0].bucket).toBe("Transport");
  });
});

describe("supported extensions", () => {
  it("exposes the structured subset without PDF", () => {
    expect(SUPPORTED_EXT).toContain(".pdf");
    expect(STRUCTURED_EXT).not.toContain(".pdf");
    expect(STRUCTURED_EXT).toEqual([".csv", ".xls", ".xlsx"]);
  });
});

describe("parseCSV — broker exports", () => {
  it("finds the header below a title block and keeps sells as sells", async () => {
    const file = csvFile(
      "Client ID,AB1234\n" +
        "Tradebook for Equity from 2024-04-01 to 2025-03-31\n" +
        "\n" +
        "Symbol,ISIN,Trade Date,Exchange,Trade Type,Quantity,Price\n" +
        "ITC,INE154A01025,2024-04-15,NSE,buy,10,410.50\n" +
        "ITC,INE154A01025,02-05-2024,NSE,sell,4,438\n",
      "tradebook-Zerodha-EQ.csv",
    );
    const rows = await parseCSV(file);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2024-04-15", asset: "ITC", action: "Inflow", quantity: 10, price: 410.5 });
    expect(rows[1]).toMatchObject({ date: "2024-05-02", action: "Outflow", quantity: 4, price: 438 });
  });

  it("reads a holdings export (Quantity Available, Average Price)", async () => {
    const file = csvFile(
      "Symbol,ISIN,Sector,Quantity Available,Average Price,Previous Closing Price\n" +
        "DRREDDY,INE089A01031,Pharma,5,1199.73,1352\n",
    );
    const rows = await parseCSV(file);
    expect(rows).toEqual([
      expect.objectContaining({ asset: "DRREDDY", quantity: 5, price: 1199.73 }),
    ]);
  });

  it("drops a total line under the table", async () => {
    const file = csvFile("Symbol,Quantity,Price\nITC,10,410\nTotal,,\n");
    expect(await parseCSV(file)).toHaveLength(1);
  });
});
