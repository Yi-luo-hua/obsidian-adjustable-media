import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";

/** Load real adapter code with explicit host dependencies and no files emitted. */
export async function mockedModule<T>(url: URL, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): Promise<T> {
  const compiled = await transform(await readFile(url, "utf8"), { loader: "ts", format: "cjs" });
  const module = { exports: {} };
  runInNewContext(compiled.code, { ...globals, module, exports: module.exports,
    require(id: string) {
      if (!(id in dependencies)) throw new Error(`Unexpected adapter dependency: ${id}`);
      return dependencies[id];
    } });
  return module.exports as T;
}
