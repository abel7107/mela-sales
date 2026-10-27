import pool from "../../src/config/database.js";

/**
 * Deletes every row created by the integration suite, in dependency order.
 * Foreign keys in the schema are ON DELETE RESTRICT, so order matters.
 */
export async function cleanupBusiness(businessId: string): Promise<void> {
  const tables: [string, string][] = [
    ["audit_events", "business_id"],
    ["payments", "business_id"],
    ["invoices", "business_id"],
    ["invoice_sequences", "business_id"],
    ["sale_lines", "business_id"],
    ["sales", "business_id"],
    ["customers", "business_id"],
    ["product_services", "business_id"],
    ["business_memberships", "business_id"],
    ["businesses", "id"],
  ];

  for (const [table, column] of tables) {
    await pool.execute(`DELETE FROM ${table} WHERE ${column} = ?`, [
      businessId,
    ]);
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
