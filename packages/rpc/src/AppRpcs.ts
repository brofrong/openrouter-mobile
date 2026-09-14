import { AiConfigRpcs } from "./AiConfigRpcs";
import { ChatRpcs } from "./ChatRpcs";
import { HealthRpcs } from "./HealthRpcs";
import { JobRpcs } from "./JobRpcs";
import { MediaRpcs } from "./MediaRpcs";
import { UsageRpcs } from "./UsageRpcs";

export class AppRpcs extends ChatRpcs.merge(
  JobRpcs,
  MediaRpcs,
  UsageRpcs,
  AiConfigRpcs,
  HealthRpcs,
) {}
