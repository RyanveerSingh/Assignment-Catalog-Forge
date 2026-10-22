import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const ALLOWED: Record<string, string> = {
  "tiny-10.csv": "text/csv",
  "messy-120.csv": "text/csv",
  "messy-120.xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "photos-messy.zip": "application/zip",
  "semicolon-eu.csv": "text/csv",
  "broken-latin1.csv": "text/csv",
  "no-header.csv": "text/csv",
  "header-only.csv": "text/csv",
  "empty.csv": "text/csv",
  "fake.csv": "text/csv",
  "bulk-1000.csv": "text/csv",
  "bulk-10000.csv": "text/csv",
};

/** Serves the committed sample files so evaluators can download and re-upload them. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }): Promise<Response> {
  const { name } = await params;
  const mime = ALLOWED[name];
  if (!mime) return new Response("not found", { status: 404 });
  try {
    const data = await readFile(path.join(process.cwd(), "samples", name));
    return new Response(new Uint8Array(data), { headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
