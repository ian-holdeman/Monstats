import { Explorer } from '@/components/explorer';
import { readAppData } from '@/server/reader';
export const dynamic = 'force-dynamic';
export default function MatchupsPage() {
  return <Explorer data={readAppData()} initialTab="matchups" />;
}
