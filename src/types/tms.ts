export type LoadStatus = 'UNASSIGNED' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'INVOICED' | 'PAID';

export type LocationType = 'shipper' | 'receiver';
export type StopType = 'pickup' | 'delivery';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'available' | 'on_route' | 'off_duty';
  current_location: string;
  truck_number: string;
  license_number: string | null;
  license_state: string | null;
  license_expiration: string | null;
  medical_card_number: string | null;
  medical_card_expiration: string | null;
  hire_date: string | null;
  termination_date: string | null;
  employment_status: 'active' | 'terminated';
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  created_at: string;
}

export type DriverFileCategory = 'medical_card' | 'drivers_license' | 'mvr' | 'drug_test' | 'training_cert' | 'insurance' | 'contract' | 'other';

export interface DriverFile {
  id: string;
  driver_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: DriverFileCategory;
  description: string | null;
  uploaded_at: string;
  created_at: string;
}


export interface Customer {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  notes: string;
  has_fuel_surcharge: boolean;
  created_at: string;
}


export interface Location {
  id: string;
  company_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  contact_phone: string;
  instructions: string;
  rate: number;
  location_type: LocationType;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number | null;
  created_at: string;
}


export interface LoadStop {
  id: string;
  load_id: string;
  location_id: string | null;
  location?: Location;
  stop_type: StopType;
  stop_sequence: number;
  company_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  contact_phone: string;
  instructions: string;
  created_at: string;
}

// Legacy - keeping for backward compatibility
export interface Destination {
  id: string;
  company_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  contact_phone: string;
  delivery_instructions: string;
  rate: number;
  created_at: string;
}

export interface Load {
  id: string;
  load_number: string;
  bol_number: string | null;
  customer_id: string | null;
  customer?: Customer;
  origin_city: string;
  origin_state: string;
  origin_address: string;
  dest_city: string;
  dest_state: string;
  dest_address: string;
  dest_company: string;
  destination_id: string | null;
  destination?: Destination;
  stops?: LoadStop[];
  pickup_date: string;
  delivery_date: string;
  cargo_description: string;
  weight: number;
  status: LoadStatus;
  driver_id: string | null;
  driver?: Driver;
  rate: number;
  extra_stop_fee: number;
  lumper_fee: number;
  total_miles: number | null;
  tracking_enabled: boolean;
  auto_invoice: boolean;
  acceptance_token: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  trip_number: string | null;
  created_at: string;
}




export interface RateMatrix {
  id: string;
  city: string;
  state: string;
  base_rate: number;
  per_mile_rate: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  load_id: string;
  load?: Load;
  amount: number;
  status: 'PENDING' | 'PAID';
  emailed_at: string | null;
  emailed_to: string | null;
  created_at: string;
  paid_at: string | null;
}


export type PaymentMethod = 'check' | 'ach' | 'wire' | 'credit_card' | 'cash' | 'other';

export interface Payment {
  id: string;
  invoice_id: string;
  load_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  check_number: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';


export interface PODDocument {
  id: string;
  load_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  uploaded_at: string;
}


export interface GeofenceTimestamp {
  id: string;
  load_id: string;
  stop_id: string | null;
  stop_type: 'pickup' | 'delivery';
  event_type: 'arrived' | 'departed';
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  verified: boolean;
  verification_method: string;
  created_at: string;
}

export interface CompanySettings {
  company_name: string;
  company_address: string;
  company_city: string;
  company_state: string;
  company_zip: string;
  company_phone: string;
  company_email: string;
}


export interface HistoricalMarker {
  id: string;
  marker_id: string;
  title: string;
  subtitle: string | null;
  description: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  county: string;
  year_erected: number | null;
  erected_by: string | null;
  distance_meters?: number;
}


// IFTA Types
export interface IFTATrip {
  id: string;
  driver_id: string | null;
  load_id: string | null;
  truck_number: string;
  quarter: number;
  year: number;
  trip_date: string;
  origin_state: string;
  origin_city: string | null;
  destination_state: string;
  destination_city: string | null;
  total_miles: number;
  notes: string | null;
  created_at: string;
  // Joined
  states?: IFTATripState[];
  driver?: Driver;
  load?: Load;
}

export interface IFTATripState {
  id: string;
  ifta_trip_id: string;
  state: string;
  miles: number;
  created_at: string;
}

export interface IFTAFuelPurchase {
  id: string;
  truck_number: string;
  quarter: number;
  year: number;
  purchase_date: string;
  state: string;
  gallons: number;
  price_per_gallon: number | null;
  total_cost: number | null;
  vendor: string | null;
  city: string | null;
  receipt_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface IFTAStateSummary {
  state: string;
  totalMiles: number;
  taxableMiles: number;
  taxPaidGallons: number;
  taxRate: number;
  taxOwed: number;
  taxPaid: number;
  netTax: number;
  mpg: number;
  taxableGallons: number;
}
