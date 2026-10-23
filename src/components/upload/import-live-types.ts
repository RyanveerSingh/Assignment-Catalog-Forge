import type { serializeImport } from "@/lib/serializers";

/** Exactly what the imports API returns; the pages serialize with the same function, so UI and API cannot drift. */
export type ImportDto = ReturnType<typeof serializeImport>;

export interface ImportEventDto {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
  data: Record<string, unknown> | null;
  createdAt: string;
}
