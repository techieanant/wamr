export type SettingValue = string | number | boolean | null;

export interface SettingModel {
  id: number;
  key: string;
  value: SettingValue;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSetting {
  key: string;
  value?: SettingValue;
}

export interface UpdateSetting {
  value?: SettingValue;
}
