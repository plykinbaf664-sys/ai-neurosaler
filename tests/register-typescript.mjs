import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "test:server-only", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const base = fileURLToPath(new URL(specifier.slice(2), root));
      const file = [base, `${base}.ts`, `${base}/index.ts`].find((name) => existsSync(name) && /\.(ts|json)$/.test(name));
      if (!file) throw new Error(`Cannot resolve ${specifier}`);
      return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "test:server-only") return { format: "module", source: "export {};", shortCircuit: true };
    if (url.startsWith(root.href) && url.endsWith(".json")) {
      return { format: "module", source: `export default ${readFileSync(new URL(url), "utf8")}`, shortCircuit: true };
    }
    if (url.startsWith(root.href) && url.endsWith(".ts")) {
      return { format: "module", source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      }).outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
