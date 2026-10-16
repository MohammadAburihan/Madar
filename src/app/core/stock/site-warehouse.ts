/**
 * The shared warehouse that holds every project's site stock (each project's share is its ledger rows). Only the
 * project flows move stock in or out of it; selling, receiving and plain moves leave it out.
 */
export const SITE_WAREHOUSE_NAME = 'Project sites';
