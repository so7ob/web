import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { Link as RouterLink } from 'react-router-dom';
interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> { href: string; prefetch?: boolean; replace?: boolean; scroll?: boolean }
const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, replace, scroll, prefetch: _prefetch, ...props }, ref) {
  if (!href.startsWith('/') || href.startsWith('//')) return <a {...props} href={href} ref={ref} />;
  return <RouterLink {...props} to={href} replace={replace} preventScrollReset={scroll === false} ref={ref} />;
});
export default Link;
