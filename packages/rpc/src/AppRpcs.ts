import { ChatRpcs } from "./ChatRpcs";
import { HealthRpcs } from "./HealthRpcs";
import { JobRpcs } from "./JobRpcs";
import { MediaRpcs } from "./MediaRpcs";

export class AppRpcs extends ChatRpcs.merge(JobRpcs, MediaRpcs, HealthRpcs) {}
