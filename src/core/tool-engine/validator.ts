import Ajv from "ajv";
const ajv = new Ajv({ allErrors: true, removeAdditional: "fail" });

const toolSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    runner: { type: "string", enum: ["builtin", "py-runner", "js-runner"] },
    schema: { type: "object" },
    permissions: { type: "array", items: { type: "string" } },
  },
  required: ["id", "name", "runner"],
  additionalProperties: false,
};

const validateTool = ajv.compile(toolSchema);

export function validateToolDef(def) {
  const ok = validateTool(def);
  if (!ok) throw new Error("Invalid tool definition: " + ajv.errorsText(validateTool.errors));
  return true;
}