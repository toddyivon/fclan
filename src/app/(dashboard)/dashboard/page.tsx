import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gauge, Car, Smartphone, ChevronRight, Trophy } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Monitor your GT7 telemetry and analyze your laps.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Sessions</CardDescription>
            <CardTitle className="text-3xl">0</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Best Lap</CardDescription>
            <CardTitle className="text-2xl">--:--.--</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cars Driven</CardDescription>
            <CardTitle className="text-3xl">--</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>AI Analyses</CardDescription>
            <CardTitle className="text-3xl">0</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-violet-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-violet-400" />
              Start Capturing
            </CardTitle>
            <CardDescription>
              Use your phone to capture GT7 telemetry data. Open the mobile app, enter your API key, and start driving.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-violet-600/20 border-violet-500/40 text-violet-400 shrink-0">1</Badge>
                  <span>Connect your phone to the same WiFi as your PlayStation</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-violet-600/20 border-violet-500/40 text-violet-400 shrink-0">2</Badge>
                  <span>Open the GT7 Telemetry app on your phone</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-violet-600/20 border-violet-500/40 text-violet-400 shrink-0">3</Badge>
                  <span>Enter your PS5 IP address and API key, then press Start</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-violet-600/20 border-violet-500/40 text-violet-400 shrink-0">4</Badge>
                  <span>Start GT7 with Simulator Interface enabled in Settings</span>
                </div>
              </div>
              <Button className="bg-violet-600 hover:bg-violet-500 w-full">
                <Smartphone className="mr-2 h-4 w-4" />
                Download Mobile App
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-violet-400" />
              Recent Sessions
            </CardTitle>
            <CardDescription>Your latest driving sessions will appear here.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Car className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No sessions yet</p>
              <p className="text-xs mt-1">Start your first capture to see data</p>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
