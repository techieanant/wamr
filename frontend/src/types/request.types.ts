export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'FAILED';
export type MediaType = 'movie' | 'series';
export type ServiceType = 'radarr' | 'sonarr' | 'overseerr';

export interface MediaRequest {
  id: number;
  phoneNumberHash: string;
  phoneNumberEncrypted?: string;
  mediaType: MediaType;
  title: string;
  year?: number;
  tmdbId?: number;
  tvdbId?: number;
  serviceType?: ServiceType;
  serviceConfigId?: number;
  status: RequestStatus;
  submittedAt?: string;
  errorMessage?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequestsResponse {
  requests: MediaRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DeleteRequestResponse {
  success: boolean;
  message: string;
}

export interface UpdateStatusRequest {
  status: RequestStatus;
  adminNotes?: string;
}

export interface UpdateStatusResponse {
  success: boolean;
  message: string;
}
