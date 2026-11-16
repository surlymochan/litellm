import { describe, expect, it } from "vitest";
import {
  buildSkillImport,
  buildSkillMetadata,
  buildSkillRegistration,
  buildSkillUpdate,
  buildSkillUploadMetadata,
  skillFormSchema,
  skillFormValues,
} from "./skillForm";
import type { SkillHubSkill } from "./types";

const skill: SkillHubSkill = {
  id: "skill-1",
  name: "shared-skill",
  version: "2.7.4",
  description: "Published instructions",
  source: { source: "github", repo: "example/skills", ref: "release", sha: "pinned-commit" },
  keywords: ["workflow", "tools"],
  domain: "Engineering",
  namespace: "workflows",
  visibility: "public",
  security_scan_passed: false,
  updated_at: "2026-10-20T00:00:00Z",
};

describe("skill form payloads", () => {
  it.each([["sales, finance", "review"], ["  workflow  ", "review", "review"], [], null])(
    "preserves unchanged keywords in a complete metadata replacement: %j",
    (keywords) => {
      const published = { ...skill, keywords };
      const values = skillFormValues(published);
      expect(values.version).toBe("");
      const expected = {
        description: "Updated instructions",
        keywords,
        domain: skill.domain,
        namespace: skill.namespace,
        version: null,
        expected_updated_at: skill.updated_at,
      };
      expect(buildSkillMetadata({ ...values, description: "Updated instructions" }, published)).toEqual(expected);
    },
  );

  it("parses intentional edits and clears blank metadata without changing the source", () => {
    const values = {
      ...skillFormValues(skill),
      domain: "",
      namespace: "",
      description: "",
      keywords: "security, review",
      version: "3.0.0",
    };
    const expected = {
      description: null,
      domain: null,
      namespace: null,
      keywords: ["security", "review"],
      version: "3.0.0",
      expected_updated_at: skill.updated_at,
    };
    expect(buildSkillMetadata(values, skill)).toEqual(expected);
    expect(buildSkillMetadata({ ...values, keywords: "" }, skill).keywords).toEqual([]);
  });

  it("leaves source URL parsing to the API", () => {
    const values = { ...skillFormValues(), url: "https://github.com/example/skills/tree/release/v2/review" };
    expect(buildSkillImport(values)).toEqual({ url: values.url });
  });

  it("omits upload metadata unless a registry name was chosen", () => {
    expect(buildSkillUploadMetadata(skillFormValues())).toBeUndefined();
    const values = { ...skillFormValues(), name: "registry-alias", version: "2.0.0" };
    expect(buildSkillUploadMetadata(values)).toEqual({ name: "registry-alias", version: "2.0.0" });
  });

  it("carries full registry metadata into uploads and portable imports independently of the skill selector", () => {
    const values = {
      ...skillFormValues(),
      name: "registry-alias",
      description: "Registry description",
      domain: "Engineering",
      namespace: "tools",
      keywords: "review, quality",
      authorName: "Maintainer",
      authorEmail: "maintainer@example.test",
      category: "Productivity",
      homepage: "https://example.test/skill",
      installationPreference: "required",
      version: "3.1.0",
      url: "https://skills.sh/example/skills/original-name",
      skill: "original-name",
      ref: "release/v3",
      path: "skills/original-name",
    };
    const metadata = {
      name: "registry-alias",
      description: "Registry description",
      domain: "Engineering",
      namespace: "tools",
      keywords: ["review", "quality"],
      author: { name: "Maintainer", email: "maintainer@example.test" },
      category: "Productivity",
      homepage: "https://example.test/skill",
      installation_preference: "required",
      version: "3.1.0",
    };
    const expectedImport = {
      url: values.url,
      skill: values.skill,
      ref: values.ref,
      path: values.path,
      version: values.version,
      metadata,
    };
    expect(buildSkillUploadMetadata(values)).toEqual(metadata);
    expect(buildSkillImport(values)).toEqual(expectedImport);
  });

  it.each([
    ["github.com/example/skill", "", { source: "github", repo: "example/skill" }],
    ["git@git.example.test:team/skill.git", "", { source: "url", url: "git@git.example.test:team/skill.git" }],
    [
      "https://git.example.test/team/skills.git",
      "skills/review",
      {
        source: "git-subdir",
        url: "https://git.example.test/team/skills.git",
        path: "skills/review",
      },
    ],
    [
      "https://artifacts.example.test/skill.zip",
      "",
      { source: "archive", url: "https://artifacts.example.test/skill.zip" },
    ],
  ])("registers %s as a reference without portable import options", (url, path, source) => {
    const values = {
      ...skillFormValues(),
      name: "review",
      url,
      path,
      ref: "unused-import-ref",
      skill: "unused-selector",
    };
    expect(buildSkillRegistration(values)).toEqual({ name: "review", source });
  });

  it("preserves the supplied archive digest and installation preference", () => {
    const sha256 = "aBcD".repeat(16);
    const values = {
      ...skillFormValues(),
      name: "review",
      url: "https://artifacts.example.test/skill.zip",
      sha256,
      installationPreference: "auto_install",
    };
    expect(buildSkillRegistration(values)).toEqual({
      name: "review",
      source: { source: "archive", url: "https://artifacts.example.test/skill.zip", sha256 },
      installation_preference: "auto_install",
    });
  });

  it("omits unchanged restored metadata and sends explicit nulls when cleared", () => {
    const published: SkillHubSkill = {
      ...skill,
      author: { name: "Maintainer", email: "maintainer@example.test" },
      category: "Quality",
      homepage: "https://example.test/skill",
      installation_preference: "available",
    };
    const initial = skillFormValues(published);
    const unchanged = buildSkillMetadata(initial, published);
    for (const field of ["author", "category", "homepage", "installation_preference"]) {
      expect(unchanged).not.toHaveProperty(field);
    }
    const clearedValues = {
      ...initial,
      authorName: "",
      authorEmail: "",
      category: "",
      homepage: "",
      installationPreference: "",
    };
    const clearedMetadata = { author: null, category: null, homepage: null, installation_preference: null };
    expect(buildSkillMetadata(clearedValues, published)).toMatchObject(clearedMetadata);
    expect(buildSkillMetadata({ ...initial, authorEmail: "" }, published).author).toEqual({
      name: "Maintainer",
      email: null,
    });
  });

  it("preserves an unknown legacy preference on an unrelated edit", () => {
    const published = { ...skill, installation_preference: "legacy-value" } as SkillHubSkill;
    const values = { ...skillFormValues(published), description: "Updated" };
    expect(skillFormSchema(published).safeParse(values).success).toBe(true);
    expect(buildSkillMetadata(values, published)).not.toHaveProperty("installation_preference");
  });

  it("only includes source when replacing a published source and never for pending metadata", () => {
    const managed: SkillHubSkill = {
      ...skill,
      source: { source: "archive", url: "/skill-hub/skills/shared-skill/archive", sha256: "a".repeat(64) },
    };
    const initial = skillFormValues(managed);
    expect(initial.url).toBe("");
    expect(buildSkillUpdate(initial, managed)).not.toHaveProperty("source");
    const replacement = { ...initial, mode: "replace" as const, url: "https://git.example.test/team/new.git" };
    expect(buildSkillUpdate(replacement, managed).source).toEqual({
      source: "url",
      url: "https://git.example.test/team/new.git",
    });
    expect(buildSkillMetadata(replacement, managed)).not.toHaveProperty("source");
    expect(buildSkillUpdate({ ...replacement, mode: "metadata" }, managed)).not.toHaveProperty("source");
  });
});

