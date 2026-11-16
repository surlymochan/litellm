import { z } from "zod";
import i18n from "@/i18n/i18n";
import type en from "@/i18n/locales/en.json";
import {
  isValidEmail,
  isValidSemanticVersion,
  isValidSha256,
  parseKeywords,
  parseSkillSource,
  validatePluginName,
} from "./helpers";
import type {
  SkillHubSkill,
  SkillImport,
  SkillMetadata,
  SkillRegisterRequest,
  SkillUpdate,
  SkillUploadMetadata,
} from "./types";

type FormMessages = (typeof en)["skills"]["addForm"];
type FormErrorKey = `errors.${keyof FormMessages["errors"]}` | `toasts.${keyof FormMessages["toasts"]}`;

export interface SkillFormValues {
  mode: "upload" | "import" | "register" | "metadata" | "replace";
  archiveFile: File | null;
  url: string;
  skill: string;
  ref: string;
  path: string;
  name: string;
  domain: string;
  namespace: string;
  description: string;
  keywords: string;
  version: string;
  authorName: string;
  authorEmail: string;
  category: string;
  homepage: string;
  sha256: string;
  installationPreference: string;
}

export const INSTALLATION_PREFERENCES = ["available", "auto_install", "required"] as const;

const EMPTY_SKILL_FORM: SkillFormValues = {
  mode: "upload",
  archiveFile: null,
  url: "",
  skill: "",
  ref: "",
  path: "",
  name: "",
  domain: "",
  namespace: "",
  description: "",
  keywords: "",
  version: "",
  authorName: "",
  authorEmail: "",
  category: "",
  homepage: "",
  sha256: "",
  installationPreference: "",
};

export const skillFormValues = (skill?: SkillHubSkill): SkillFormValues => {
  if (!skill) return { ...EMPTY_SKILL_FORM };
  return {
    ...EMPTY_SKILL_FORM,
    mode: "metadata",
    name: skill.name,
    domain: skill.domain ?? "",
    namespace: skill.namespace ?? "",
    description: skill.description ?? "",
    keywords: skill.keywords?.join(", ") ?? "",
    authorName: skill.author?.name ?? "",
    authorEmail: skill.author?.email ?? "",
    category: skill.category ?? "",
    homepage: skill.homepage ?? "",
    installationPreference: skill.installation_preference ?? "",
  };
};

const installationPreference = (value: string): SkillUploadMetadata["installation_preference"] =>
  INSTALLATION_PREFERENCES.find((option) => option === value) ?? null;

export const buildSkillMetadata = (values: SkillFormValues, skill: SkillHubSkill): SkillMetadata => {
  const initial = skillFormValues(skill);
  return {
    description: values.description.trim() || null,
    domain: values.domain.trim() || null,
    namespace: values.namespace.trim() || null,
    keywords: values.keywords === initial.keywords ? skill.keywords ?? null : parseKeywords(values.keywords),
    version: values.version.trim() || null,
    expected_updated_at: skill.updated_at,
    ...(values.authorName !== initial.authorName || values.authorEmail !== initial.authorEmail
      ? {
          author: values.authorName.trim()
            ? { name: values.authorName.trim(), email: values.authorEmail.trim() || null }
            : null,
        }
      : {}),
    ...(values.category !== initial.category ? { category: values.category.trim() || null } : {}),
    ...(values.homepage !== initial.homepage ? { homepage: values.homepage.trim() || null } : {}),
    ...(values.installationPreference !== initial.installationPreference
      ? { installation_preference: installationPreference(values.installationPreference) }
      : {}),
  };
};

export const buildSkillUploadMetadata = (values: SkillFormValues): SkillUploadMetadata | undefined => {
  if (!values.name.trim()) return undefined;
  return {
    name: values.name.trim(),
    ...(values.version.trim() ? { version: values.version.trim() } : {}),
    ...(values.description.trim() ? { description: values.description.trim() } : {}),
    ...(values.domain.trim() ? { domain: values.domain.trim() } : {}),
    ...(values.namespace.trim() ? { namespace: values.namespace.trim() } : {}),
    ...(values.keywords.trim() ? { keywords: parseKeywords(values.keywords) } : {}),
    ...(values.authorName.trim()
      ? {
          author: {
            name: values.authorName.trim(),
            ...(values.authorEmail.trim() ? { email: values.authorEmail.trim() } : {}),
          },
        }
      : {}),
    ...(values.category.trim() ? { category: values.category.trim() } : {}),
    ...(values.homepage.trim() ? { homepage: values.homepage.trim() } : {}),
    ...(values.installationPreference
      ? { installation_preference: installationPreference(values.installationPreference) }
      : {}),
  };
};

export const buildSkillImport = (values: SkillFormValues): SkillImport => {
  const metadata = buildSkillUploadMetadata(values);
  return {
    url: values.url,
    ...(values.skill.trim() ? { skill: values.skill.trim() } : {}),
    ...(values.ref.trim() ? { ref: values.ref.trim() } : {}),
    ...(values.path.trim() ? { path: values.path.trim() } : {}),
    ...(values.version.trim() ? { version: values.version.trim() } : {}),
    ...(metadata ? { metadata } : {}),
  };
};

