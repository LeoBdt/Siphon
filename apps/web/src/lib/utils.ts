import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Shared column for the document-like pages (Download, History, Settings) so
 * navigating between them never shifts the content width.
 * The file manager is deliberately full-width — it is an explorer.
 */
export const PAGE_COLUMN = "mx-auto w-full max-w-3xl px-6 py-10"
