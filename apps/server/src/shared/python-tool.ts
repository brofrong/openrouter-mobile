export const SANDBOX_EXECUTE_TOOL_NAME = "execute";

export const SANDBOX_EXECUTE_TOOL = {
  type: "function" as const,
  function: {
    name: SANDBOX_EXECUTE_TOOL_NAME,
    description:
      "Run Python in a persistent workspace for this chat. Working directory is /workspace. User uploads are in /workspace/uploads/. Write output files into /workspace (they are returned as download URLs). Variables persist between calls in the same chat until the session is recycled. Use these installed packages: openpyxl for .xlsx spreadsheets; python-docx for .docx Word documents; reportlab for .pdf; python-pptx for .pptx decks; pandas for .csv (and tabular data); pypandoc (pandoc is installed) for .txt/.md conversion; numpy and matplotlib for arrays and plots (save figures as PNG in /workspace). Do not invent other libraries — only these are available.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["code"],
      properties: {
        code: {
          type: "string",
          description: "Python source to execute.",
        },
      },
    },
  },
} as const;

export const parsePythonToolCode = (raw: string): string | undefined => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed === null || typeof parsed !== "object") {
      return undefined;
    }
    const code = (parsed as { readonly code?: unknown }).code;
    return typeof code === "string" && code.trim().length > 0
      ? code
      : undefined;
  } catch {
    return undefined;
  }
};

export const sandboxSessionId = (userId: string, chatId: string): string => {
  const user = userId.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80);
  const chat = chatId.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80);
  const left = user.length > 0 ? user : "user";
  const right = chat.length > 0 ? chat : "chat";
  return `${left}_${right}`.slice(0, 200);
};

export const sandboxBasename = (name: string): string => {
  const trimmed = name.trim().replaceAll("\\", "/");
  const base = trimmed.split("/").at(-1) ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned.slice(0, 180) : "file";
};

export const workspaceFilesPreamble = (
  files: ReadonlyArray<{
    readonly path: string;
    readonly size: number;
    readonly mime: string;
  }>,
): string | undefined => {
  if (files.length === 0) {
    return undefined;
  }
  return `Python workspace files currently on disk:\n${files
    .map((file) => `- ${file.path} (${file.mime}, ${file.size} bytes)`)
    .join("\n")}`;
};
