export interface HerbItem {
  id: number | string;
  nameAr: string;
  nameEn: string;
  scientific: string;
  family?: string;
  system: string;
  target: string;
  active: string;
  dose: string;
  preparation?: string;
  safety: string;
  safetyLevel?: "آمن جداً" | "حذر معتدل" | "عالي الخطورة ويشترط إشراف طبي" | string;
  contraindications?: string;
  interactions?: string;
  historicalNote?: string;
  arabicHeritageCitation?: string;
  references?: string;
  isCustom?: boolean;
  addedAt?: string;
  description?: string;
  pharmacology?: string;
  benefits?: string[];
  price?: number;
  inStock?: boolean;
  packageOptions?: { label: string; price: number }[];
  imageUrl?: string;
  aiReviewed?: boolean;
  aiReviewedAt?: string;
}

export type ViewTab =
  | "catalog"
  | "store"
  | "store-admin"
  | "add-ai"
  | "comparison"
  | "checker"
  | "advisor"
  | "backup";

export interface CartItem {
  id: string; // unique item id (e.g. `${herbId}_${packageSize}`)
  herbId: number | string;
  nameAr: string;
  nameEn?: string;
  scientific?: string;
  packageSize: string;
  price: number;
  quantity: number;
  system?: string;
}

export interface StoreCustomerInfo {
  fullName: string;
  phone: string;
  city: string;
  address: string;
  notes?: string;
}

export interface StoreConfig {
  whatsappNumber: string;
  storeName: string;
  currency: string;
  freeShippingThreshold: number;
  shippingFee: number;
  markupPercentage?: number;
}

export interface DrugCheckResult {
  riskLevel: string;
  riskColor?: string;
  mechanism: string;
  clinicalAdvice: string;
  spacingHours?: string;
  summary: string;
  references?: string;
  traditionalNote?: string;
}

export interface RemedyProtocol {
  title: string;
  recommendedHerbs: {
    herbName: string;
    role: string;
    doseAndUsage: string;
  }[];
  preparationGuide: string;
  precautions: string;
  lifestyleTip?: string;
  arabicHeritageAdvice?: string;
  references?: string;
}

export interface DailyReminder {
  id: string;
  herbId: number | string;
  herbNameAr: string;
  herbScientific?: string;
  time: string; // HH:MM in 24h format (e.g., "08:30")
  dose?: string;
  timingNote?: string;
  isActive: boolean;
  daysOfWeek?: number[]; // [0,1,2,3,4,5,6] (0 = Sunday), empty/undefined = daily
  soundEnabled?: boolean;
  browserNotifyEnabled?: boolean;
  createdAt: string;
  lastTakenDate?: string;
}
