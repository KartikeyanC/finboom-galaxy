/**
 * Broker export instructions — pure data, lifted out of TransactionImporter
 * (Stage 4.13). It was 180 lines of copy sitting in the middle of a 1 260-line
 * component, which is the kind of bulk that makes a file unreviewable without
 * being hard in itself.
 *
 * Adding a broker means adding an entry here and nothing else.
 */


// ── Broker definitions ─────────────────────────────────────────────────────
export type Broker = {
  value: string;
  label: string;
  initial: string;
  brand: string;
  url: string;
  steps: string[];
  footnote: string;
};

export const BROKERS: Broker[] = [
  {
    value: "Zerodha",
    label: "Zerodha",
    initial: "Z",
    brand: "#387ED1",
    url: "console.zerodha.com",
    steps: [
      "Login to **console.zerodha.com**",
      "Go to **Console → Reports → Tradebook**",
      "Select segment and date range",
      "Click **XLSX** to download the file",
      "Upload the downloaded file below",
    ],
    footnote: "Imports equity & F&O trades with cost and quantity.",
  },
  {
    value: "Groww",
    label: "Groww",
    initial: "G",
    brand: "#00B386",
    url: "groww.in",
    steps: [
      "Login to **groww.in**",
      "Open **Profile → Reports**",
      "Choose **Capital Gains / Transactions**",
      "Download the **Excel** statement",
      "Upload the file below",
    ],
    footnote: "Imports stocks and mutual fund holdings.",
  },
  {
    value: "INDmoney",
    label: "INDmoney",
    initial: "↑",
    brand: "#111111",
    url: "indmoney.com",
    steps: [
      "Login to **indmoney.com**",
      "Open **Portfolio → Reports**",
      "Select **Transactions** report",
      "Export as **CSV / XLSX**",
      "Upload the downloaded file below",
    ],
    footnote: "Imports US + IN equities and mutual funds.",
  },
  {
    value: "Upstox",
    label: "Upstox",
    initial: "U",
    brand: "#7B3FF2",
    url: "upstox.com",
    steps: [
      "Login to **upstox.com**",
      "Go to **Reports → Trade Report**",
      "Pick the financial year",
      "Download the **XLSX** file",
      "Upload the file below",
    ],
    footnote: "Imports executed trades across segments.",
  },
  {
    value: "ICICI Direct",
    label: "ICICI Direct",
    initial: "i",
    brand: "#F26722",
    url: "icicidirect.com",
    steps: [
      "Login to **icicidirect.com**",
      "Open **Portfolio → Reports**",
      "Choose **Transaction Statement**",
      "Download as **XLSX / PDF**",
      "Upload the file below",
    ],
    footnote: "Imports equity, F&O and MF activity.",
  },
  {
    value: "CDSL",
    label: "CDSL",
    initial: "C",
    brand: "#2563EB",
    url: "cdslindia.com",
    steps: [
      "Login to **CDSL Easi / Easiest**",
      "Open **Holdings Statement**",
      "Select date range",
      "Download the **PDF** statement",
      "Upload the file below",
    ],
    footnote: "Imports demat holdings across linked DPs.",
  },
  {
    value: "Angel One",
    label: "Angel One",
    initial: "A",
    brand: "#E94560",
    url: "angelone.in",
    steps: [
      "Login to **angelone.in**",
      "Open **Reports → Trade Book**",
      "Pick segment and dates",
      "Download as **XLSX**",
      "Upload the file below",
    ],
    footnote: "Imports equity and F&O trades.",
  },
  {
    value: "Aionion",
    label: "Aionion",
    initial: "△",
    brand: "#10B981",
    url: "tradeplus.aionioncapital.com",
    steps: [
      "Login to **tradeplus.aionioncapital.com**",
      "Click **Portfolio+**",
      "Go to **Dashboard → DEMAT HOLDINGS**",
      "Click **Export** to download the XLSX file",
      "Upload the downloaded file below",
    ],
    footnote: "Imports equity holdings with investment cost and market values.",
  },
  {
    value: "Chola Securities",
    label: "Chola Securities",
    initial: "+",
    brand: "#DC2626",
    url: "cholasecurities.com",
    steps: [
      "Login to **cholasecurities.com**",
      "Open **Reports → Holdings**",
      "Pick the financial year",
      "Download as **XLSX**",
      "Upload the file below",
    ],
    footnote: "Imports demat holdings statement.",
  },
  {
    value: "mstock",
    label: "mstock",
    initial: "m",
    brand: "#F97316",
    url: "mstock.com",
    steps: [
      "Login to **mstock.com**",
      "Open **Reports → Trade Book**",
      "Pick segment and dates",
      "Download as **XLSX**",
      "Upload the file below",
    ],
    footnote: "Imports equity and derivatives trades.",
  },
];

export const CUSTOM_BROKER: Broker = {
  value: "__custom__",
  label: "Other Platform / Custom Bank PDF",
  initial: "+",
  brand: "#64748B",
  url: "",
  steps: [
    "Export a **CSV, XLS, XLSX or PDF** statement from your platform",
    "Ensure columns include **Date, Symbol/Asset, Type, Quantity, Price**",
    "Drop the file into the upload area below",
    "Review the extracted rows and adjust the FX rate for foreign currencies",
    "Click **Approve & Import Rows** to save to your ledger",
  ],
  footnote: "Generic parser — works with most bank and broker statements.",
};
