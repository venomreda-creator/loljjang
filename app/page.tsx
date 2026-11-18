import Dashboard from '@/components/Dashboard';
import accountsRaw from '@/data/seed-accounts.json';
import recordsRaw from '@/data/seed-records.json';
import type { Account, MatchRecord } from '@/lib/types';

export default function Page() {
  return (
    <Dashboard
      records={recordsRaw as unknown as MatchRecord[]}
      accounts={accountsRaw as unknown as Account[]}
    />
  );
}
