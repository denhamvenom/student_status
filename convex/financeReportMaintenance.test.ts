/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from "convex/server";
import schema from "./schema";
import { api } from "./_generated/api";
import type * as maintenance from "./financeReportMaintenance";
import { calculateStudentFinance } from "./lib/financeSummaries";
import { financeFor } from "./lib/readModels";

const modules = import.meta.glob("./**/*.ts");
type Maintenance = ApiFromModules<{ financeReportMaintenance: typeof maintenance }>["financeReportMaintenance"];
const start = makeFunctionReference<"mutation", FunctionArgs<Maintenance["start"]>, FunctionReturnType<Maintenance["start"]>>("financeReportMaintenance:start");
const worker = makeFunctionReference<"mutation", FunctionArgs<Maintenance["continueBackfill"]>, null>("financeReportMaintenance:continueBackfill");
const status = makeFunctionReference<"query", FunctionArgs<Maintenance["status"]>, FunctionReturnType<Maintenance["status"]>>("financeReportMaintenance:status");
async function fixture(count=7) {
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    const auth=await ctx.db.insert("users",{email:"summary-coach@example.invalid"});
    const coach=await ctx.db.insert("appUsers",{authUserId:auth,email:"summary-coach@example.invalid",name:"Synthetic Coach",role:"coach",active:true,travelLead:false,financialEdit:false});
    const season=await ctx.db.insert("seasons",{name:"Synthetic",year:2026,status:"active",startsAt:0,permissionVersion:"DRAFT",createdBy:coach});
    const students=[];
    for(let index=0;index<count;index++) students.push(await ctx.db.insert("students",{seasonId:season,legalName:`Synthetic ${index}`,preferredName:`Synthetic ${index}`,email:`summary-${index}@example.invalid`,subteam:"Build",active:true,travelTeam:false,roomCategoryLocked:false,allergies:{state:"unknown"},medications:{state:"unknown"}}));
    return {auth,coach,season,students};
  });
  return {t,ids,coach:t.withIdentity({subject:`${ids.auth}|session`})};
}
describe("source-authoritative finance report maintenance",()=>{
  it("refreshes from actual financial mutations and reconciles with the ledger read model",async()=>{
    const f=await fixture(1), studentId=f.ids.students[0];
    await f.coach.mutation(api.finance.createCharge,{studentId,label:"Synthetic fee",amountCents:2500,priority:0,idempotencyKey:"summary-charge"});
    await f.coach.mutation(api.finance.recordFunds,{studentId,kind:"fundraiser",amountCents:1000,reason:"Synthetic fundraising",idempotencyKey:"summary-fundraiser"});
    await f.coach.mutation(api.finance.recordFunds,{studentId,kind:"payment",amountCents:2000,reason:"Synthetic payment",idempotencyKey:"summary-payment"});
    await f.t.run(async ctx=>{
      const source=await financeFor(ctx,studentId);
      const summary=await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId",q=>q.eq("studentId",studentId)).unique();
      expect(summary).toMatchObject({...source.summary,travelShareCents:1000,transferredInCents:0,version:4,personalAppliedCents:1500,fundraisingAppliedCents:1000});
      expect(summary).toMatchObject({chargedCents:2500,paidCents:2500,dueCents:0,personalAvailableCents:500,fundraisingAvailableCents:0});
      expect(await calculateStudentFinance(ctx,studentId)).toMatchObject({...source.summary,travelShareCents:1000});
    });
  });
  it("backfills durably by cursor, ignores duplicate workers and gates team totals",async()=>{
    const f=await fixture();
    expect(await f.coach.query(api.dashboardReports.team,{})).toMatchObject({finance:null});
    const id=await f.coach.mutation(start,{});
    expect(await f.coach.mutation(start,{})).toBe(id);
    await f.t.mutation(worker,{backfillId:id,expectedCursor:null});
    expect(await f.coach.query(status,{})).toMatchObject({state:"running",processed:5});
    expect(await f.coach.query(api.dashboardReports.team,{})).toMatchObject({finance:null});
    await f.t.mutation(worker,{backfillId:id,expectedCursor:null});
    expect((await f.coach.query(status,{}))?.processed).toBe(5);
    const row=await f.t.run(ctx=>ctx.db.get(id));
    await f.t.mutation(worker,{backfillId:id,expectedCursor:row!.cursor});
    expect(await f.coach.query(status,{})).toMatchObject({state:"complete",processed:7});
    expect(await f.coach.query(api.dashboardReports.team,{})).toMatchObject({activeStudents:7,finance:{chargedCents:0,dueCents:0}});
  });
  it("fails on inconsistent source data and resumes the failed page after repair",async()=>{
    const f=await fixture(1),studentId=f.ids.students[0];
    const bad=await f.t.run(ctx=>ctx.db.insert("charges",{studentId,label:"Synthetic invalid fee",amountCents:100,appliedCents:200,priority:0,createdBy:f.ids.coach,createdAt:1}));
    const id=await f.coach.mutation(start,{});
    await f.t.mutation(worker,{backfillId:id,expectedCursor:null});
    for (let step=0; step<10; step++) {
      const account=await f.t.run(ctx=>ctx.db.query("financialAccounts").withIndex("by_studentId",q=>q.eq("studentId",studentId)).unique());
      if(account?.state!=="rebuilding")break;
      await f.t.mutation(makeFunctionReference<"mutation">("financialSources:run"),{accountId:account._id});
    }
    await f.t.mutation(worker,{backfillId:id,expectedCursor:null});
    expect(await f.coach.query(status,{})).toMatchObject({state:"failed",processed:0});
    expect(await f.coach.query(api.dashboardReports.team,{})).toMatchObject({finance:null});
    await f.t.run(ctx=>ctx.db.patch(bad,{appliedCents:0}));
    await f.coach.mutation(start,{});
    for (let step=0; step<10; step++) {
      const account=await f.t.run(ctx=>ctx.db.query("financialAccounts").withIndex("by_studentId",q=>q.eq("studentId",studentId)).unique());
      if(account?.state!=="rebuilding")break;
      await f.t.mutation(makeFunctionReference<"mutation">("financialSources:run"),{accountId:account._id});
    }
    await f.t.mutation(worker,{backfillId:id,expectedCursor:null});
    expect(await f.coach.query(status,{})).toMatchObject({state:"complete",processed:1});
    expect(await f.coach.query(api.dashboardReports.team,{})).toMatchObject({finance:{chargedCents:100,dueCents:100}});
  });
  it("denies unauthenticated maintenance and fails if coverage is missing after completion",async()=>{
    const f=await fixture(1);
    await expect(f.t.mutation(start,{})).rejects.toThrow();
    await expect(f.t.query(status,{})).rejects.toThrow();
    const id=await f.coach.mutation(start,{});
    await f.t.mutation(worker,{backfillId:id,expectedCursor:null});
    await f.t.run(async ctx=>{const summary=await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId",q=>q.eq("studentId",f.ids.students[0])).unique();await ctx.db.delete(summary!._id)});
    expect(await f.coach.query(api.dashboardReports.team,{})).toMatchObject({finance:null});
  });
  it("restarts from the beginning when completion finds missing earlier coverage",async()=>{
    const f=await fixture();
    const id=await f.coach.mutation(start,{});
    await f.t.mutation(worker,{backfillId:id,expectedCursor:null});
    await f.t.run(async ctx=>{const summary=await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId",q=>q.eq("studentId",f.ids.students[0])).unique();await ctx.db.delete(summary!._id)});
    let row=await f.t.run(ctx=>ctx.db.get(id));
    await f.t.mutation(worker,{backfillId:id,expectedCursor:row!.cursor});
    row=await f.t.run(ctx=>ctx.db.get(id));
    expect(row).toMatchObject({state:"failed",cursor:null,processed:0});
    await f.coach.mutation(start,{});
    await f.t.mutation(worker,{backfillId:id,expectedCursor:null});
    row=await f.t.run(ctx=>ctx.db.get(id));
    await f.t.mutation(worker,{backfillId:id,expectedCursor:row!.cursor});
    expect(await f.coach.query(status,{})).toMatchObject({state:"complete",processed:7});
  });
});
