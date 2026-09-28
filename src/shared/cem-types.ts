export interface CemAttribute {
  name: string;
  type?: { text: string };
  default?: string;
  description?: string;
}

export interface CemMember {
  name: string;
  type?: { text: string };
  default?: string;
  description?: string;
  attribute?: string;
}

export interface CemEvent {
  name: string;
  type?: { text: string };
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

export function getCustomElementDeclarations(manifest: CemPackage): CustomElementDecl[] {
  const results: CustomElementDecl[] = [];
  for (const mod of manifest.modules ?? []) {
    for (const decl of mod.declarations ?? []) {
      if (decl.customElement && decl.tagName) {
        const attributes =
          decl.attributes ??
          decl.members
            ?.filter((member) => member.attribute)
            .map((member) => ({
              name: member.attribute!,
              type: member.type,
              default: member.default,
              description: member.description,
            }));

        results.push({
          ...decl,
          description: decl.description ?? decl.summary,
          attributes,
        } as CustomElementDecl);
      }
    }
  }
  return results;
}
