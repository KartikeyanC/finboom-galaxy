import { TransactionImporter } from "@/components/import/TransactionImporter";
import { SmsCapture } from "@/components/import/SmsCapture";

export default function ImportPage() {
  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <SmsCapture />
      <TransactionImporter />
    </div>
  );
}
