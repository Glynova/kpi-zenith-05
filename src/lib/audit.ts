import { db } from "@/lib/db";

export async function logDocumentEvent(
  businessId: string,
  action: "PRINT" | "REPRINT" | "EXPORT",
  module: string,
  recordId: string,
  details?: Record<string, unknown>,
) {
  const { error } = await db.rpc("log_document_event", {
    _business_id: businessId,
    _action: action,
    _module: module,
    _record_id: recordId,
    _details: details ?? null,
  });
  if (error) throw error;
}

export async function logPrintEvent(
  businessId: string,
  module: string,
  recordId: string,
  details?: Record<string, unknown>,
) {
  const { count, error: lookupError } = await db
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("module", module)
    .eq("record_id", recordId)
    .in("action", ["PRINT", "REPRINT"]);
  if (lookupError) throw lookupError;
  const action = count ? "REPRINT" : "PRINT";
  await logDocumentEvent(businessId, action, module, recordId, details);
  return action;
}
