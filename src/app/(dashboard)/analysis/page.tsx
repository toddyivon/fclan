import { AnalysisClient } from "@/components/analysis/analysis-client";

export default function AnalysisPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Analysis</h1>
        <p className="text-muted-foreground mt-1">
          Get personalized lap coaching powered by AI, grounded in your real telemetry.
        </p>
      </div>
      <AnalysisClient />
    </div>
  );
}
