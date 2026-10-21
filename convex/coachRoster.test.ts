/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import { ensureFinancialAccount } from "./lib/financialSources";

const modules = import.meta.glob("./**/*.ts");
const list = makeFunctionReference<"query">("coachRoster:list");
const detail = makeFunctionReference<"query">("coachRoster:detail");
const directory = makeFunctionReference<"query">("coachRoster:directory");
const rowsByIds = makeFunctionReference<"query">("coachRoster:rowsByIds");
const nextTransition = makeFunctionReference<"query">("coachRoster:nextTransition");
const finance = makeFunctionReference<"query">("financeAdmin:students");
async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", {email:"synthetic-coach@example.invalid"});
    const coach = await ctx.db.insert("appUsers", {authUserId:auth,name:"Synthetic Coach",email:"synthetic-coach@example.invalid",role:"coach",active:true,travelLead:false,financialEdit:false});
    const season = await ctx.db.insert("seasons", {name:"Synthetic current",year:2027,status:"active",startsAt:0,permissionVersion:"DRAFT",createdBy:coach});
    const student = await ctx.db.insert("students", {seasonId:season,legalName:"Synthetic Student",preferredName:"Synthetic",email:"synthetic-student@example.invalid",subteam:"Mechanical",active:true,travelTeam:true,roomCategoryLocked:false,allergies:{state:"unknown"},medications:{state:"unknown"}});
    return {auth,coach,season,student};
  });
  return {t,ids,coach:t.withIdentity({subject:`${ids.auth}|session`})};
}
const page={paginationOpts:{numItems:20,cursor:null},asOf:100};
describe("Coach student roster and record",()=>{
  it("schedules the next indexed event boundary across archived and duplicate times", async () => {
    const f = await fixture();
    await expect(f.t.query(nextTransition, { asOf: 100 })).rejects.toThrow();
    await expect(f.coach.query(nextTransition, { asOf: Number.NaN })).rejects.toThrow();
    expect(await f.coach.query(nextTransition, { asOf: 100 })).toBeNull();
    const eventFields = { seasonId: f.ids.season, type: "Team" as const, endsAt: 201, destination: "Synthetic", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open" as const, allowWithdrawal: false, permissionRequired: false, firstRequired: false };
    await f.t.run(async ctx => {
      await ctx.db.insert("events", { ...eventFields, name: "Archived", startsAt: 100, archived: true });
      await ctx.db.insert("events", { ...eventFields, name: "Current", startsAt: 100, archived: false });
      await ctx.db.insert("events", { ...eventFields, name: "Later", startsAt: 140, archived: false });
    });
    expect(await f.coach.query(nextTransition, { asOf: 100 })).toBe(101);
    expect(await f.coach.query(nextTransition, { asOf: 101 })).toBe(141);
    expect(await f.coach.query(nextTransition, { asOf: 141 })).toBeNull();
  });
  it("shows fundraiser presence without exposing its URL in roster rows",async()=>{
    const f=await fixture();
    expect((await f.coach.query(rowsByIds,{studentIds:[f.ids.student],asOf:100}))[0].fundraiserConnected).toBe(false);
    await f.t.run(ctx=>ctx.db.patch(f.ids.student,{fundraiserUrl:"https://www.zeffy.com/en-US/donation-form/synthetic-private"}));
    const result=await f.coach.query(list,page);
    expect(result.page[0].fundraiserConnected).toBe(true);
    expect(result.page[0]).not.toHaveProperty("fundraiserUrl");
    expect(JSON.stringify(result)).not.toContain("synthetic-private");
    await f.t.run(ctx=>ctx.db.patch(f.ids.student,{fundraiserUrl:undefined}));
    expect((await f.coach.query(rowsByIds,{studentIds:[f.ids.student],asOf:100}))[0].fundraiserConnected).toBe(false);
  });
  it("pages lightweight directory, projects grade precedence and structured surnames, and scopes enriched IDs",async()=>{
    const f=await fixture();
    const other=await f.t.run(async ctx=>{
      const original=await ctx.db.get(f.ids.student);
      if(!original)throw new Error("Missing synthetic fixture");
      const {_id,_creationTime,...fields}=original;
      void _id;void _creationTime;
      await ctx.db.patch(f.ids.student,{lastName:"Family",consentProfileV2:{grade:"10",dateOfBirth:"2011-01-15",guardian:{name:"G",relationship:"Parent",phone:"1",email:"g@example.invalid"},emergency:{name:"E",relationship:"Parent",phone:"1"},allergies:{state:"none",entries:[]},prescriptions:{state:"none",entries:[]},insurance:{state:"none",provider:null,policy:null},physician:{state:"none",name:null,phone:null}}});
      await ctx.db.insert("setupDrafts",{studentId:f.ids.student,seasonId:f.ids.season,grade:"11",updatedBy:f.ids.coach,updatedAt:1});
      for(let i=0;i<22;i++)await ctx.db.insert("students",{...fields,legalName:i===21?"Member 21 Zulu Jr.":`Member ${i} Zulu`});
      const oldSeason=await ctx.db.insert("seasons",{name:"Old",year:2026,status:"archived",startsAt:0,permissionVersion:"OLD",createdBy:f.ids.coach});
      return await ctx.db.insert("students",{...fields,seasonId:oldSeason,legalName:"Other Season"});
    });
    await expect(f.t.query(directory,{paginationOpts:{numItems:20,cursor:null}})).rejects.toThrow();
    await expect(f.t.query(rowsByIds,{studentIds:[f.ids.student],asOf:100})).rejects.toThrow();
    const first=await f.coach.query(directory,{paginationOpts:{numItems:20,cursor:null}});
    expect(first.page).toHaveLength(20);
    expect(first.isDone).toBe(false);
    const projected=first.page.find((row:{studentId:string})=>row.studentId===f.ids.student);
    expect(projected).toMatchObject({name:"Synthetic Student",lastName:"Family",grade:"11",connected:false});
    expect(projected).not.toHaveProperty("email");
    await f.t.run(async ctx=>{const draft=await ctx.db.query("setupDrafts").withIndex("by_studentId",q=>q.eq("studentId",f.ids.student)).unique();if(draft)await ctx.db.delete(draft._id)});
    const consentGrade=await f.coach.query(directory,{paginationOpts:{numItems:20,cursor:null}});
    expect(consentGrade.page.find((row:{studentId:string})=>row.studentId===f.ids.student)?.grade).toBe("10");
    const second=await f.coach.query(directory,{paginationOpts:{numItems:20,cursor:first.continueCursor}});
    expect(second.page).toHaveLength(3);
    expect(second.isDone).toBe(true);
    expect(second.page.at(-1)).toMatchObject({name:"Member 21 Zulu Jr.",lastName:"Zulu",grade:null});
    const ids=[...first.page,...second.page].map((row:{studentId:string})=>row.studentId);
    expect(ids).not.toContain(other);
    const rows=await f.coach.query(rowsByIds,{studentIds:[ids[21],f.ids.student],asOf:100});
    expect(rows.map((row:{studentId:string})=>row.studentId)).toEqual([ids[21],f.ids.student]);
    await expect(f.coach.query(rowsByIds,{studentIds:[other],asOf:100})).rejects.toThrow("current season");
    await expect(f.coach.query(rowsByIds,{studentIds:Array(21).fill(f.ids.student),asOf:100})).rejects.toThrow("At most 20");
  });
  it("filters connection across pages without restricting Coach access to unconnected students",async()=>{
    const f=await fixture();
    await f.t.run(async ctx=>{
      const original=await ctx.db.get(f.ids.student);
      if(!original) throw new Error("Missing synthetic fixture");
      const {_id,_creationTime,...fields}=original;
      void _id; void _creationTime;
      for(let i=0;i<22;i++) {
        const auth=await ctx.db.insert("users",{email:`synthetic-${i}@example.invalid`});
        const userId=await ctx.db.insert("appUsers",{authUserId:auth,email:`synthetic-${i}@example.invalid`,name:`Synthetic ${i}`,role:"student",active:true,travelLead:false,financialEdit:false});
        await ctx.db.insert("students",{...fields,legalName:`Synthetic connected ${i}`,userId});
      }
    });
    const unconnected=await f.coach.query(list,{...page,connection:"unconnected"});
    expect(unconnected.page.map((row:{studentId:string})=>row.studentId)).toEqual([f.ids.student]);
    expect(unconnected.isDone).toBe(true);
    const connected=await f.coach.query(list,{...page,connection:"connected"});
    expect(connected.page).toHaveLength(20);
    expect(connected.isDone).toBe(false);
    const next=await f.coach.query(list,{...page,connection:"connected",paginationOpts:{numItems:20,cursor:connected.continueCursor}});
    expect(next.page).toHaveLength(2);
    expect(next.isDone).toBe(true);
    expect(await f.coach.query(detail,{studentId:f.ids.student,asOf:100})).toMatchObject({studentId:f.ids.student,active:true,account:{linkage:"unlinked"}});
  });

  it("authorizes Coach only, minimizes list rows, and keeps inactive current-season details readable",async()=>{
    const f=await fixture();
    await expect(f.t.query(list,page)).rejects.toThrow();
    const rows=await f.coach.query(list,page);
    expect(rows.page).toHaveLength(1);
    expect(rows.page[0]).toMatchObject({name:"Synthetic Student",account:{linkage:"unlinked",access:"unknown"},balance:{state:"uninitialized",dueCents:null},readinessCoverage:"complete"});
    expect(rows.page[0]).not.toHaveProperty("email");
    expect(rows.page[0]).not.toHaveProperty("allergies");
    expect(rows.page[0].missingSummary).toEqual(expect.arrayContaining(["Profile setup","Shirt size","Room category","Guardian contact","Emergency contact","Health information"]));
    await f.t.run(ctx=>ctx.db.patch(f.ids.student,{active:false}));
    expect((await f.coach.query(list,{...page,active:false})).page[0]).toMatchObject({active:false,readinessCoverage:"notApplicable"});
    expect(await f.coach.query(detail,{studentId:f.ids.student,asOf:100})).toMatchObject({active:false,legalName:"Synthetic Student",balance:{dueCents:null}});
    await expect(f.coach.query(list,{paginationOpts:{numItems:21,cursor:null},asOf:100})).rejects.toThrow("between 1 and 20");
  });
  it("matches the finance roster projection and withholds invalid balance data",async()=>{
    const f=await fixture();
    const summaryId = await f.t.run(async ctx => {
      const account = await ensureFinancialAccount(ctx, f.ids.student);
      await ctx.db.patch(account._id, { chargedCents: 1000, personalAvailableCents: 250 });
      return ctx.db.insert("studentFinanceSummaries", { studentId: f.ids.student, seasonId: f.ids.season, version: 4, financialGeneration: account.generation, financialRevision: account.revision, chargedCents: 1000, paidCents: 0, personalAppliedCents: 0, fundraisingAppliedCents: 0, dueCents: 1000, personalAvailableCents: 250, fundraisingAvailableCents: 0, travelBalanceCents: 0, travelShareCents: 0, transferredInCents: 0, updatedAt: 123 });
    });
    const roster=(await f.coach.query(list,page)).page[0];
    const source=(await f.coach.query(finance,{paginationOpts:{numItems:20,cursor:null}})).page[0];
    expect(roster.name).toBe("Synthetic Student");
    expect(source.name).toBe("Synthetic Student");
    expect(roster.balance.state).toBe(source.state);
    expect(roster.balance.dueCents).toBe(source.dueCents);
    expect(roster.balance.personalAvailableCents).toBe(source.personalAvailableCents);
    expect(roster.balance).toEqual({ state: "ready", dueCents: 1000, personalAvailableCents: 250, fundraisingAvailableCents: 0, updatedAt: 123 });
    // A safe integer can still be invalid evidence: due must equal charged minus paid.
    await f.t.run(ctx => ctx.db.patch(summaryId, { dueCents: 999 }));
    const invalidRoster = (await f.coach.query(list, page)).page[0];
    const invalidSource = (await f.coach.query(finance, { paginationOpts: { numItems: 20, cursor: null } })).page[0];
    expect(invalidRoster.balance).toEqual({ state: "failed", dueCents: null, personalAvailableCents: null, fundraisingAvailableCents: null, updatedAt: null });
    expect(invalidSource).toMatchObject({ state: "failed", chargedCents: null, personalAppliedCents: null, fundraisingAppliedCents: null, dueCents: null, personalAvailableCents: null, fundraisingAvailableCents: null, updatedAt: null, canRecord: false });
    expect((await f.coach.query(detail, { studentId: f.ids.student, asOf: 100 })).balance).toEqual(invalidRoster.balance);
  });
  it("marks pending Whole Team enrollment and truncated event coverage unknown",async()=>{
    const f=await fixture();
    const eventFields={seasonId:f.ids.season,type:"Team" as const,endsAt:202, destination:"Synthetic",travel:"None",overnight:false,roomingEnabled:false,feeCents:0,signupMode:"assigned" as const,assignmentScope:"wholeTeam" as const,wholeTeamParticipantCount:0,enrollmentState:"running" as const,allowWithdrawal:false,permissionRequired:false,firstRequired:false,archived:false};
    await f.t.run(ctx=>ctx.db.insert("events",{...eventFields,name:"Synthetic pending event",startsAt:200}));
    const pending=(await f.coach.query(list,page)).page[0];
    expect(pending).toMatchObject({nextEvent:{state:"unknown",open:["Whole Team enrollment is not complete"]},readinessCoverage:"unknown"});
    await f.t.run(async ctx=>{for(let i=0;i<11;i++)await ctx.db.insert("events",{...eventFields,name:`Archived ${i}`,startsAt:101+i,endsAt:102+i,archived:true,enrollmentState:"complete"})});
    const truncated=(await f.coach.query(list,page)).page[0];
    expect(truncated).toMatchObject({nextEvent:null,readinessCoverage:"unknown"});
  });
});
