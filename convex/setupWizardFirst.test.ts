/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { age18 } from "./firstRegistration";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = [];
    for (const role of ["coach", "student", "parent", "parent2"] as const) {
      const email = `${role}@example.invalid`;
      const user = await ctx.db.insert("users", { email });
      const app = await ctx.db.insert("appUsers", { authUserId:user,email,name:role,role:role==="parent2"?"parent":role,active:true,travelLead:false,financialEdit:false });
      auth.push({user,app});
    }
    const season = await ctx.db.insert("seasons", { name:"Synthetic",year:2026,status:"active",startsAt:0,permissionVersion:"DRAFT",createdBy:auth[0].app });
    await ctx.db.insert("familyLinkSeasonBackfill",{key:"team",state:"complete",phase:"verify",cursor:null,scanned:0,unresolved:0,generation:1,startedBy:auth[0].app,updatedAt:0});
    const student = await ctx.db.insert("students", { seasonId:season,userId:auth[1].app,legalName:"Synthetic Student",preferredName:"Student",email:"student@example.invalid",subteam:"",active:true,travelTeam:false,roomCategoryLocked:false,allergies:{state:"unknown"},medications:{state:"unknown"} });
    await ctx.db.insert("familyLinks", {studentId:student,seasonId:season,parentUserId:auth[2].app,active:true,createdBy:auth[0].app});
    await ctx.db.insert("familyLinks", {studentId:student,seasonId:season,parentUserId:auth[3].app,active:true,createdBy:auth[0].app});
    const events=[];
    for (const type of ["Competition","Competition","Team"] as const) {
      const event=await ctx.db.insert("events",{seasonId:season,name:type,type,startsAt:1000,endsAt:2000,destination:"Test",travel:"Bus",overnight:false,roomingEnabled:false,feeCents:0,signupMode:"assigned",allowWithdrawal:false,permissionRequired:false,firstRequired:type==="Team",archived:false});
      await ctx.db.insert("participants",{eventId:event,studentId:student,status:"confirmed",createdAt:0,updatedAt:0});
      events.push(event);
    }
    return {auth,season,student,events};
  });
  const as=(index:number)=>t.withIdentity({subject:`${ids.auth[index].user}|session`});
  return {t,ids,coach:as(0),student:as(1),parent:as(2),parent2:as(3)};
}

