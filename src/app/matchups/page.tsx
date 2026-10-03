import { Explorer } from '@/components/explorer';
import { readPageData } from '@/server/serving-reader';
export const dynamic = 'force-dynamic';
export default async function MatchupsPage() {
  return <Explorer data={await readPageData()} initialTab="matchups" />;
}
