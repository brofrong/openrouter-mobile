import { expect, test } from "bun:test";
import {
  parsePythonToolCode,
  SANDBOX_EXECUTE_TOOL,
  SANDBOX_EXECUTE_TOOL_NAME,
  sandboxBasename,
  sandboxSessionId,
  workspaceFilesPreamble,
} from "../src/shared/python-tool";

test("sandbox execute tool exposes a code parameter", () => {
  expect(SANDBOX_EXECUTE_TOOL.function.name).toBe(SANDBOX_EXECUTE_TOOL_NAME);
  expect(SANDBOX_EXECUTE_TOOL.function.parameters).toMatchObject({
    required: ["code"],
  });
  expect(SANDBOX_EXECUTE_TOOL.function.description).toContain(
    "openpyxl for .xlsx",
  );
  expect(SANDBOX_EXECUTE_TOOL.function.description).toContain(
    "python-docx for .docx",
  );
  expect(SANDBOX_EXECUTE_TOOL.function.description).toContain(
    "reportlab for .pdf",
  );
  expect(SANDBOX_EXECUTE_TOOL.function.description).toContain(
    "python-pptx for .pptx",
  );
  expect(SANDBOX_EXECUTE_TOOL.function.description).toContain(
    "pandas for .csv",
  );
  expect(SANDBOX_EXECUTE_TOOL.function.description).toContain("pypandoc");
});

test("parsePythonToolCode reads JSON code", () => {
  expect(parsePythonToolCode('{"code":"print(1)"}')).toBe("print(1)");
  expect(parsePythonToolCode("{}")).toBeUndefined();
  expect(parsePythonToolCode("not-json")).toBeUndefined();
});

test("sandboxSessionId sanitizes user and chat ids", () => {
  expect(sandboxSessionId("user/1", "chat-2")).toBe("user1_chat-2");
  expect(sandboxBasename("uploads/../Report X.xlsx")).toBe("Report_X.xlsx");
});

test("workspaceFilesPreamble lists live sandbox files", () => {
  expect(workspaceFilesPreamble([])).toBeUndefined();
  expect(
    workspaceFilesPreamble([
      { path: "report.xlsx", size: 12, mime: "application/xlsx" },
    ]),
  ).toContain("report.xlsx");
});
