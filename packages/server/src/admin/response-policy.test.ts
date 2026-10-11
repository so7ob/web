import{it,expect}from'vitest';import{responseDeadline}from'./response-policy.js';
const createdAt=new Date('2026-10-10T00:00:00Z');
const base={status:'new',archivedAt:null,createdAt,lastClientReplyAt:null,lastStaffReplyAt:null};
it('retains 24 hours, strict time boundary and first-response semantics',()=>{
 expect(responseDeadline(base,24,new Date('2026-10-11T00:00:00Z'))).toMatchObject({responseOverdue:false,responseType:'first_response',responseDueAt:'2026-10-11T00:00:00.000Z'});
 expect(responseDeadline(base,24,new Date('2026-10-11T00:00:00.001Z')).responseOverdue).toBe(true);
});
it('staff reply clears the clock; a newer client reply starts a distinct deadline',()=>{
 const staff=new Date('2026-10-10T01:00:00Z'),client=new Date('2026-10-10T03:00:00Z');
 expect(responseDeadline({...base,lastStaffReplyAt:staff,status:'awaiting_info'},24).responseDueAt).toBeNull();
 expect(responseDeadline({...base,lastStaffReplyAt:staff,lastClientReplyAt:client},2)).toMatchObject({responseType:'client_reply',responseDueAt:'2026-10-10T05:00:00.000Z'});
});
it('closure/cancellation/archive pause eligibility and reopening retains the unanswered anchor',()=>{
 for(const status of ['closed','cancelled'])expect(responseDeadline({...base,status},24).responseDueAt).toBeNull();
 expect(responseDeadline({...base,archivedAt:new Date()},24).responseDueAt).toBeNull();
 expect(responseDeadline({...base,status:'in_review'},24).responseDueAt).toBe('2026-10-11T00:00:00.000Z');
});
