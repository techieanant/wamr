export interface SetupStatus {
  id: number;
  isCompleted: boolean;
  completedAt: Date | null;
  createdAt: Date;
}

export interface CreateSetupStatus {
  isCompleted: boolean;
  completedAt?: Date;
}

export interface BackupCode {
  id: number;
  adminUserId: number;
  codeHash: string;
  isUsed: boolean;
  usedAt: Date | null;
  createdAt: Date;
}

export interface CreateBackupCode {
  adminUserId: number;
  codeHash: string;
}

export interface SetupAdminRequest {
  username: string;
  password: string;
}

export interface SetupResponse {
  success: boolean;
  data: {
    message: string;
    backupCodes: string[];
  };
}
