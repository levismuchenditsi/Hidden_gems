export interface PlaceRecord {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  country_code: string | null;
  county_id: string | null;
  town_id: string | null;
  location: unknown;
  price_min: number | null;
  price_max: number | null;
  currency_code: string | null;
  status: string;
  cover_photo_path: string | null;
  avg_rating: number | null;
  rating_count: number | null;
  like_count: number | null;
  author_id: string | null;
  categories?: { name: string } | null;
}

export interface ProfileRecord {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_path: string | null;
  bio: string | null;
  country_code: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
}
