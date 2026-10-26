import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { activeSeason, audit, studentAccess, viewer } from "./lib/access";

type Ctx = QueryCtx | MutationCtx;
const stateValue = v.union(v.literal("needsCompletion"), v.literal("awaitingVerification"), v.literal("verified"));
export async function firstState(ctx: Ctx, studentId: Id<"students">) {
  return await ctx.db.query("firstRegistrationStates").withIndex("by_studentId", q => q.eq("studentId", studentId)).unique();
}
export async function firstStatus(ctx: Ctx, studentId: Id<"students">) { return (await firstState(ctx, studentId))?.status ?? "needsCompletion" as const; }
export function age18(birth: string | undefined, now: number) {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return false;
  const born = Date.parse(`${birth}T00:00:00Z`);
  if (!Number.isFinite(born) || new Date(born).toISOString().slice(0,10) !== birth || born >= now) return false;
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(now));
  const part = (kind:string) => parts.find(value=>value.type===kind)?.value ?? "";
  const year = Number(part("year")) - Number(birth.slice(0,4));
  return year > 18 || year === 18 && `${part("month")}-${part("day")}` >= birth.slice(5);
}
async function eligible(ctx: Ctx, actor: Doc<"appUsers">, student: Doc<"students">, now: number) {
  if (actor.role === "parent") return {adultEligible: false, allowed: true};
  if (actor.role !== "student" || student.userId !== actor._id) return {adultEligible: false, allowed: false};
  const draft = await ctx.db.query("setupDrafts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
  const adultEligible = age18(draft?.dateOfBirth ?? student.consentProfileV2?.dateOfBirth, now);
  return {adultEligible, allowed: adultEligible};
}
const getResult = v.object({status: stateValue, revision:v.number(), reopened:v.boolean(), reportedAt:v.union(v.number(),v.null()), verifiedAt:v.union(v.number(),v.null()), teamAccepted:v.boolean(), consentRelease:v.boolean(), adultEligible:v.boolean(), canAccessInvitation:v.boolean(), canReport:v.boolean(), invitationUrl:v.union(v.string(),v.null()), qrUrl:v.union(v.string(),v.null())});
/** Mutation so age at the eighteenth birthday uses trusted server time. */
export const get = mutation({args:{studentId:v.id("students")},returns:getResult,handler:async(ctx,args)=>{
  const actor=await viewer(ctx),student=await studentAccess(ctx,actor,args.studentId);
  if (actor.role!=="coach"&&actor.role!=="parent"&&actor.role!=="student") throw new ConvexError("Only the student, a parent or a Coach can see FIRST registration.");
  const state=await firstState(ctx,student._id), invitation=await ctx.db.query("firstInvitationSettings").withIndex("by_seasonId",q=>q.eq("seasonId",student.seasonId)).unique();
  const access=await eligible(ctx,actor,student,Date.now());
  const canAccessInvitation=actor.role==="coach"||access.allowed;
  return {status:state?.status??"needsCompletion",revision:state?.revision??0,reopened:state?.status==="needsCompletion"&&state.reopenedAt!==undefined,reportedAt:state?.reportedAt??null,verifiedAt:state?.verifiedAt??null,teamAccepted:state?.teamAccepted??false,consentRelease:state?.consentRelease??false,adultEligible:access.adultEligible,canAccessInvitation,canReport:access.allowed&&state?.status!=="verified"&&state?.status!=="awaitingVerification",invitationUrl:canAccessInvitation?invitation?.url??null:null,qrUrl:canAccessInvitation&&invitation?.qrStorageId?await ctx.storage.getUrl(invitation.qrStorageId):null};
}});
export const report=mutation({args:{studentId:v.id("students"),expectedRevision:v.number()},returns:v.number(),handler:async(ctx,args)=>{
  const actor=await viewer(ctx),student=await studentAccess(ctx,actor,args.studentId),access=await eligible(ctx,actor,student,Date.now());
  if(!access.allowed)throw new ConvexError("A parent must report FIRST registration as done (or the student, once 18).");
  const state=await firstState(ctx,student._id);if((state?.revision??0)!==args.expectedRevision)throw new ConvexError("FIRST registration changed since you opened it. Reload to see the latest, then try again.");
  if(state?.status==="verified"||state?.status==="awaitingVerification")throw new ConvexError("FIRST registration was already reported. Reload to see its status.");
  const revision=args.expectedRevision+1,now=Date.now();
  if(state)await ctx.db.patch(state._id,{status:"awaitingVerification",revision,reportedBy:actor._id,reportedAt:now,teamAccepted:false,consentRelease:false});
  else await ctx.db.insert("firstRegistrationStates",{studentId:student._id,seasonId:student.seasonId,status:"awaitingVerification",revision,reportedBy:actor._id,reportedAt:now,teamAccepted:false,consentRelease:false});
  await audit(ctx,actor,"students",student._id,"reportFirstCompletion",null,{revision});return revision;
}});
export const verify=mutation({args:{studentId:v.id("students"),expectedRevision:v.number(),teamAccepted:v.literal(true),consentRelease:v.literal(true)},returns:v.number(),handler:async(ctx,args)=>{
  const actor=await viewer(ctx);if(actor.role!=="coach")throw new ConvexError("Only a Coach can verify FIRST registration and Consent & Release.");
  const student=await studentAccess(ctx,actor,args.studentId),state=await firstState(ctx,student._id);
  if((state?.revision??0)!==args.expectedRevision)throw new ConvexError("FIRST registration changed since you opened it. Reload to see the latest, then try again.");
  if(state?.status==="verified")throw new ConvexError("FIRST registration is already verified. Reload to see its status.");
  const revision=args.expectedRevision+1,now=Date.now();
  if(state)await ctx.db.patch(state._id,{status:"verified",revision,teamAccepted:true,consentRelease:true,verifiedBy:actor._id,verifiedAt:now});
  else await ctx.db.insert("firstRegistrationStates",{studentId:student._id,seasonId:student.seasonId,status:"verified",revision,teamAccepted:true,consentRelease:true,verifiedBy:actor._id,verifiedAt:now});
  await audit(ctx,actor,"students",student._id,"verifyFirstRegistration",{status:state?.status??"needsCompletion"},{status:"verified",revision,teamAccepted:true,consentRelease:true});return revision;
}});
export const reopen=mutation({args:{studentId:v.id("students"),expectedRevision:v.number(),reason:v.string()},returns:v.number(),handler:async(ctx,args)=>{
  const actor=await viewer(ctx);if(actor.role!=="coach")throw new ConvexError("Only a Coach can reopen FIRST verification.");
  const student=await studentAccess(ctx,actor,args.studentId),state=await firstState(ctx,student._id),reason=args.reason.trim();
  if(!state||state.revision!==args.expectedRevision)throw new ConvexError("FIRST registration changed since you opened it. Reload to see the latest, then try again.");
  if(state.status!=="verified"||!reason||reason.length>1000)throw new ConvexError("Only a verified FIRST registration can be reopened. Enter a reason (up to 1,000 characters).");
  const revision=state.revision+1;await ctx.db.patch(state._id,{status:"needsCompletion",revision,teamAccepted:false,consentRelease:false,verifiedBy:undefined,verifiedAt:undefined,reopenedBy:actor._id,reopenedAt:Date.now(),reopenReason:reason});
  await audit(ctx,actor,"students",student._id,"reopenFirstVerification",{status:"verified"},{status:"needsCompletion",revision},reason);return revision;
}});
const settingsResult=v.object({url:v.union(v.string(),v.null()),qrUrl:v.union(v.string(),v.null()),qrStorageId:v.union(v.id("_storage"),v.null()),revision:v.number()});
export const invitationSettings=query({args:{},returns:settingsResult,handler:async ctx=>{
  const actor=await viewer(ctx);if(actor.role!=="coach")throw new ConvexError("Only a Coach can manage the FIRST team invitation link.");
  const season=await activeSeason(ctx),row=await ctx.db.query("firstInvitationSettings").withIndex("by_seasonId",q=>q.eq("seasonId",season._id)).unique();
  return {url:row?.url??null,qrUrl:row?.qrStorageId?await ctx.storage.getUrl(row.qrStorageId):null,qrStorageId:row?.qrStorageId??null,revision:row?.revision??0};
}});
export const createQrUploadUrl=mutation({args:{},returns:v.string(),handler:async ctx=>{const actor=await viewer(ctx);if(actor.role!=="coach")throw new ConvexError("Only a Coach can upload the FIRST QR image.");return await ctx.storage.generateUploadUrl();}});
export const setInvitation=mutation({args:{expectedRevision:v.number(),url:v.string(),qrStorageId:v.union(v.id("_storage"),v.null()),qrMatchesInvitation:v.boolean()},returns:v.number(),handler:async(ctx,args)=>{
  const actor=await viewer(ctx);if(actor.role!=="coach")throw new ConvexError("Only a Coach can manage the FIRST team invitation link.");
  const season=await activeSeason(ctx),existing=await ctx.db.query("firstInvitationSettings").withIndex("by_seasonId",q=>q.eq("seasonId",season._id)).unique();
  if((existing?.revision??0)!==args.expectedRevision)throw new ConvexError("The FIRST team invitation link changed since you opened it. Reload to see the latest, then try again.");
  const url=args.url.trim();let parsed:URL;try{parsed=new URL(url)}catch{throw new ConvexError("Enter the full FIRST team invitation link, starting with https://.");}
  if(parsed.protocol!=="https:"||!parsed.hostname||url.length>2000||parsed.username||parsed.password)throw new ConvexError("Enter the full FIRST team invitation link, starting with https://.");
  if(args.qrStorageId){if(!args.qrMatchesInvitation)throw new ConvexError("Confirm that the QR image opens this invitation link.");const image=await ctx.db.system.get(args.qrStorageId);if(!image||!image.contentType?.startsWith("image/")||image.size>2_000_000)throw new ConvexError("Upload a QR image file under 2 MB.");if(existing&&existing.url!==url&&existing.qrStorageId===args.qrStorageId)throw new ConvexError("You changed the invitation link. Upload a new QR image that opens it.");}
  const revision=args.expectedRevision+1,now=Date.now(),fields={url,qrStorageId:args.qrStorageId??undefined,revision,updatedBy:actor._id,updatedAt:now};
  if(existing)await ctx.db.patch(existing._id,fields);else await ctx.db.insert("firstInvitationSettings",{seasonId:season._id,...fields});
  await audit(ctx,actor,"seasons",season._id,"setFirstInvitation",{revision:args.expectedRevision},{revision,hasQr:!!args.qrStorageId});return revision;
}});
