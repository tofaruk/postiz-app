export const dynamic = 'force-dynamic';
import { PublishComponent } from '@gitroom/frontend/components/publish/publish.component';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Postiz Publish',
  description: '',
};
// No Time German: the posts as a list by day, like Buffer's Publish page (components/publish).
export default async function Index() {
  return <PublishComponent />;
}
