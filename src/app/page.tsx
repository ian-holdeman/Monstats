import { readPageData } from '@/server/serving-reader';
import { Explorer } from '@/components/explorer';
export const dynamic = 'force-dynamic';
export default async function Page() {
  return <Explorer data={await readPageData()} />;
}
