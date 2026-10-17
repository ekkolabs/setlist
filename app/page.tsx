import SetlistApp from '@/components/SetlistApp';
import { loadDoc } from '@/lib/load';

export const dynamic = 'force-dynamic';

// "/" always serves whichever setlist is marked current.
export default async function Page() {
  return <SetlistApp initialDoc={await loadDoc()} />;
}
