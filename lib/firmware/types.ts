export type FirmwareInfo = {
  version: string;
  sourceUrl: string;
  releaseDate?: string; // ISO YYYY-MM-DD
};

export interface FirmwareAdapter {
  brand: string;
  supports(model: string): boolean;
  fetchLatest(model: string): Promise<FirmwareInfo>;
}

export type FirmwareCheckRow = {
  id: string;
  product_id: string;
  brand: string;
  model: string;
  latest_version: string | null;
  source_url: string | null;
  release_date: string | null;
  status: 'ok' | 'error' | 'unsupported';
  error_message: string | null;
  last_checked_at: string;
  last_changed_at: string | null;
  seen_version: string | null;
  created_at: string;
};
