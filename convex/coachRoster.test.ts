/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import { ensureFinancialAccount } from "./lib/financialSources";

const modules = import.meta.glob("./**/*.ts");
const list = makeFunctionReference<"query">("coachRoster:list");
const detail = makeFunctionReference<"query">("coachRoster:detail");
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
  it("authorizes Coach only, minimizes list rows, and keeps inactive current-season details readable",async()=>{
    const f=await fixture();
    await expect(f.t.query(list,page)).rejects.toThrow();
    const rows=await f.coach.query(list,page);
    expect(rows.page).toHaveLength(1);
    expect(rows.page[0]).toMatchObject({name:"Synthetic",account:{linkage:"unlinked",access:"unknown"},balance:{state:"uninitialized",dueCents:null},readinessCoverage:"complete"});
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
    await f.t.run(async ctx=>{const account=await ensureFinancialAccount(ctx,f.ids.student);await ctx.db.patch(account._id,{state:"ready",allocationSourceVersion:1,personalAppliedCents:0,fundraisingAppliedCents:0})});
    const roster=(await f.coach.query(list,page)).page[0];
    const source=(await f.coach.query(finance,{paginationOpts:{numItems:20,cursor:null}})).page[0];
    expect(roster.balance.state).toBe(source.state);
    expect(roster.balance.dueCents).toBe(source.dueCents);
    expect(roster.balance.personalAvailableCents).toBe(source.personalAvailableCents);
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
