import { readAppData } from '@/server/reader';
import { Explorer } from '@/components/explorer';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <Explorer data={readAppData()} />;
}
