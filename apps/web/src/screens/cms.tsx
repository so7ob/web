import { useRouteLoaderData } from 'react-router-dom';
import type { PublicView } from '@so7ob/contracts';
import { PageRenderer } from '@/components/blocks/page-renderer';
import type { Block } from '@/lib/blocks/types';
import { NotFound } from './not-found';
export function Component() {
  const data=useRouteLoaderData<PublicView>('root');
  if (!data || data.kind!=='cms') return <NotFound />;
  const blocks:Block[]=JSON.parse((data.locale==='ar'?data.page.publishedBlocksAr:data.page.publishedBlocksEn)||'[]');
  return <PageRenderer blocks={blocks} locale={data.locale}/>;
}
