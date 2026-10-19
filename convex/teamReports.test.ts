/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import { ensureFinancialAccount } from "./lib/financialSources";
import { refreshStudentFinance } from "./lib/financeSummaries";

const modules=import.meta.glob("./**/*.ts");
const rows=makeFunctionReference<"query">("teamReports:list");
const events=makeFunctionReference<"query">("teamReports:events");
async function fixture(year=2027){
  const t=createTest(schema,modules);
  const ids=await t.run(async ctx=>{
    async function user(name:string,role:"coach"|"mentor"|"parent",travelLead=false){const auth=await ctx.db.insert("users",{email:`${name}@example.invalid`});return {auth,id:await ctx.db.insert("appUsers",{authUserId:auth,email:`${name}@example.invalid`,name,role,travelLead,financialEdit:false,active:true})}}
    const coach=await user("Coach","coach"),lead=await user("Lead","mentor",true),mentor=await user("Mentor","mentor"),parent=await user("Parent","parent");
    const season=await ctx.db.insert("seasons",{name:"Synthetic",year,status:"active",startsAt:0,permissionVersion:"DRAFT",createdBy:coach.id});
    const student=await ctx.db.insert("students",{seasonId:season,legalName:"Synthetic Student",preferredName:"Synthetic",email:"private-student@example.invalid",subteam:"Mechanical",active:true,travelTeam:true,roomCategoryLocked:false,allergies:{state:"reported",text:"PRIVATE HEALTH"},medications:{state:"unknown"}});
    return {coach,lead,mentor,parent,season,student};
  });
  return {t,ids,coach:t.withIdentity({subject:`${ids.coach.auth}|session`}),lead:t.withIdentity({subject:`${ids.lead.auth}|session`}),mentor:t.withIdentity({subject:`${ids.mentor.auth}|session`}),parent:t.withIdentity({subject:`${ids.parent.auth}|session`})};
}
const args={paginationOpts:{numItems:10,cursor:null},asOf:100};
describe("bounded role-scoped team reports",()=>{
  it("denies ordinary Mentor/Parent, minimizes Travel rows and exposes incomplete coverage",async()=>{
    const f=await fixture(2028);
    await expect(f.mentor.query(rows,args)).rejects.toThrow("Coach or Travel Lead");
    await expect(f.parent.query(rows,args)).rejects.toThrow("Coach or Travel Lead");
    const result=await f.lead.query(rows,args);
    expect(result.page).toHaveLength(1);
    expect(result.attendance).toMatchObject({state:"updating",kickoff:null});
    expect(result.page[0]).toMatchObject({name:"Synthetic Student",finance:{state:"uninitialized",paidCents:null,raisedCents:null},attendance:null,eventsCount:0,selectedEvent:null});
    expect(JSON.stringify(result)).not.toContain("PRIVATE HEALTH");
    expect(JSON.stringify(result)).not.toContain("private-student@example.invalid");
    await expect(f.coach.query(rows,{paginationOpts:{numItems:11,cursor:null},asOf:100})).rejects.toThrow("between 1 and 10");
  });
  it("reports verified materialized money, unknown raised, and unverified kickoff separately",async()=>{
    const f=await fixture(2028);
    await f.t.run(async ctx=>{
      const account=await ensureFinancialAccount(ctx,f.ids.student);
      await ctx.db.patch(account._id,{state:"ready",allocationSourceVersion:1,personalAppliedCents:0,fundraisingAppliedCents:0,knownRaisedCents:700,unknownGrossSourceCount:1});
      await refreshStudentFinance(ctx,f.ids.student);
      await ctx.db.insert("attendanceReportBackfills",{seasonId:f.ids.season,state:"complete",cursor:null,processed:1,updatedAt:10});
    });
    const result=await f.coach.query(rows,args);
    expect(result.attendance).toMatchObject({state:"unknownKickoff",kickoff:null});
    expect(result.page[0].finance).toMatchObject({state:"ready",chargedCents:0,paidCents:0,dueCents:0,travelAccountCents:0,raisedCents:null});
    expect(result.page[0].attendance).toBeNull();
    await f.t.run(async ctx=>{const summary=await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId",q=>q.eq("studentId",f.ids.student)).unique();if(!summary)throw new Error("Missing summary");await ctx.db.patch(summary._id,{travelBalanceCents:1})});
    expect((await f.coach.query(rows,args)).page[0].finance).toMatchObject({state:"failed",chargedCents:null,paidCents:null,travelAccountCents:null});
  });
  it("bounds roster pages and marks pending selected-event enrollment unknown",async()=>{
    const f=await fixture();
    const event=await f.t.run(async ctx=>{
      for(let i=0;i<11;i++)await ctx.db.insert("students",{seasonId:f.ids.season,legalName:`Synthetic ${i}`,preferredName:`Member ${i}`,email:`member${i}@example.invalid`,subteam:"Outreach",active:true,travelTeam:false,roomCategoryLocked:false,allergies:{state:"unknown"},medications:{state:"unknown"}});
      await ctx.db.insert("attendanceReportBackfills",{seasonId:f.ids.season,state:"complete",cursor:null,processed:12,updatedAt:10});
      return ctx.db.insert("events",{seasonId:f.ids.season,name:"Synthetic pending",type:"Team",startsAt:200,endsAt:300,destination:"Synthetic",travel:"None",overnight:false,roomingEnabled:false,feeCents:0,signupMode:"assigned",assignmentScope:"wholeTeam",wholeTeamParticipantCount:0,enrollmentState:"running",allowWithdrawal:false,permissionRequired:false,firstRequired:false,archived:false});
    });
    expect((await f.lead.query(events,{asOf:100})).items[0].eventId).toBe(event);
    const result=await f.coach.query(rows,{...args,eventId:event});
    expect(result.page).toHaveLength(10);
    expect(result.attendance.state).toBe("ready");
    expect(result.page[0].attendance).toMatchObject({offTuesday:0,buildSaturday:0});
    expect(result.isDone).toBe(false);
    expect(result.page[0].selectedEvent).toMatchObject({state:"unknown",outstanding:["Whole Team enrollment is not complete."]});
    await f.t.run(async ctx=>{await ctx.db.patch(event,{enrollmentState:"complete"});await ctx.db.insert("participants",{eventId:event,studentId:f.ids.student,status:"pending",createdAt:1,updatedAt:1})});
    const pending=await f.coach.query(rows,{...args,eventId:event});
    expect(pending.page.find((row:{studentId:string})=>row.studentId===f.ids.student)?.selectedEvent).toMatchObject({participation:"pending",state:"open",outstanding:["Participation is not confirmed"]});
    const budget=await f.coach.query(rows,{...args,paginationOpts:{numItems:10,maximumRowsRead:1,cursor:null}});
    expect(budget.page.length).toBeLessThanOrEqual(1);
  });
});
