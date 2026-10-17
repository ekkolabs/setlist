import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SetlistApp from '@/components/SetlistApp';
import { loadDoc } from '@/lib/load';
import { siteConfig } from '@/site.config';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await loadDoc();
  const list = doc.lists.find((l) => l.slug === slug);
  return { title: list ? `${list.name} — ${siteConfig.name}` : siteConfig.name };
}

// "/<slug>" serves one specific setlist, current or not.
export default async function SlugPage({ params }: Props) {
  const { slug } = await params;
  const doc = await loadDoc();
  if (!doc.lists.some((l) => l.slug === slug)) notFound();
  return <SetlistApp initialDoc={doc} initialSlug={slug} />;
}
