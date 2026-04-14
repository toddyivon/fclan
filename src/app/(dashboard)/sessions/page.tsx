export default function SessionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sessions</h1>
        <p className="text-muted-foreground mt-1">View and manage your GT7 telemetry sessions.</p>
      </div>
      <div className="text-center py-20 text-muted-foreground">
        <p className="text-lg">No sessions yet</p>
        <p className="text-sm mt-2">Start capturing telemetry data using the mobile app.</p>
      </div>
    </div>
  );
}