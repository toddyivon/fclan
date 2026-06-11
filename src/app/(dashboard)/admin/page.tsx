import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCards } from "@/components/admin/stats-cards";
import { UserTable } from "@/components/admin/user-table";

// Role gating happens in admin/layout.tsx (server-side redirect for non-admins);
// every /api/admin/* route re-verifies the requester's role independently.
export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="text-muted-foreground mt-1">System overview and user administration.</p>
      </div>

      <StatsCards />

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Search users, change tiers and manage admin roles.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserTable currentUserId={user?.id ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