describe("shared setup and season FIRST registration", () => {
  it("normalizes known grades, preserves old unknown grades, and rejects new arbitrary grades", async () => {
    const f=await fixture();
    const save=(grade:string,expectedRevision:number)=>f.student.mutation(api.setupWizard.saveStudentAbout,{studentId:f.ids.student,expectedRevision,preferredName:"Synthetic",grade,dateOfBirth:"2010-10-15"});
    await expect(save("Transfer year",0)).rejects.toThrow("Choose Freshman");
    expect(await save("9th grade",0)).toBe(1);
    expect((await f.student.query(api.setupWizard.get,{studentId:f.ids.student})).student.grade).toBe("Freshman");
    await f.t.run(ctx=>ctx.db.patch(f.ids.student,{consentProfileV2: {
      grade:"Transfer year",dateOfBirth:"2010-10-15",guardian:{name:"Parent",relationship:"Parent",phone:"(202) 555-0100",email:"parent@example.invalid"},emergency:{name:"Alternate",relationship:"Aunt",phone:"(202) 555-0101"},allergies:{state:"none",entries:[]},prescriptions:{state:"none",entries:[]},insurance:{state:"unavailable",provider:null,policy:null},physician:{state:"none",name:null,phone:null}
    },consentProfileV2CompletedAt:123,consentProfileV2ConfirmedBy:f.ids.auth[2].app}));
    await expect(save("Different year",1)).rejects.toThrow("Choose Freshman");
    expect(await save("Transfer year",1)).toBe(2);
    const stored=await f.t.run(ctx=>ctx.db.get(f.ids.student));
    expect(stored?.consentProfileV2?.grade).toBe("Transfer year");
    expect(stored?.consentProfileV2CompletedAt).toBe(123);
  });
  it("uses the Chicago eighteenth birthday for access and keeps minor medical data private", async () => {
    expect(age18("2008-10-15",Date.parse("2026-10-15T04:59:00Z"))).toBe(false);
    expect(age18("2008-10-15",Date.parse("2026-10-15T05:00:00Z"))).toBe(true);
    expect(age18("2099-01-01",Date.parse("2026-10-15T12:00:00Z"))).toBe(false);
    const f=await fixture();
    const initial=await f.student.query(api.setupWizard.get,{studentId:f.ids.student});
    expect(initial).toMatchObject({studentId:f.ids.student,revision:0,contacts:null,medical:null});
    const revision=await f.student.mutation(api.setupWizard.saveStudentAbout,{studentId:f.ids.student,expectedRevision:0,preferredName:"Synthetic",grade:"11",dateOfBirth:"2010-10-15"});
    await expect(f.parent.mutation(api.setupWizard.saveParentStudent,{studentId:f.ids.student,expectedRevision:0,shirtSize:"M",roomCategory:"Boys",grade:"11",dateOfBirth:"2010-10-15"})).rejects.toThrow("Reload");
    expect(revision).toBe(1);
    const first=await f.student.mutation(api.firstRegistration.get,{studentId:f.ids.student});
    expect(first).toMatchObject({adultEligible:false,canAccessInvitation:false,canReport:false});
    await expect(f.student.mutation(api.firstRegistration.report,{studentId:f.ids.student,expectedRevision:0})).rejects.toThrow("A parent must report");
    expect((await f.student.query(api.setupWizard.get,{studentId:f.ids.student})).medical).toBeNull();
    const minorTodo=(await f.student.query(api.app.studentDashboard,{studentId:f.ids.student,asOf:Date.parse("2026-10-15T05:00:00Z")})).todos.find(item=>item.eventName==="FIRST registration and Consent & Release");
    expect(minorTodo).toMatchObject({label:"Your parent completes FIRST registration.",href:null,responsible:"parent",blocked:true});
    await f.student.mutation(api.setupWizard.saveStudentAbout,{studentId:f.ids.student,expectedRevision:1,preferredName:"Synthetic",grade:"11",dateOfBirth:"2008-10-15"});
    const adultTodo=(await f.student.query(api.app.studentDashboard,{studentId:f.ids.student,asOf:Date.parse("2026-10-15T05:00:00Z")})).todos.find(item=>item.eventName==="FIRST registration and Consent & Release");
    expect(adultTodo).toMatchObject({href:"/setup",responsible:"student",blocked:false});
  });

  it("lets an adult student read the invitation and report completion for Coach review", async () => {
    const f=await fixture();
    await f.coach.mutation(api.firstRegistration.setInvitation,{expectedRevision:0,url:"https://my.firstinspires.org/synthetic-invitation",qrStorageId:null,qrMatchesInvitation:false});
    await f.student.mutation(api.setupWizard.saveStudentAbout,{studentId:f.ids.student,expectedRevision:0,preferredName:"Synthetic",grade:"12",dateOfBirth:"2000-01-01"});
    expect(await f.student.mutation(api.firstRegistration.get,{studentId:f.ids.student})).toMatchObject({status:"needsCompletion",revision:0,reopened:false,adultEligible:true,canAccessInvitation:true,canReport:true,invitationUrl:"https://my.firstinspires.org/synthetic-invitation"});
    expect(await f.student.mutation(api.firstRegistration.report,{studentId:f.ids.student,expectedRevision:0})).toBe(1);
    expect(await f.student.mutation(api.firstRegistration.get,{studentId:f.ids.student})).toMatchObject({status:"awaitingVerification",revision:1,reopened:false,canReport:false,teamAccepted:false,consentRelease:false});
    await f.coach.mutation(api.firstRegistration.verify,{studentId:f.ids.student,expectedRevision:1,teamAccepted:true,consentRelease:true});
    expect(await f.student.mutation(api.firstRegistration.get,{studentId:f.ids.student})).toMatchObject({status:"verified",reopened:false});
    await f.coach.mutation(api.firstRegistration.reopen,{studentId:f.ids.student,expectedRevision:2,reason:"Fictional correction"});
    const reopened=await f.student.mutation(api.firstRegistration.get,{studentId:f.ids.student});
    expect(reopened).toMatchObject({status:"needsCompletion",revision:3,reopened:true,adultEligible:true,canReport:true});
    expect(reopened).not.toHaveProperty("reopenReason");
    expect(reopened).not.toHaveProperty("reopenedBy");
    expect(await f.student.mutation(api.firstRegistration.report,{studentId:f.ids.student,expectedRevision:3})).toBe(4);
    expect(await f.student.mutation(api.firstRegistration.get,{studentId:f.ids.student})).toMatchObject({status:"awaitingVerification",reopened:false});
    await f.coach.mutation(api.firstRegistration.verify,{studentId:f.ids.student,expectedRevision:4,teamAccepted:true,consentRelease:true});
    expect(await f.student.mutation(api.firstRegistration.get,{studentId:f.ids.student})).toMatchObject({status:"verified",reopened:false});
  });

  it("denies an unrelated parent the setup, medical, and FIRST paths", async () => {
    const f=await fixture();
    const user=await f.t.run(async ctx=>{
      const authUserId=await ctx.db.insert("users",{email:"unlinked-parent@example.invalid"});
      await ctx.db.insert("appUsers",{authUserId,email:"unlinked-parent@example.invalid",name:"Unlinked parent",role:"parent",active:true,travelLead:false,financialEdit:false});
      return authUserId;
    });
    const unrelated=f.t.withIdentity({subject:`${user}|session`});
    expect((await unrelated.mutation(api.setupWizard.summary,{})).students).toEqual([]);
    await expect(unrelated.query(api.setupWizard.get,{studentId:f.ids.student})).rejects.toThrow("permission for this student");
    await expect(unrelated.mutation(api.setupWizard.saveMedical,{studentId:f.ids.student,expectedRevision:0,allergies:{state:"none",entries:[]},prescriptions:{state:"none",entries:[]},insurance:{state:"unavailable",provider:null,policy:null},physician:{state:"unavailable",name:null,phone:null}})).rejects.toThrow("permission for this student");
    await expect(unrelated.mutation(api.firstRegistration.get,{studentId:f.ids.student})).rejects.toThrow("permission for this student");
    await expect(unrelated.mutation(api.firstRegistration.report,{studentId:f.ids.student,expectedRevision:0})).rejects.toThrow("permission for this student");
  });

  it("allows initial subteam choice, preserves legacy assignment, and shares parent revisions", async () => {
    const f=await fixture();
    await f.student.mutation(api.setupWizard.saveStudentTeam,{studentId:f.ids.student,expectedRevision:0,shirtSize:"M",roomCategory:"Boys",subteam:"Programming"});
    await expect(f.student.mutation(api.setupWizard.saveStudentTeam,{studentId:f.ids.student,expectedRevision:1,shirtSize:"M",roomCategory:"Boys",subteam:"Build"})).rejects.toThrow("Coach");
    await f.parent.mutation(api.setupWizard.saveParentStudent,{studentId:f.ids.student,expectedRevision:1,shirtSize:"L",roomCategory:"Boys",grade:"11",dateOfBirth:"2010-10-15",preferredName:"New name"});
    const second=await f.parent2.query(api.setupWizard.get,{studentId:f.ids.student});
    expect(second).toMatchObject({revision:2,student:{preferredName:"New name",subteam:"Programming",shirtSize:"L",roomCategoryLocked:true}});
    await expect(f.parent2.mutation(api.setupWizard.saveParentStudent,{studentId:f.ids.student,expectedRevision:1,shirtSize:"M",roomCategory:"Boys",grade:"11",dateOfBirth:"2010-10-15"})).rejects.toThrow("Reload");
    await expect(f.parent2.mutation(api.setupWizard.saveMedical,{studentId:f.ids.student,expectedRevision:2,allergies:{state:"reported",entries:[{allergen:"a".repeat(161),severity:"Mild",reaction:"Rash",response:"Call parent"}]},prescriptions:{state:"none",entries:[]},insurance:{state:"none",provider:null,policy:null},physician:{state:"unavailable",name:null,phone:null}})).rejects.toThrow("allergen");
    expect((await f.parent2.mutation(api.setupWizard.summary,{})).students[0]).toMatchObject({parentComplete:false,needsSetup:true});
  });

  it("confirms a saved Parent profile, waits for Coach after self-report, and starts a new season unverified", async () => {
    const f=await fixture();
    const studentId=f.ids.student;
    expect((await f.parent.mutation(api.setupWizard.summary,{})).students[0]).toMatchObject({nextItem:"studentDetails",needsSetup:true});
    let revision=await f.parent.mutation(api.setupWizard.saveParentStudent,{studentId,expectedRevision:0,shirtSize:"M",roomCategory:"Boys",grade:"11",dateOfBirth:"2010-10-15"});
    expect((await f.parent.mutation(api.setupWizard.summary,{})).students[0]).toMatchObject({nextItem:"contacts",needsSetup:true});
    revision=await f.parent.mutation(api.setupWizard.saveContacts,{studentId,expectedRevision:revision,guardian:{name:"Fictional Guardian",relationship:"Parent",phone:"(202) 555-0100",email:"guardian@example.invalid"},emergency:{name:"Fictional Contact",relationship:"Aunt",phone:"(202) 555-0101"}});
    expect((await f.parent.mutation(api.setupWizard.summary,{})).students[0]).toMatchObject({nextItem:"medical",needsSetup:true});
    revision=await f.parent.mutation(api.setupWizard.saveMedical,{studentId,expectedRevision:revision,allergies:{state:"none",entries:[]},prescriptions:{state:"none",entries:[]},insurance:{state:"unavailable",provider:null,policy:null},physician:{state:"unavailable",name:null,phone:null}});
    expect((await f.parent2.query(api.setupWizard.get,{studentId})).student.parentComplete).toBe(false);
    expect((await f.parent2.mutation(api.setupWizard.summary,{})).students[0]).toMatchObject({nextItem:"finishSetup",needsSetup:true});
    revision=await f.parent.mutation(api.setupWizard.finishParent,{studentId,expectedRevision:revision});
    expect((await f.parent.mutation(api.setupWizard.summary,{})).students[0]).toMatchObject({nextItem:"first",needsSetup:true});
    const secondParent=await f.parent2.query(api.setupWizard.get,{studentId});
    expect(secondParent).toMatchObject({revision,student:{parentComplete:true,contactsComplete:true,medicalComplete:true},contacts:{guardian:{name:"Fictional Guardian"}},medical:{allergies:{state:"none"}}});
    expect((await f.student.query(api.setupWizard.get,{studentId}))).toMatchObject({contacts:null,medical:null});
    const reportedRevision=await f.parent2.mutation(api.firstRegistration.report,{studentId,expectedRevision:0});
    expect(reportedRevision).toBe(1);
    expect(await f.parent.mutation(api.firstRegistration.get,{studentId})).toMatchObject({status:"awaitingVerification",canReport:false,teamAccepted:false,consentRelease:false});
    expect((await f.parent.mutation(api.setupWizard.summary,{})).students[0]).toMatchObject({nextItem:"waitingCoach",needsSetup:false});
    const pending=await f.coach.query(api.app.eventDetail,{eventId:f.ids.events[0],studentId});
    if(!pending.readiness)throw new Error("Expected a student readiness result.");
    expect(pending.readiness.open).toContain("FIRST registration and Consent & Release");
    await f.coach.mutation(api.firstRegistration.verify,{studentId,expectedRevision:reportedRevision,teamAccepted:true,consentRelease:true});
    expect((await f.parent2.mutation(api.setupWizard.summary,{})).students[0]).toMatchObject({parentComplete:true,firstState:"verified",nextItem:"done",needsSetup:false});
    const nextStudent=await f.t.run(async ctx=>{
      await ctx.db.patch(f.ids.season,{status:"archived"});
      const season=await ctx.db.insert("seasons",{name:"Next synthetic",year:2027,status:"active",startsAt:1,permissionVersion:"DRAFT",createdBy:f.ids.auth[0].app});
      const next=await ctx.db.insert("students",{seasonId:season,userId:f.ids.auth[1].app,legalName:"Synthetic Student",preferredName:"Student",email:"student@example.invalid",subteam:"Programming",active:true,travelTeam:false,roomCategoryLocked:false,allergies:{state:"unknown"},medications:{state:"unknown"}});
      await ctx.db.insert("familyLinks",{studentId:next,seasonId:season,parentUserId:f.ids.auth[2].app,active:true,createdBy:f.ids.auth[0].app});
      return next;
    });
    expect(await f.parent.mutation(api.firstRegistration.get,{studentId:nextStudent})).toMatchObject({status:"needsCompletion",revision:0});
  });

  it("requires Coach verification of both conditions across every Competition and preserves old Team marks", async () => {
    const f=await fixture();
    await f.t.run(ctx=>ctx.db.insert("requirementCompletions",{eventId:f.ids.events[0],studentId:f.ids.student,key:"first",completedAt:1,completedBy:f.ids.auth[0].app}));
    const before=await f.coach.query(api.app.eventDetail,{eventId:f.ids.events[0],studentId:f.ids.student});
    if (!before.readiness) throw new Error("Expected a student readiness result.");
    expect(before.readiness).toMatchObject({firstRegistrationState:"needsCompletion"});
    expect(before.readiness.open).toContain("FIRST registration and Consent & Release");
    expect(await f.parent.mutation(api.firstRegistration.get,{studentId:f.ids.student})).toMatchObject({status:"needsCompletion",reopened:false});
    await expect(f.coach.mutation(api.participation.recordRequirement,{eventId:f.ids.events[0],studentId:f.ids.student,key:"first",complete:true})).rejects.toThrow("student record");
    await expect(f.parent.mutation(api.firstRegistration.verify,{studentId:f.ids.student,expectedRevision:0,teamAccepted:true,consentRelease:true})).rejects.toThrow("Only a Coach");
    expect(await f.coach.mutation(api.firstRegistration.verify,{studentId:f.ids.student,expectedRevision:0,teamAccepted:true,consentRelease:true})).toBe(1);
    for (const eventId of f.ids.events.slice(0,2)) {
      const detail=await f.coach.query(api.app.eventDetail,{eventId,studentId:f.ids.student});
      if (!detail.readiness) throw new Error("Expected a student readiness result.");
      expect(detail.readiness.firstRegistrationState).toBe("verified");
      expect(detail.readiness.open).not.toContain("FIRST registration and Consent & Release");
    }
    const team=await f.coach.query(api.app.eventDetail,{eventId:f.ids.events[2],studentId:f.ids.student});
    if (!team.readiness) throw new Error("Expected a student readiness result.");
    expect(team.readiness.open).toContain("FIRST registration");
    await f.coach.mutation(api.firstRegistration.reopen,{studentId:f.ids.student,expectedRevision:1,reason:"FIRST evidence corrected"});
    expect(await f.parent.mutation(api.firstRegistration.get,{studentId:f.ids.student})).toMatchObject({status:"needsCompletion",reopened:true,canReport:true});
    const reopened=await f.coach.query(api.app.eventDetail,{eventId:f.ids.events[1],studentId:f.ids.student});
    if (!reopened.readiness) throw new Error("Expected a student readiness result.");
    expect(reopened.readiness.open).toContain("FIRST registration and Consent & Release");
  });
});
