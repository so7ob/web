import { useRouteLoaderData } from 'react-router-dom';
import { loadContentForRender, type PublicView } from '@so7ob/contracts';
import { PageRenderer } from '@/components/blocks/page-renderer';
import { TreePageRenderer } from '@/components/blocks/tree-page-renderer';
import type { Block } from '@/lib/blocks/types';
import { NotFound } from './not-found';
export function Component() {
  const data=useRouteLoaderData<PublicView>('root');
  if (!data || data.kind!=='cms') return <NotFound />;
  const raw=(data.locale==='ar'?data.page.publishedBlocksAr:data.page.publishedBlocksEn)||'[]';
  const parsed: unknown=JSON.parse(raw);
  // Preserve the established v0 layout until its editor saves the new envelope.
  if(Array.isArray(parsed)) return <PageRenderer blocks={parsed as Block[]} locale={data.locale}/>;
  const content=loadContentForRender(raw);
  if(!content.ok) return <NotFound />;
  return <TreePageRenderer nodes={content.tree} locale={data.locale}/>;
}
