import { useLocation, useNavigate, useRevalidator, useParams as routerParams } from 'react-router-dom';
import { useMemo } from 'react';
export function usePathname() { return useLocation().pathname; }
export function useSearchParams() { const { search } = useLocation(); return useMemo(() => new URLSearchParams(search), [search]); }
export const useParams = routerParams;
export function useRouter() {
  const navigate = useNavigate(); const revalidator = useRevalidator();
  return useMemo(() => ({
    push: (to: string, options?: { scroll?: boolean }) => navigate(to, { preventScrollReset: options?.scroll === false }),
    replace: (to: string, options?: { scroll?: boolean }) => navigate(to, { replace: true, preventScrollReset: options?.scroll === false }),
    refresh: () => revalidator.revalidate(), back: () => navigate(-1), forward: () => navigate(1),
  }), [navigate, revalidator]);
}
