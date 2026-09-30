import type { CemPackage, CemMember, CustomElementDecl } from "../shared/cem-types.js";
import {
  getCemTypeText,
  getCustomElementDeclarations,
  isExposedMember,
  isFormAssociated,
} from "../shared/cem-types.js";
import { toPascalCase } from "../shared/naming.js";
import {
  mapCemType,
  booleanAttributeMode,
  type BooleanAttributeMode,
  type MappedType,
} from "../shared/type-mapping.js";

export interface BlazorAttributeModel {
  name: string;
  propertyName: string;
  mappedType: MappedType;
  description?: string;
  defaultValue?: string;
  typeName?: string;
  typeKind?: "enum" | "record";
  typeText?: string;
  /** How this attribute is written to the element; `onOff` when its element default is true. */
  booleanMode: BooleanAttributeMode;
}

/** True when the attribute is a boolean that must be written as an explicit on/off pair. */
export function isOnOffBoolean(attribute: BlazorAttributeModel): boolean {
  return attribute.mappedType.isBool && attribute.booleanMode === "onOff";
}

export interface BlazorEventModel {
  name: string;
  propertyName: string;
  description?: string;
  callbackType: string;
  useInterop: boolean;
  detailTypeName?: string;
}

export interface BlazorEnumModel {
  name: string;
  values: string[];
}

export interface BlazorRecordFieldModel {
  name: string;
  type: string;
}

export interface BlazorRecordModel {
  name: string;
  fields: BlazorRecordFieldModel[];
  kind: "event" | "object";
}

export interface BlazorTypeRegistry {
  enums: BlazorEnumModel[];
  records: BlazorRecordModel[];
}

export interface BlazorSlotModel {
  name: string;
  propertyName: string;
}

export interface BlazorMethodModel {
  member: CemMember;
  name: string;
  returnType?: string;
  returnTypeName?: string;
  parameters: Array<{
    name: string;
    type: string;
    typeName?: string;
    optional: boolean;
    typeText?: string;
  }>;
}

export interface BlazorComponentModel {
  declaration: CustomElementDecl;
  tagName: string;
  componentName: string;
  attributes: BlazorAttributeModel[];
  events: BlazorEventModel[];
  methods: BlazorMethodModel[];
  slots: BlazorSlotModel[];
  formValue?: BlazorAttributeModel;
  liveValueProperty?: string;
  ssrSlotHints: string[];
  typeRegistry: BlazorTypeRegistry;
}

export function createBlazorComponentModels(
  manifest: CemPackage,
  typeField?: string,
  formValueMembers = ["value", "checked"],
): BlazorComponentModel[] {
  const models = getCustomElementDeclarations(manifest).map((declaration) => {
    const attributes: BlazorAttributeModel[] = (declaration.attributes ?? []).map((attribute) => ({
      name: attribute.name,
      propertyName: toPascalCase(attribute.name),
      mappedType: mapCemType(getCemTypeText(attribute, typeField)),
      description: attribute.description,
      defaultValue: attribute.default,
      typeText: getCemTypeText(attribute, typeField),
      booleanMode: booleanAttributeMode(attribute.default),
    }));
    const methods: BlazorMethodModel[] = (declaration.members ?? [])
      .filter(
        (member) => isExposedMember(member) && (member.kind === "method" || member.parameters),
      )
      .map((member) => ({
        member,
        name: toPascalCase(member.name) + "Async",
        returnType: unwrapPromise(getCemTypeText(member.return, typeField)),
        parameters: (member.parameters ?? []).map((parameter) => ({
          name: parameter.name,
          type: mapCemType(getCemTypeText(parameter, typeField)).csType,
          optional: parameter.optional ?? false,
          typeText: getCemTypeText(parameter, typeField),
        })),
      }));

    const formEvents = declaration.events?.some(
      (event) => event.name === "change" || event.name === "input",
    );
    const formValue =
      isFormAssociated(declaration) && formEvents
        ? attributes.find((attribute) => formValueMembers.includes(attribute.name))
        : undefined;

    return {
      declaration,
      tagName: declaration.tagName,
      componentName: toPascalCase(declaration.tagName),
      attributes,
      events: (declaration.events ?? []).map((event) => {
        const callbackType = standardEventType(event.name);
        const detailFields = parseObjectType(resolveEventDetailType(event, typeField));
        const detailTypeName = detailFields
          ? `${toPascalCase(declaration.tagName)}${toPascalCase(event.name)}EventArgs`
          : undefined;
        return {
          name: event.name,
          propertyName: "On" + toPascalCase(event.name),
          description: event.description,
          callbackType: detailTypeName ?? callbackType,
          useInterop: callbackType === "CustomEventArgs",
          detailTypeName,
        };
      }),
      methods,
      slots: (declaration.slots ?? []).map((slot) => ({
        name: !slot.name || slot.name === "default" ? "" : slot.name,
        propertyName:
          !slot.name || slot.name === "default"
            ? "ChildContent"
            : toPascalCase(slot.name) + "Content",
      })),
      formValue,
      liveValueProperty: formValue?.name,
      ssrSlotHints: declaration.ssr?.slotPresenceHints ?? [],
      typeRegistry: { enums: [], records: [] },
    };
  });

  const enums: BlazorEnumModel[] = [];
  const records: BlazorRecordModel[] = [];
  for (const model of models) {
    for (const attribute of model.attributes) {
      const recordFields = parseObjectType(attribute.typeText);
      if (recordFields) {
        attribute.typeName = `${model.componentName}${attribute.propertyName}Value`;
        attribute.typeKind = "record";
        addRecord(records, attribute.typeName, recordFields, "object");
      }
      if (attribute.mappedType.isUnion && attribute.mappedType.unionValues) {
        attribute.typeName = `${model.componentName}${attribute.propertyName}Value`;
        attribute.typeKind = "enum";
        if (!enums.some((entry) => entry.name === attribute.typeName)) {
          enums.push({ name: attribute.typeName, values: attribute.mappedType.unionValues });
        }
      }
    }
    for (const method of model.methods) {
      for (const parameter of method.parameters) {
        const fields = parseObjectType(parameter.typeText);
        if (fields) {
          parameter.typeName = `${model.componentName}${toPascalCase(method.member.name)}${toPascalCase(parameter.name.replace(/[^A-Za-z0-9]+/g, "-"))}`;
          addRecord(records, parameter.typeName, fields, "object");
        }
      }
      const returnFields = parseObjectType(method.returnType);
      if (returnFields) {
        method.returnTypeName = `${model.componentName}${toPascalCase(method.member.name)}Result`;
        addRecord(records, method.returnTypeName, returnFields, "object");
      }
    }
    for (const event of model.events) {
      const source = model.declaration.events?.find((candidate) => candidate.name === event.name);
      const fields = parseObjectType(
        source ? resolveEventDetailType(source, typeField) : undefined,
      );
      if (
        event.detailTypeName &&
        fields &&
        !records.some((record) => record.name === event.detailTypeName)
      ) {
        records.push({ name: event.detailTypeName, fields, kind: "event" });
      }
    }
  }
  const typeRegistry = { enums, records };
  return models.map((model) => ({ ...model, typeRegistry }));
}

