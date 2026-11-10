import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

test("every action continuation crosses an explicit current-view checkpoint", () => {
  const root = new URL("../../apps/web/src/", import.meta.url);
  const violations = [];
  for (const file of fs
    .readdirSync(root)
    .filter((name) => name.endsWith(".tsx"))) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(new URL(file, root), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function inspect(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "run"
      ) {
        const callback = node.arguments[0];
        if (
          callback &&
          (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
        ) {
          function continuation(child) {
            if (
              ts.isAwaitExpression(child) &&
              !(
                ts.isCallExpression(child.expression) &&
                ts.isPropertyAccessExpression(child.expression.expression) &&
                child.expression.expression.name.text === "wait"
              )
            ) {
              violations.push(
                `apps/web/src/${file}:${source.getLineAndCharacterOfPosition(child.getStart()).line + 1}`,
              );
            }
            ts.forEachChild(child, continuation);
          }
          continuation(callback.body);
        }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
  assert.deepEqual(
    violations,
    [],
    "Await through view.wait() so a departed view cannot perform dependent writes or UI effects.",
  );
});
