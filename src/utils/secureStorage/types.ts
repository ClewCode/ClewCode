export type SecureStorageData = Record<string, unknown>;

export interface SecureStorage {
  name: string;
  read(): SecureStorageData | null;
  readAsync(): Promise<SecureStorageData | null>;
  update(data: SecureStorageData): { success: boolean; warning?: string };
  delete(): boolean;
}
