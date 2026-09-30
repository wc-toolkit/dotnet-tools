export interface CemAttribute {
  name: string;
  type?: { text: string };
  parsedType?: CemTypeValue;
  default?: string;
  description?: string;
  privacy?: CemPrivacy;
}

/** Visibility of a CEM member. Absent means the manifest did not specify one. */
export type CemPrivacy = "public" | "private" | "protected" | (string & {});

export interface CemMember {
  kind?: string;
  name: string;
  type?: { text: string };
  parsedType?: CemTypeValue;
  default?: string;
  description?: string;
  attribute?: string;
  privacy?: CemPrivacy;
  parameters?: CemParameter[];
  return?: { type?: CemTypeValue; parsedType?: CemTypeValue };
}

export interface CemType {
  text?: string;
}

export type CemTypeValue = CemType | string;

export interface CemParameter {
  name: string;
  type?: { text: string };
  parsedType?: CemTypeValue;
  optional?: boolean;
  rest?: boolean;
}

export interface CemEvent {
  name: string;
  type?: { text: string };
  parsedType?: CemTypeValue;
  detail?: CemTypeValue;
  description?: string;
}

export interface CemSlot {
  name?: string;
  description?: string;
}

export interface CemDeclaration {
  kind: string;
  name: string;
  customElement?: boolean;
  tagName?: string;
  attributes?: CemAttribute[];
  members?: CemMember[];
  events?: CemEvent[];
  slots?: CemSlot[];
  ssr?: { slotPresenceHints?: string[] };
  description?: string;
  summary?: string;
}

export interface CemModule {
  path: string;
  declarations?: CemDeclaration[];
}

export interface CemPackage {
  schemaVersion: string;
  modules: CemModule[];
}

export type CustomElementDecl = CemDeclaration & { tagName: string };

export function getCemTypeText(value: unknown, typeField = "parsedType"): string | undefined {
  const getText = (type: CemTypeValue | undefined): string | undefined =>
    typeof type === "string" ? type : type?.text;
  const record = value as Record<string, CemTypeValue | undefined> | undefined;
  const preferred = getText(record?.[typeField]);
  return preferred ?? getText(record?.parsedType) ?? getText(record?.type);
}

export function isFormAssociated(decl: CustomElementDecl): boolean {
  return (
    decl.members?.some((member) => member.name === "formAssociated" && isExposedMember(member)) ??
    false
  );
}

/**
 * Private and protected members are implementation details rather than part of a custom
 * element's public surface, so they are never generated. An absent `privacy` means the manifest
 * did not specify one, and such members stay visible.
 */
export function isExposedMember(member: { privacy?: CemPrivacy }): boolean {
  const privacy = member.privacy?.toLowerCase();
  return privacy !== "private" && privacy !== "protected";
}

export function getCustomElementDeclarations(manifest: CemPackage): CustomElementDecl[] {
  const results: CustomElementDecl[] = [];
  for (const mod of manifest.modules ?? []) {
    for (const decl of mod.declarations ?? []) {
      if (decl.customElement && decl.tagName) {
        const members = (decl.members ?? []).filter(isExposedMember);
        const declared = decl.attributes?.filter(isExposedMember);
        const attributes =
          declared ??
          members
            .filter((member) => member.attribute)
            .map((member) => ({
              name: member.attribute!,
              type: member.type,
              parsedType: member.parsedType,
              default: member.default,
              description: member.description,
            }));

        results.push({
          ...decl,
          description: decl.description ?? decl.summary,
          members,
          attributes,
        } as CustomElementDecl);
      }
    }
  }
  return results;
}
