import { isSupabaseAuthConfigured } from '../../lib/supabase';
import Dashboard from './dashboard';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const { trip } = await searchParams;
  return <Dashboard authConfigured={isSupabaseAuthConfigured()} initialTrip={typeof trip === 'string' ? trip : ''} />;
}