describe("skill form validation", () => {
  const archiveFile = new File(["legacy SKILL.md without frontmatter"], "legacy.zip");

  it.each(["unchanged", "edited"])("preserves a long %s registry description when editing metadata", (state) => {
    const description = "Registry description.".repeat(80);
    const published = { ...skill, description: state === "unchanged" ? description : skill.description };
    const values = { ...skillFormValues(published), description };
    const validated = skillFormSchema(published).parse(values);
    expect(buildSkillMetadata(validated, published).description).toBe(description);
    expect(buildSkillUpdate(validated, published).description).toBe(description);
  });

  it.each(["upload", "import", "register"] as const)("preserves a long registry description during %s", (mode) => {
    const description = "Registry description.".repeat(80);
    const values = {
      ...skillFormValues(),
      mode,
      archiveFile,
      url: "https://github.com/example/skills",
      name: "registry-alias",
      description,
    };
    const validated = skillFormSchema().parse(values);
    expect(buildSkillUploadMetadata(validated)?.description).toBe(description);
  });

  it.each([
    ["description", "Custom description"],
    ["domain", "Engineering"],
    ["namespace", "tools"],
    ["keywords", "review"],
    ["authorName", "Maintainer"],
    ["authorEmail", "maintainer@example.test"],
    ["category", "Review"],
    ["homepage", "https://example.test/skill"],
    ["installationPreference", "available"],
  ])("requires a registry name when the %s override is entered", (field, value) => {
    for (const mode of ["upload", "import"] as const) {
      const values = {
        ...skillFormValues(),
        mode,
        archiveFile,
        url: "https://github.com/example/skills",
        [field]: value,
      };
      const result = skillFormSchema().safeParse(values);
      expect(result.error?.issues).toContainEqual(expect.objectContaining({ path: ["name"] }));
    }
  });

  it.each(["upload", "import"] as const)(
    "requires a name for custom %s metadata but leaves the default flow intact",
    (mode) => {
      const values = { ...skillFormValues(), mode, archiveFile, url: "https://github.com/example/skills" };
      expect(skillFormSchema().safeParse(values).success).toBe(true);
      expect(skillFormSchema().safeParse({ ...values, description: "Custom metadata" }).success).toBe(false);
      expect(
        skillFormSchema().safeParse({ ...values, description: "Custom metadata", name: "registry-alias" }).success,
      ).toBe(true);
    },
  );

  it("requires a reference name and validates the source without affecting portable import", () => {
    const values = { ...skillFormValues(), mode: "register" as const, url: "not a repository" };
    expect(skillFormSchema().safeParse(values).success).toBe(false);
    expect(buildSkillRegistration(values)).toBeNull();
    expect(
      skillFormSchema().safeParse({ ...values, name: "skill", url: "git@git.example.test:team/skill.git" }).success,
    ).toBe(true);
  });

  it("checks archive preference and digest constraints and allows clearing a preference during source replacement", () => {
    const values = {
      ...skillFormValues(),
      mode: "register" as const,
      name: "skill",
      url: "https://github.com/example/skill",
      installationPreference: "available",
    };
    expect(skillFormSchema().safeParse(values).success).toBe(false);
    const archive = { ...values, url: "https://artifacts.example.test/skill.zip", installationPreference: "required" };
    expect(skillFormSchema().safeParse(archive).success).toBe(false);
    expect(skillFormSchema().safeParse({ ...archive, sha256: "invalid" }).success).toBe(false);
    expect(skillFormSchema().safeParse({ ...archive, sha256: "a".repeat(64) }).success).toBe(true);
    const published = { ...skill, installation_preference: "required" as const };
    const replacement = { ...skillFormValues(published), mode: "replace" as const, url: values.url };
    expect(skillFormSchema(published).safeParse(replacement).success).toBe(false);
    expect(skillFormSchema(published).safeParse({ ...replacement, installationPreference: "" }).success).toBe(true);
  });

  it.each(["required", "auto_install"])(
    "allows %s for an unchanged managed portable source without relaxing reference digest checks",
    (installationPreference) => {
      const managed: SkillHubSkill = {
        ...skill,
        source: { source: "archive", url: "/skill-hub/skills/shared-skill/archive" },
        content_url: "/skill-hub/skills/shared-skill/content",
      };
      const values = { ...skillFormValues(managed), installationPreference };
      expect(skillFormSchema(managed).safeParse(values).success).toBe(true);
      const update = buildSkillUpdate(values, managed);
      expect(update.installation_preference).toBe(installationPreference);
      expect(update).not.toHaveProperty("source");

      const reference = { ...managed, content_url: null };
      expect(skillFormSchema(reference).safeParse(values).error?.issues).toContainEqual(
        expect.objectContaining({ path: ["installationPreference"] }),
      );
      for (const mode of ["register", "replace"] as const) {
        const replacement = { ...values, mode, url: "https://artifacts.example.test/skill.zip" };
        expect(skillFormSchema(managed).safeParse(replacement).error?.issues).toContainEqual(
          expect.objectContaining({ path: ["installationPreference"] }),
        );
        expect(skillFormSchema(managed).safeParse({ ...replacement, sha256: "a".repeat(64) }).success).toBe(true);
      }
    },
  );

  it.each(["required", "auto_install"])(
    "allows %s for an unchanged pending archive only with explicit archive state",
    (installationPreference) => {
      const pending: SkillHubSkill = {
        ...skill,
        source: { source: "archive", url: "/skill-hub/skills/shared-skill/archive" },
        content_url: null,
      };
      const values = { ...skillFormValues(pending), installationPreference };
      const schema = skillFormSchema(pending, true);
      expect(schema.safeParse(values).success).toBe(true);
      const metadata = buildSkillMetadata(values, pending);
      expect(metadata.installation_preference).toBe(installationPreference);
      expect(metadata).not.toHaveProperty("source");
      expect(skillFormSchema(pending, false).safeParse(values).error?.issues).toContainEqual(
        expect.objectContaining({ path: ["installationPreference"] }),
      );
      expect(skillFormSchema(skill, true).safeParse(values).error?.issues).toContainEqual(
        expect.objectContaining({ path: ["installationPreference"] }),
      );
      for (const mode of ["register", "replace"] as const) {
        const reference = { ...values, mode, url: "https://artifacts.example.test/skill.zip" };
        expect(schema.safeParse(reference).error?.issues).toContainEqual(
          expect.objectContaining({ path: ["installationPreference"] }),
        );
        expect(schema.safeParse({ ...reference, sha256: "invalid" }).error?.issues).toContainEqual(
          expect.objectContaining({ path: ["sha256"] }),
        );
        expect(schema.safeParse({ ...reference, sha256: "a".repeat(64) }).success).toBe(true);
      }
    },
  );

  it("requires an author name for an email and permits version-only archive replacement", () => {
    const values = {
      ...skillFormValues(),
      mode: "register" as const,
      name: "skill",
      url: "github.com/example/skill",
      authorEmail: "author@example.test",
    };
    expect(skillFormSchema().safeParse(values).success).toBe(false);
    expect(skillFormSchema().safeParse({ ...values, authorName: "Maintainer" }).success).toBe(true);
    const replacement = { ...skillFormValues(skill), mode: "upload", archiveFile, version: "3.0.0" };
    expect(skillFormSchema(skill).safeParse(replacement).success).toBe(true);
  });
});
