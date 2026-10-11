import type{DataSource}from'typeorm';
export async function responsePolicy(db:DataSource){
 const rows:Array<{key:string;value:string}>=await db.query("SELECT `key`,value FROM SiteSetting WHERE `key` IN ('response.hours','response.effectiveAt')");
 const values=Object.fromEntries(rows.map(r=>[r.key,r.value]));const hours=Number(values['response.hours']??24);
 return {hours:Number.isInteger(hours)&&hours>=1&&hours<=720?hours:24,effectiveAt:values['response.effectiveAt']??null};
}
/** Current request states remain unchanged. A status label alone is not a staff reply. */
export function responseAnchorSql(alias='p'){
 const p=alias?alias+'.':'';
 return `(CASE WHEN ${p}archivedAt IS NULL AND ${p}status IN ('new','in_review','awaiting_info','in_progress','responded') THEN CASE WHEN ${p}lastClientReplyAt IS NOT NULL AND (${p}lastStaffReplyAt IS NULL OR ${p}lastClientReplyAt>${p}lastStaffReplyAt) THEN ${p}lastClientReplyAt WHEN ${p}lastClientReplyAt IS NULL AND ${p}lastStaffReplyAt IS NULL THEN ${p}createdAt ELSE NULL END ELSE NULL END)`;
}
export const responseDueSql=(alias='p')=>`TIMESTAMPADD(HOUR,?,${responseAnchorSql(alias)})`;
export function responseDeadline(row:{status:string;archivedAt:Date|null;createdAt:Date;lastClientReplyAt?:Date|null;lastStaffReplyAt?:Date|null},hours:number,now=new Date()){
 const open=['new','in_review','awaiting_info','in_progress','responded'].includes(row.status)&&row.archivedAt===null;
 const anchor=!open?null:row.lastClientReplyAt&&(!row.lastStaffReplyAt||row.lastClientReplyAt>row.lastStaffReplyAt)?row.lastClientReplyAt:!row.lastClientReplyAt&&!row.lastStaffReplyAt?row.createdAt:null;
 const due=anchor?new Date(anchor.valueOf()+hours*3600000):null;
 return {awaitingSince:anchor?.toISOString()??null,responseDueAt:due?.toISOString()??null,responseOverdue:!!due&&due<now,responseType:due?(row.lastStaffReplyAt?'client_reply':'first_response'):null,needsStaffReply:!!due};
}
