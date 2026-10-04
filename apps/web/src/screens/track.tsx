import {useRouteLoaderData} from 'react-router-dom';
import type {PublicView} from '@so7ob/contracts';
import Link from '@/routing/link';
import {Logo} from '@/components/site/logo';
import {Toaster} from '@/components/ui/sonner';
import {getPortalContent} from '@/content/portal';
import {localeMeta,localePath} from '@/lib/i18n';
import {TrackClient} from '@/components/track/track-client';
import {siteConfig} from '@/config/site';
export function Component(){
 const data=useRouteLoaderData<PublicView>('root');if(!data||data.kind!=='track')throw new Error('Invalid track view');
 const {locale,parameters}=data,portal=getPortalContent(locale),dir=localeMeta[locale].dir,settings={nameAr:data.settings["site.nameAr"]||siteConfig.nameAr,nameEn:data.settings["site.nameEn"]||siteConfig.nameEn},siteName=locale==='ar'?settings.nameAr:settings.nameEn;
 return <div dir={dir} className="relative mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-10 sm:py-14">
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
   <div className="absolute inset-x-0 -top-24 h-64 bg-gradient-to-b from-accent/70 via-brand/10 to-transparent"/>
   <div className="absolute -top-16 start-[-6rem] size-56 rounded-full bg-skydrop/20 blur-3xl"/>
   <div className="absolute top-24 end-[-7rem] size-64 rounded-full bg-brand/15 blur-3xl"/>
  </div>
  <Link href={localePath(locale)} className="mb-8 inline-flex rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" aria-label={siteName}><Logo size="md" nameLang={locale==='ar'?'ar':'en'}/></Link>
  <div className="w-full"><TrackClient locale={locale} t={portal.track} siteNames={{nameAr:settings.nameAr,nameEn:settings.nameEn}} token={parameters.token||undefined} cardParam={parameters.cardParam||undefined}/></div>
  <Toaster richColors position="top-center" dir={dir}/>
 </div>;
}
