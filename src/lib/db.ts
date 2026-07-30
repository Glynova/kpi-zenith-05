/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

/**
 * Loosely-typed data client. Generated Database types lag behind migrations,
 * so module screens use this thin wrapper for table access.
 */
export const db = supabase as any;

export type Row = Record<string, any>;
