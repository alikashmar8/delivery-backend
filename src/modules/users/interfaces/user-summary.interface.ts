export interface UserSummary {
  id: string;
  phone: string;
  email: string | null;
  displayName: string;
  status: string;
  locale: string;
  country: string;
  createdAt: Date;
  driverProfile: {
    id: string;
    vehicleType: string;
    availability: string;
    active: boolean;
  } | null;
}
