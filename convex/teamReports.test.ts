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
  it("reports link connection to Coaches and Travel without revealing fundraiser URLs",async()=>{
    const f=await fixture();
    const roster=makeFunctionReference<"query">("app:teamRoster");
    expect((await f.lead.query(rows,args)).page[0].fundraiserConnected).toBe(false);
    expect((await f.lead.query(roster,{}))[0].fundraiserConnected).toBe(false);
    await f.t.run(ctx=>ctx.db.patch(f.ids.student,{fundraiserUrl:"https://www.zeffy.com/en-US/donation-form/private-synthetic-link"}));
    for(const actor of [f.coach,f.lead]){
      const report=await actor.query(rows,args);
      const team=await actor.query(roster,{});
      expect(report.page[0].fundraiserConnected).toBe(true);
      expect(team[0].fundraiserConnected).toBe(true);
      expect(JSON.stringify({report,team})).not.toContain("private-synthetic-link");
      expect(team[0]).not.toHaveProperty("fundraiserUrl");
    }
    await expect(f.mentor.query(roster,{})).rejects.toThrow("Only a Coach or Travel Lead can open the team roster");
    await f.t.run(ctx=>ctx.db.patch(f.ids.student,{fundraiserUrl:undefined}));
    expect((await f.lead.query(rows,args)).page[0].fundraiserConnected).toBe(false);
  });
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
    await expect(f.coach.query(rows,{paginationOpts:{numItems:11,cursor:null},asOf:100})).rejects.toThrow("This report could not load");
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
    expect(pending.page.find((row:{studentId:string})=>row.studentId===f.ids.student)?.selectedEvent).toMatchObject({participation:"pending",state:"open",outstanding:["Signup not confirmed yet"]});
    const budget=await f.coach.query(rows,{...args,paginationOpts:{numItems:10,maximumRowsRead:1,cursor:null}});
    expect(budget.page.length).toBeLessThanOrEqual(1);
  });
  it("lists only a Mentor's own subteams by default, widens on request, and never returns private data",async()=>{
    const f=await fixture();
    const mentorList=makeFunctionReference<"query">("teamReports:mentorList");
    await f.t.run(async ctx=>{
      await ctx.db.patch(f.ids.mentor.id,{subteams:["Programming"]});
      const base=(await ctx.db.get(f.ids.student))!;
      const {_id,_creationTime,...rest}=base;
      void _id;void _creationTime;
      await ctx.db.insert("students",{...rest,legalName:"Programmer",preferredName:"Prog",subteam:"Programming",email:"prog-private@example.invalid"});
    });
    const mine=await f.mentor.query(mentorList,{allSubteams:false});
    expect(mine).toMatchObject({scope:"mine",subteams:["Programming"],totalStudents:1});
    expect(mine.rows.map((row:{name:string})=>row.name)).toEqual(["Prog"]);
    const all=await f.mentor.query(mentorList,{allSubteams:true});
    expect(all.rows.map((row:{name:string})=>row.name).sort()).toEqual(["Prog","Synthetic"]);
    expect(JSON.stringify(all)).not.toMatch(/PRIVATE HEALTH|private@|prog-private|private-student/);
    expect(Object.keys(all.rows[0]).sort()).toEqual(["events","name","requiredPercent","studentId","subteam","thursdayAttended","travelTeam"]);
    await f.t.run(ctx=>ctx.db.patch(f.ids.mentor.id,{subteams:[]}));
    expect((await f.mentor.query(mentorList,{allSubteams:false})).rows).toEqual([]);
    for(const actor of [f.coach,f.parent]) await expect(actor.query(mentorList,{allSubteams:false})).rejects.toThrow("Only a Mentor");
  });
  it("caps the Mentor report at 40 students and says when the list is incomplete",async()=>{
    const f=await fixture();
    const mentorList=makeFunctionReference<"query">("teamReports:mentorList");
    await f.t.run(async ctx=>{
      const base=(await ctx.db.get(f.ids.student))!;
      const {_id,_creationTime,...rest}=base;
      void _id;void _creationTime;
      for(let n=0;n<45;n++) await ctx.db.insert("students",{...rest,legalName:`Extra ${n}`,preferredName:`Extra ${n}`});
    });
    const result=await f.mentor.query(mentorList,{allSubteams:true});
    expect(result.rows).toHaveLength(40);
    // 45 extras plus the fixture student: the true total is reported, and the 40 shown are the first 40 by name.
    expect(result).toMatchObject({totalStudents:46,studentsComplete:false});
    const names=result.rows.map((row:{name:string})=>row.name);
    expect(names).toEqual([...names].sort((a:string,b:string)=>a.localeCompare(b)));
    expect(names).not.toContain("Synthetic");
  });
  it("finds a Mentor's own students even when they are last on a roster of 50",async()=>{
    const f=await fixture();
    const mentorList=makeFunctionReference<"query">("teamReports:mentorList");
    await f.t.run(async ctx=>{
      const base=(await ctx.db.get(f.ids.student))!;
      const {_id,_creationTime,...rest}=base;
      void _id;void _creationTime;
      for(let n=0;n<50;n++) await ctx.db.insert("students",{...rest,legalName:`Other ${n}`,preferredName:`Other ${n}`,subteam:"Mechanical"});
      for(let n=0;n<5;n++) await ctx.db.insert("students",{...rest,legalName:`Mine ${n}`,preferredName:`Mine ${n}`,subteam:"Programming"});
      await ctx.db.patch(f.ids.mentor.id,{subteams:["Programming"]});
    });
    const result=await f.mentor.query(mentorList,{allSubteams:false});
    expect(result.rows.map((row:{name:string})=>row.name)).toEqual(["Mine 0","Mine 1","Mine 2","Mine 3","Mine 4"]);
    expect(result).toMatchObject({totalStudents:5,studentsComplete:true});
  });
  it("still lists a student's newest event when the season has more than 200 events",async()=>{
    const f=await fixture();
    const mentorList=makeFunctionReference<"query">("teamReports:mentorList");
    await f.t.run(async ctx=>{
      const seasonId=(await ctx.db.get(f.ids.student))!.seasonId;
      const base={seasonId,type:"Team" as const,destination:"Shop",travel:"None",overnight:false,roomingEnabled:false,feeCents:0,signupMode:"open" as const,allowWithdrawal:true,permissionRequired:false,firstRequired:false,archived:false};
      for(let n=0;n<200;n++) await ctx.db.insert("events",{...base,name:`Old ${n}`,startsAt:10+n,endsAt:20+n});
      const newest=await ctx.db.insert("events",{...base,name:"Newest trip",startsAt:90_000,endsAt:91_000});
      await ctx.db.insert("participants",{eventId:newest,studentId:f.ids.student,status:"confirmed",createdAt:1,updatedAt:1});
      await ctx.db.patch(f.ids.mentor.id,{subteams:[(await ctx.db.get(f.ids.student))!.subteam]});
    });
    const result=await f.mentor.query(mentorList,{allSubteams:true});
    expect(result.rows.find((row:{studentId:string})=>row.studentId===f.ids.student)?.events).toEqual(["Newest trip"]);
  });
});
