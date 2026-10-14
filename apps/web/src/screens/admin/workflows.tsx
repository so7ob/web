import {WorkflowWorkspace} from '@/components/admin/workflows/workspace';
import {useAdmin} from './data';
export function Component(){const data=useAdmin();return <WorkflowWorkspace locale={data.locale} me={data.user}/>;}
