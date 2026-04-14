import { Brain, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AnalysisPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Analysis</h1>
        <p className="text-muted-foreground mt-1">Get personalized lap coaching powered by AI.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-400" />
            Analyze Your Laps
          </CardTitle>
          <CardDescription>
            Select a session and lap to get AI-powered suggestions on where you can improve your driving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a session to analyze</p>
            <p className="text-xs mt-1">Available on Pro and AI Premium plans</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}