/**
 * Build SAM template from distributed templates
 *
 * Merges:
 * - stacks/base.yaml (Globals, Parameters)
 * - functions/[name]/template.yaml (all Lambda definitions)
 * - stacks/outputs.yaml (Outputs)
 *
 * Usage: bun run scripts/build-template.ts
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIR = join(import.meta.dirname, "..");
const STACKS_DIR = join(ROOT_DIR, "stacks");
const FUNCTIONS_DIR = join(ROOT_DIR, "functions");
const OUTPUT_FILE = join(ROOT_DIR, "template.yaml");

function findFunctionTemplates(): string[] {
  const templates: string[] = [];
  const dirs = readdirSync(FUNCTIONS_DIR);

  for (const dir of dirs) {
    const templatePath = join(FUNCTIONS_DIR, dir, "template.yaml");
    try {
      if (statSync(templatePath).isFile()) {
        templates.push(templatePath);
      }
    } catch {
      // No template.yaml in this directory
    }
  }

  return templates.sort();
}

function buildTemplate() {
  const lines: string[] = [];

  // 1. Base (Globals, Parameters)
  const baseContent = readFileSync(join(STACKS_DIR, "base.yaml"), "utf-8");
  lines.push(baseContent.trimEnd());
  lines.push("");
  lines.push("Resources:");

  // 2. Function templates
  const functionTemplates = findFunctionTemplates();
  for (const templatePath of functionTemplates) {
    const content = readFileSync(templatePath, "utf-8");
    lines.push("");
    const resourceContent = content
      .split("\n")
      .map((line) => {
        if (line.trim() === "") return "";
        return `  ${line}`;
      })
      .join("\n");
    lines.push(resourceContent);
  }

  // 3. Outputs
  const outputsContent = readFileSync(join(STACKS_DIR, "outputs.yaml"), "utf-8");
  lines.push("");
  lines.push("Outputs:");
  const outputContent = outputsContent
    .split("\n")
    .filter((line) => !line.startsWith("#") && line.trim() !== "")
    .map((line) => `  ${line}`)
    .join("\n");
  lines.push(outputContent);

  const output = lines.join("\n").trimEnd() + "\n";
  writeFileSync(OUTPUT_FILE, output);

  console.log(`✅ Built template.yaml`);
  console.log(`   Base: stacks/base.yaml`);
  console.log(`   Functions: ${functionTemplates.length} templates from functions/*/template.yaml`);
  console.log(`   Outputs: stacks/outputs.yaml`);
  console.log(`   Output: ${OUTPUT_FILE}`);
}

buildTemplate();
