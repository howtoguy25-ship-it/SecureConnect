export interface LiveShareDoc {
  id: string;
  createdBy: string;
  lat: number;
  lng: number;
  heading: number | null;
  etaText: string;
  arrivalClockText: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
