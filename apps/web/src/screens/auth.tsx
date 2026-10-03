import { useRouteLoaderData } from 'react-router-dom';
import type { PublicView } from '@so7ob/contracts';
import { getPortalContent } from '@/content/portal';
import { AuthLayout } from '@/components/auth/layout';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { ForgotForm } from '@/components/auth/forgot-form';
import { ResetForm } from '@/components/auth/reset-form';
import { InviteForm } from '@/components/auth/invite-form';
import { LogoutAction } from '@/components/auth/logout-action';
import { Verified } from '@/components/auth/verified';
export function Component() {
  const data=useRouteLoaderData<PublicView>('root');
  if (!data || data.kind!=='auth') throw new Error('Invalid authentication view');
  const { locale,screen,parameters }=data; const portal=getPortalContent(locale); const t=portal.auth;
  const views={
    login:<LoginForm locale={locale} t={t} next={parameters.next}/>,
    register:<RegisterForm locale={locale} t={t} nameLabel={portal.account.profile.name}/>,
    'forgot-password':<ForgotForm locale={locale} t={t}/>,
    'reset-password':<ResetForm locale={locale} t={t} token={parameters.token}/>,
    invite:<InviteForm locale={locale} t={t} token={parameters.token} nameLabel={portal.account.profile.name}/>,
    verified:<Verified locale={locale} value={parameters.status}/>,
    logout:<LogoutAction locale={locale} label={t.logout}/>,
  };
  return <AuthLayout locale={locale}>{views[screen]}</AuthLayout>;
}