function addRecord(
  records: BlazorRecordModel[],
  name: string,
  fields: BlazorRecordFieldModel[],
  kind: BlazorRecordModel["kind"],
): void {
  if (!records.some((record) => record.name === name)) records.push({ name, fields, kind });
}

function parseObjectType(type?: string): BlazorRecordFieldModel[] | undefined {
  const trimmed = type?.trim();
  if (!trimmed?.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  const fields: BlazorRecordFieldModel[] = [];
  for (const member of splitTopLevel(trimmed.slice(1, -1))) {
    const colon = findTopLevelColon(member);
    if (colon < 0) continue;
    const name = member.slice(0, colon).trim().replace(/["']/g, "").replace(/\?$/, "");
    const fieldType = member.slice(colon + 1).trim();
    if (name && fieldType) fields.push({ name, type: mapCemType(fieldType).csType });
  }
  return fields.length > 0 ? fields : undefined;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if ("<{[(".includes(character)) depth++;
    if (">}] )".includes(character)) depth = Math.max(0, depth - 1);
    if (depth === 0 && (character === "," || character === ";")) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function findTopLevelColon(text: string): number {
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if ("<{[(".includes(character)) depth++;
    if (">}] )".includes(character)) depth = Math.max(0, depth - 1);
    if (character === ":" && depth === 0) return index;
  }
  return -1;
}

function getTypeValueText(value: unknown): string | undefined {
  return typeof value === "string" ? value : (value as { text?: string } | undefined)?.text;
}

function resolveEventDetailType(
  event: { type?: unknown; parsedType?: unknown; detail?: unknown },
  typeField?: string,
): string | undefined {
  const detail = getTypeValueText(event.detail);
  if (detail) return detail;

  const preferred = getTypeValueText((event as Record<string, unknown>)[typeField ?? "parsedType"]);
  const type = preferred ?? getTypeValueText(event.parsedType) ?? getTypeValueText(event.type);
  const match = type?.match(/^(?:CustomEvent|Event)<(.+)>$/);
  return match?.[1] ?? type;
}

function standardEventType(name: string): string {
  if (
    [
      "click",
      "dblclick",
      "mousedown",
      "mouseup",
      "mousemove",
      "mouseenter",
      "mouseleave",
      "mouseover",
      "mouseout",
      "contextmenu",
    ].includes(name)
  ) {
    return "MouseEventArgs";
  }
  if (
    [
      "pointerdown",
      "pointerup",
      "pointermove",
      "pointerenter",
      "pointerleave",
      "pointerover",
      "pointerout",
      "pointercancel",
    ].includes(name)
  ) {
    return "PointerEventArgs";
  }
  if (["focus", "blur", "focusin", "focusout"].includes(name)) return "FocusEventArgs";
  if (["keydown", "keyup", "keypress"].includes(name)) return "KeyboardEventArgs";
  if (["change", "input", "beforeinput"].includes(name)) return "ChangeEventArgs";
  if (["touchstart", "touchmove", "touchend", "touchcancel"].includes(name)) {
    return "TouchEventArgs";
  }
  if (
    ["drag", "dragstart", "dragend", "dragenter", "dragleave", "dragover", "drop"].includes(name)
  ) {
    return "DragEventArgs";
  }
  if (["copy", "cut", "paste"].includes(name)) return "ClipboardEventArgs";
  if (name === "wheel") return "WheelEventArgs";
  if (name === "progress") return "ProgressEventArgs";
  if (name === "error") return "Microsoft.AspNetCore.Components.Web.ErrorEventArgs";
  if (
    [
      "submit",
      "reset",
      "invalid",
      "load",
      "scroll",
      "resize",
      "compositionstart",
      "compositionupdate",
      "compositionend",
    ].includes(name)
  ) {
    return "EventArgs";
  }
  return "CustomEventArgs";
}

function unwrapPromise(type?: string): string | undefined {
  const match = type?.trim().match(/^Promise<(.+)>$/);
  return match?.[1] ?? type;
}
