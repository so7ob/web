import {ConversationList} from '../workflows/conversation-list';
import type {Me} from '../types';
import type {Locale} from '@/lib/i18n';
export function InquiriesClient(props:{me:Me;locale:Locale;initialStatus?:string;initialOverdue?:boolean}){return <ConversationList {...props} scope="inquiries"/>;}
