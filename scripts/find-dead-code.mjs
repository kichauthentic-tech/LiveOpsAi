// Tìm code chết: file không ai import tới, và export không file nào khác dùng (2026-10-02).
//
//   npm run audit:dead
//
// Dùng TypeScript language service (findReferences) nên bắt được cả kiểu, re-export, import động.
// Không chạy trong `npm test` vì mất ~1 phút. `tsc` (noUnusedLocals) chỉ bắt biến/hàm KHÔNG export;
// một hàm `export` mà không ai gọi thì tsc lẫn ESLint đều im — đó là phần script này lo.
//
// Đọc kết quả:
//   UNUSED FILE           — không đi tới được từ entry nào (main.tsx, server.ts, api/index.ts, tests).
//   TESTS ONLY            — chỉ test còn import: code production chết, test đang canh một xác chết.
//   DEAD EXPORT           — export không ai tham chiếu, kể cả trong chính file: xoá được. Xoá xong
//                           chạy lại — tầng helper bên dưới có thể vừa thành chết (tsc noUnusedLocals
//                           cũng sẽ báo những helper không export).
// Bỏ qua có chủ đích: shim alias trong vite.config.ts, file .d.ts, component nạp bằng lazy()/lazyNamed().
import ts from "typescript";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const rel = (f) => path.relative(root, f);
// --cached --others: gồm cả file mới chưa commit; lọc existsSync để bỏ file đã xoá mà chưa stage.
const files = execSync("git ls-files --cached --others --exclude-standard", { cwd: root })
  .toString()
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts"))
  .map((f) => path.join(root, f))
  .filter((f) => fs.existsSync(f));
const isTest = (f) => f.includes(`${path.sep}tests${path.sep}`) || /config\.ts$/.test(f);
// Nạp qua `resolve.alias` của vite.config.ts, không qua import nào.
const ALIAS_TARGETS = new Set(["src/shims/supabase-realtime.ts", "src/shims/supabase-storage.ts"]);

const cfg = ts.parseJsonConfigFileContent(JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8")), ts.sys, root);
const service = ts.createLanguageService({
  getScriptFileNames: () => files,
  getScriptVersion: () => "1",
  getScriptSnapshot: (f) => (fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, "utf8")) : undefined),
  getCurrentDirectory: () => root,
  getCompilationSettings: () => cfg.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories
});
const program = service.getProgram();
const checker = program.getTypeChecker();

// Đồ thị import + các export được nạp bằng tên qua import động: lazyNamed(() => import("x"), "Name").
const graph = new Map();
const lazyExports = new Map(); // file -> Set(tên export)
for (const f of files) {
  const deps = new Set();
  const resolve = (spec) => {
    const r = ts.resolveModuleName(spec, f, cfg.options, ts.sys).resolvedModule;
    return r && !r.isExternalLibraryImport ? path.resolve(r.resolvedFileName) : null;
  };
  const visit = (n) => {
    let spec;
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) spec = n.moduleSpecifier.text;
    const dyn = ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(n.arguments[0] ?? n);
    if (dyn) spec = n.arguments[0].text;
    if (spec) {
      const target = resolve(spec);
      if (target) {
        deps.add(target);
        if (dyn) {
          // lazy(() => import(x)) dùng `default`; lazyNamed(() => import(x), "Name") dùng "Name".
          let call = n.parent;
          while (call && !ts.isCallExpression(call)) call = call.parent;
          const nameArg = call?.arguments?.[1];
          const names = lazyExports.get(target) ?? new Set();
          names.add(nameArg && ts.isStringLiteral(nameArg) ? nameArg.text : "default");
          lazyExports.set(target, names);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(program.getSourceFile(f));
  graph.set(f, deps);
}
const reach = (entries) => {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of graph.get(f) ?? []) stack.push(d);
  }
  return seen;
};
const prodEntries = ["src/main.tsx", "server.ts", "api/index.ts"].map((f) => path.join(root, f));
const prod = reach(prodEntries);
const withTests = reach([...prodEntries, ...files.filter(isTest)]);

let findings = 0;
for (const f of files) {
  if (isTest(f) || prod.has(f) || ALIAS_TARGETS.has(rel(f))) continue;
  console.log(`${withTests.has(f) ? "TESTS ONLY " : "UNUSED FILE"}  ${rel(f)}`);
  findings++;
}

for (const f of files) {
  if (isTest(f) || ALIAS_TARGETS.has(rel(f))) continue;
  const sf = program.getSourceFile(f);
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) continue;
  for (const ex of checker.getExportsOfModule(moduleSymbol)) {
    if (lazyExports.get(f)?.has(ex.name)) continue;
    if (ex.name.startsWith("__")) continue; // quy ước: hook chỉ dành cho test (vd __resetInFlight)
    const decl = ex.declarations?.[0];
    if (!decl || decl.getSourceFile() !== sf) continue;
    const at = (decl.name ?? decl).getStart(sf);
    let internal = 0;
    let tests = 0;
    let external = 0;
    for (const group of service.findReferences(f, at) ?? []) {
      for (const r of group.references) {
        if (r.isDefinition) continue;
        const rf = path.resolve(r.fileName);
        if (rf === f) internal++;
        else if (isTest(rf)) tests++;
        else external++;
      }
    }
    // Dùng trong chính file (kể cả khi export thêm cho test) thì không phải code chết.
    if (external > 0 || internal > 0) continue;
    console.log(`${tests > 0 ? "TESTS ONLY " : "DEAD EXPORT"}  ${rel(f)}  ${ex.name}`);
    findings++;
  }
}
console.log(findings === 0 ? "Không tìm thấy code chết." : `\n${findings} mục cần xem.`);