export const buildSkillReference = (values: SkillFormValues): SkillRegisterRequest["source"] | null => {
  const preview = parseSkillSource(values.url, values.path);
  if (!preview) return null;
  return {
    ...preview.parsed,
    ...(preview.parsed.source === "archive" && values.sha256.trim() ? { sha256: values.sha256.trim() } : {}),
  };
};

export const buildSkillRegistration = (values: SkillFormValues): SkillRegisterRequest | null => {
  const source = buildSkillReference(values);
  const metadata = buildSkillUploadMetadata(values);
  return source && metadata ? { ...metadata, source } : null;
};

export const buildSkillUpdate = (values: SkillFormValues, skill: SkillHubSkill): SkillUpdate => ({
  ...buildSkillMetadata(values, skill),
  ...(values.mode === "replace" ? { source: buildSkillReference(values) } : {}),
});

const CREATION_METADATA_FIELDS = [
  "description",
  "domain",
  "namespace",
  "keywords",
  "authorName",
  "authorEmail",
  "category",
  "homepage",
  "installationPreference",
] as const;

type SkillFormIssue = (path: keyof SkillFormValues, key: FormErrorKey) => void;

function validateSkillSource(values: SkillFormValues, issue: SkillFormIssue) {
  if (values.mode === "upload") {
    if (!values.archiveFile?.name.toLowerCase().endsWith(".zip")) issue("archiveFile", "errors.zipRequired");
    if (values.archiveFile && values.archiveFile.size > 10 * 1024 * 1024) issue("archiveFile", "errors.zipTooLarge");
  }
  if (values.mode === "import" && !values.url.trim()) issue("url", "errors.urlRequired");
  if (values.mode !== "register" && values.mode !== "replace") return;
  const source = buildSkillReference(values);
  if (!source) {
    issue("url", "toasts.invalidUrl");
    return;
  }
  if (source.source === "archive" && !isValidSha256(values.sha256)) issue("sha256", "errors.sha256Invalid");
}

function validateRegistryName(values: SkillFormValues, issue: SkillFormIssue) {
  const needsName = values.mode === "register" || CREATION_METADATA_FIELDS.some((field) => values[field].trim());
  if (needsName && !values.name.trim()) issue("name", "errors.metadataNameRequired");
  if (values.name.trim() && !validatePluginName(values.name.trim())) issue("name", "errors.nameInvalid");
}

function validateSkillMetadata(values: SkillFormValues, skill: SkillHubSkill | undefined, issue: SkillFormIssue) {
  const initial = skillFormValues(skill);
  if (values.authorName === initial.authorName && values.authorEmail === initial.authorEmail) return;
  if (values.authorEmail.trim() && !values.authorName.trim()) issue("authorName", "errors.authorNameRequired");
  if (!isValidEmail(values.authorEmail.trim())) issue("authorEmail", "errors.emailInvalid");
}

function validateInstallationPreference(
  values: SkillFormValues,
  skill: SkillHubSkill | undefined,
  hasArchive: boolean,
  issue: SkillFormIssue,
) {
  if (!values.installationPreference) return;
  const preferenceChanged = values.installationPreference !== (skill?.installation_preference ?? "");
  if (preferenceChanged && !installationPreference(values.installationPreference)) {
    issue("installationPreference", "errors.preferenceInvalid");
  }
  const referenceMode = values.mode === "register" || values.mode === "replace";
  if (!referenceMode && (!skill || !preferenceChanged)) return;
  const source = referenceMode ? buildSkillReference(values) : skill?.source;
  if (source?.source !== "archive") {
    issue("installationPreference", "errors.preferenceArchive");
    return;
  }
  const managedArchiveSource = !referenceMode && (hasArchive || Boolean(skill?.content_url));
  const requiresDigest = ["auto_install", "required"].includes(values.installationPreference);
  if (requiresDigest && !source.sha256 && !managedArchiveSource)
    issue("installationPreference", "errors.preferenceDigest");
}

const skillFormShape = {
  mode: z.enum(["upload", "import", "register", "metadata", "replace"]),
  archiveFile: z.file().nullable(),
  url: z.string(),
  skill: z.string(),
  ref: z.string(),
  path: z.string(),
  name: z.string(),
  domain: z.string(),
  namespace: z.string(),
  description: z.string(),
  keywords: z.string(),
  version: z.string(),
  authorName: z.string(),
  authorEmail: z.string(),
  category: z.string(),
  homepage: z.string(),
  sha256: z.string(),
  installationPreference: z.string(),
};

export const skillFormSchema = (skill?: SkillHubSkill, hasArchive = false) =>
  z.object(skillFormShape).superRefine((values, context) => {
    const issue: SkillFormIssue = (path, key) =>
      context.addIssue({ code: "custom", path: [path], message: i18n.t(`skills.addForm.${key}`) });
    validateSkillSource(values, issue);
    if (values.version.trim() && !isValidSemanticVersion(values.version.trim()))
      issue("version", "toasts.invalidVersion");
    if (skill && values.mode === "upload") return;
    if (!skill) validateRegistryName(values, issue);
    validateSkillMetadata(values, skill, issue);
    validateInstallationPreference(values, skill, hasArchive, issue);
  });
