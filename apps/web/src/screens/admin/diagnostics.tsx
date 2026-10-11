import {DiagnosticsClient} from '@/components/admin/diagnostics/diagnostics-client';
import {useAdmin} from './data';
export function Component(){const data=useAdmin();return <DiagnosticsClient me={data.user} locale={data.locale}/>;}
