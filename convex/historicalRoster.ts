import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { audit, requireRole, viewer } from "./lib/access";
import { requireHistoricalCorrection } from "./historicalCorrections";

const nullableText=v.union(v.string(),v.null());
function fingerprint(student:Doc<"students">){return JSON.stringify([student._id,student.seasonId,student.profileRevision??0,student.legalName,student.preferredName,student.firstName??null,student.lastName??null,student.structuredNameReviewed??false,student.subteam]);}
function fields(student:Doc<"students">){return {legalName:student.legalName,preferredName:student.preferredName,firstName:student.firstName??null,lastName:student.lastName??null,structuredNameReviewed:student.structuredNameReviewed??false,subteam:student.subteam,revision:student.profileRevision??0};}
export const preview=query({
 args:{seasonId:v.id("seasons"),studentId:v.id("students")},
 returns:v.object({studentId:v.id("students"),legalName:v.string(),preferredName:v.string(),firstName:nullableText,lastName:nullableText,structuredNameReviewed:v.boolean(),subteam:v.string(),revision:v.number(),fingerprint:v.string()}),
 handler:async(ctx,args)=>{requireRole(await viewer(ctx),"coach");const season=await ctx.db.get(args.seasonId);const student=await ctx.db.get(args.studentId);if(season?.status!=="archived"||!student||student.seasonId!==season._id)throw new Error("Choose a student in the archived season.");return {studentId:student._id,...fields(student),fingerprint:fingerprint(student)};},
});
export const correct=mutation({
 args:{correctionSessionId:v.id("historicalCorrectionSessions"),studentId:v.id("students"),expectedFingerprint:v.string(),expectedRevision:v.number(),legalName:v.optional(v.string()),preferredName:v.optional(v.string()),firstName:v.optional(v.string()),lastName:v.optional(v.string()),subteam:v.optional(v.string()),reason:v.string()},
 returns:v.number(),
 handler:async(ctx,args)=>{
  const {actor,grant}=await requireHistoricalCorrection(ctx,args.correctionSessionId);const student=await ctx.db.get(args.studentId);if(!student||student.seasonId!==grant.seasonId)throw new Error("Student is unavailable in this correction season.");
  if(!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision!== (student.profileRevision??0)||args.expectedFingerprint!==fingerprint(student))throw new Error("Historical profile changed. Review the latest record before saving.");
  const reason=args.reason.trim();if(reason.length<8||reason.length>1000)throw new Error("Provide a correction reason of 8 to 1000 characters.");
  const normalize=(value:string,limit:number,label:string)=>{const text=value.trim();if(!text||text.length>limit||Array.from(text).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))throw new Error(`${label} must contain 1 to ${limit} readable characters.`);return text;};
  const changes:Partial<Pick<Doc<"students">,"legalName"|"preferredName"|"firstName"|"lastName"|"structuredNameReviewed"|"subteam">>={};
  if(args.legalName!==undefined)changes.legalName=normalize(args.legalName,160,"Legal name");
  if(args.preferredName!==undefined)changes.preferredName=normalize(args.preferredName,80,"Preferred name");
  if(args.firstName!==undefined||args.lastName!==undefined){if(args.firstName===undefined||args.lastName===undefined)throw new Error("Review both structured names together.");changes.firstName=normalize(args.firstName,100,"First name");changes.lastName=normalize(args.lastName,100,"Last name");changes.structuredNameReviewed=true;}
  if(args.subteam!==undefined){const subteam=args.subteam.trim();if(subteam.length>100||Array.from(subteam).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))throw new Error("Subteam must be under 100 readable characters.");changes.subteam=subteam;}
  const changed=Object.entries(changes).some(([key,value])=>student[key as keyof typeof changes]!==value);if(!changed)throw new Error("Change a historical name or subteam before saving.");
  const revision=(student.profileRevision??0)+1;await ctx.db.patch(student._id,{...changes,profileRevision:revision});
  await audit(ctx,actor,"students",student._id,"historicalRosterCorrected",fields(student),{...fields(student),...changes,revision,seasonId:grant.seasonId,correctionSessionId:grant._id},reason);
  return revision;
 },
});
